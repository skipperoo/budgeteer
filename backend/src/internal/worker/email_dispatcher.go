package worker

import (
	"context"
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

	return smtp.SendMail(addr, auth, cfg.SMTPFrom, []string{to}, []byte(msg))
}
