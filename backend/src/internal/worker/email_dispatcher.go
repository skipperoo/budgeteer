package worker

import (
	"context"
	"crypto/tls"
	"fmt"
	"net/smtp"
	"time"

	"budgeteer-backend/internal/config"
	"budgeteer-backend/internal/logger"
	"budgeteer-backend/internal/repository"
)

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
	auth := smtp.PlainAuth("", cfg.SMTPUser, cfg.SMTPPassword, cfg.SMTPHost)

	if cfg.SMTPUseSSL {
		return sendMailSSL(addr, auth, cfg.SMTPFrom, []string{to}, []byte(msg))
	}

	return smtp.SendMail(addr, auth, cfg.SMTPFrom, []string{to}, []byte(msg))
}

// sendMailSSL sends email over an implicit TLS connection (SMTPS, port 465).
// Go's standard smtp.SendMail only supports STARTTLS (upgrading a plain
// connection), not direct SSL connections.
func sendMailSSL(addr string, auth smtp.Auth, from string, to []string, msg []byte) error {
	tlsCfg := &tls.Config{ServerName: hostFromAddr(addr)}

	conn, err := tls.Dial("tcp", addr, tlsCfg)
	if err != nil {
		return fmt.Errorf("tls dial: %w", err)
	}
	defer conn.Close()

	client, err := smtp.NewClient(conn, hostFromAddr(addr))
	if err != nil {
		return fmt.Errorf("smtp client: %w", err)
	}
	defer client.Close()

	if auth != nil {
		if err = client.Auth(auth); err != nil {
			return fmt.Errorf("smtp auth: %w", err)
		}
	}

	if err = client.Mail(from); err != nil {
		return fmt.Errorf("smtp mail: %w", err)
	}

	for _, rcpt := range to {
		if err = client.Rcpt(rcpt); err != nil {
			return fmt.Errorf("smtp rcpt %s: %w", rcpt, err)
		}
	}

	wc, err := client.Data()
	if err != nil {
		return fmt.Errorf("smtp data: %w", err)
	}
	if _, err = wc.Write(msg); err != nil {
		return fmt.Errorf("write body: %w", err)
	}
	if err = wc.Close(); err != nil {
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
