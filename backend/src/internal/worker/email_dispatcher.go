package worker

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"net"
	"net/smtp"
	"time"

	"budgeteer-backend/internal/config"
	"budgeteer-backend/internal/logger"
	"budgeteer-backend/internal/repository"
)

// loginAuth implements the SMTP AUTH LOGIN mechanism.
// Go's standard library only provides AUTH PLAIN, but some servers
// (e.g. Aruba) require the LOGIN mechanism.
type loginAuth struct {
	username string
	password string
}

func LoginAuth(username, password string) smtp.Auth {
	return &loginAuth{username, password}
}

func (a *loginAuth) Start(server *smtp.ServerInfo) (string, []byte, error) {
	if !server.TLS {
		return "", nil, errors.New("unencrypted connection")
	}
	return "LOGIN", nil, nil
}

func (a *loginAuth) Next(fromServer []byte, more bool) ([]byte, error) {
	if !more {
		return nil, nil
	}
	// RFC 4954: server sends base64-encoded prompts.
	// Common prompts (decoded): "Username:" and "Password:"
	switch {
	case containsIgnoreCase(string(fromServer), "username"):
		return []byte(a.username), nil
	case containsIgnoreCase(string(fromServer), "password"):
		return []byte(a.password), nil
	default:
		return nil, fmt.Errorf("unexpected server challenge: %s", string(fromServer))
	}
}

// containsIgnoreCase reports whether s contains substr (case-insensitive).
func containsIgnoreCase(s, substr string) bool {
	sLen := len(s)
	subLen := len(substr)
	if subLen == 0 {
		return true
	}
	if sLen < subLen {
		return false
	}
	for i := 0; i <= sLen-subLen; i++ {
		match := true
		for j := 0; j < subLen; j++ {
			if toLower(s[i+j]) != toLower(substr[j]) {
				match = false
				break
			}
		}
		if match {
			return true
		}
	}
	return false
}

func toLower(b byte) byte {
	if b >= 'A' && b <= 'Z' {
		return b + 32
	}
	return b
}

// smtpDialer creates a net.Dialer with sensible timeouts for SMTP connections.
// This mirrors the working implementation used in production for Aruba SMTP.
func smtpDialer() *net.Dialer {
	return &net.Dialer{
		Timeout: 15 * time.Second,
		Resolver: &net.Resolver{
			PreferGo: true,
			Dial: func(ctx context.Context, network, address string) (net.Conn, error) {
				d := net.Dialer{Timeout: 10 * time.Second}
				return d.DialContext(ctx, network, address)
			},
		},
	}
}

type EmailDispatcher struct {
	EmailRepo *repository.EmailRepository
	interval  time.Duration
	batchSize int
}

func NewEmailDispatcher() *EmailDispatcher {
	return &EmailDispatcher{
		EmailRepo: &repository.EmailRepository{},
		interval:  30 * time.Second,
		batchSize: 10,
	}
}

func (w *EmailDispatcher) Run(ctx context.Context) {
	logger.Info("Email dispatcher worker started")
	ticker := time.NewTicker(w.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			logger.Info("Email dispatcher worker stopped")
			return
		case <-ticker.C:
			w.processBatch(ctx)
		}
	}
}

func (w *EmailDispatcher) processBatch(ctx context.Context) {
	emails, err := w.EmailRepo.ListPending(ctx, w.batchSize)
	if err != nil {
		logger.Error("Email dispatcher: failed to fetch pending emails: %v", err)
		return
	}

	for _, email := range emails {
		if err := w.sendEmail(ctx, email.ToAddress, email.Subject, email.Body); err != nil {
			logger.Error("Email dispatcher: failed to send email to %s: %v", email.ToAddress, err)
			newRetry := email.RetryCount + 1
			if err := w.EmailRepo.IncrementRetry(ctx, email.ID, newRetry); err != nil {
				logger.Error("Email dispatcher: failed to update retry count: %v", err)
			}
		} else {
			if err := w.EmailRepo.MarkSent(ctx, email.ID); err != nil {
				logger.Error("Email dispatcher: failed to mark email sent: %v", err)
			}
		}
	}
}

func (w *EmailDispatcher) sendEmail(ctx context.Context, to, subject, body string) error {
	cfg := config.Cfg
	if cfg.SMTPHost == "" {
		logger.Warning("Email dispatcher: SMTP not configured, skipping email to %s", to)
		return nil
	}

	msg := fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: %s\r\n\r\n%s",
		cfg.SMTPFrom, to, subject, body)

	addr := fmt.Sprintf("%s:%s", cfg.SMTPHost, cfg.SMTPPort)

	if cfg.SMTPUseSSL {
		// Try LOGIN first (Aruba requires it), fall back to PLAIN on a fresh connection.
		return sendMailSSL(addr, cfg.SMTPFrom, []string{to}, []byte(msg),
			LoginAuth(cfg.SMTPUser, cfg.SMTPPassword),
			smtp.PlainAuth("", cfg.SMTPUser, cfg.SMTPPassword, cfg.SMTPHost))
	}

	auth := smtp.PlainAuth("", cfg.SMTPUser, cfg.SMTPPassword, cfg.SMTPHost)
	return smtp.SendMail(addr, auth, cfg.SMTPFrom, []string{to}, []byte(msg))
}

// sendMailSSL sends email over an implicit TLS connection (SMTPS, port 465).
// Go's standard smtp.SendMail only supports STARTTLS (upgrading a plain
// connection), not direct SSL connections.
//
// auths are authentication mechanisms to try sequentially. Each gets its own
// fresh TLS connection so a failed AUTH attempt doesn't leave the connection
// in a bad state for the next mechanism.
func sendMailSSL(addr, from string, to []string, msg []byte, auths ...smtp.Auth) error {
	var lastErr error

	for i, a := range auths {
		if a == nil {
			continue
		}

		if err := trySendMailSSL(addr, from, to, msg, a); err != nil {
			lastErr = err
			logger.Warning("Email dispatcher: auth mechanism %d failed: %v", i, err)
			continue
		}
		return nil
	}

	if lastErr != nil {
		return fmt.Errorf("smtp auth (all mechanisms failed): %w", lastErr)
	}
	return errors.New("smtp auth: no authentication mechanisms available")
}

// trySendMailSSL opens a fresh TLS connection, authenticates, and sends the
// message. This mirrors the working production implementation for Aruba SMTP.
func trySendMailSSL(addr, from string, to []string, msg []byte, a smtp.Auth) error {
	host := hostFromAddr(addr)
	tlsCfg := &tls.Config{
		ServerName: host,
	}
	dialer := smtpDialer()

	conn, err := tls.DialWithDialer(dialer, "tcp", addr, tlsCfg)
	if err != nil {
		return fmt.Errorf("tls dial: %w", err)
	}
	defer conn.Close()

	client, err := smtp.NewClient(conn, host)
	if err != nil {
		return fmt.Errorf("smtp client: %w", err)
	}
	defer client.Close()

	if err := client.Auth(a); err != nil {
		return fmt.Errorf("auth: %w", err)
	}

	if err := client.Mail(from); err != nil {
		return fmt.Errorf("mail: %w", err)
	}
	for _, rcpt := range to {
		if err := client.Rcpt(rcpt); err != nil {
			return fmt.Errorf("rcpt %s: %w", rcpt, err)
		}
	}

	wc, err := client.Data()
	if err != nil {
		return fmt.Errorf("data: %w", err)
	}
	if _, err := wc.Write(msg); err != nil {
		return fmt.Errorf("write body: %w", err)
	}
	if err := wc.Close(); err != nil {
		return fmt.Errorf("close body: %w", err)
	}

	return client.Quit()
}

// hostFromAddr extracts the hostname from "host:port".
func hostFromAddr(addr string) string {
	idx := lastColonIndex(addr)
	if idx < 0 {
		return addr
	}
	return addr[:idx]
}

// lastColonIndex finds the last colon in a string (port separator).
func lastColonIndex(s string) int {
	for i := len(s) - 1; i >= 0; i-- {
		if s[i] == ':' {
			return i
		}
	}
	return -1
}
