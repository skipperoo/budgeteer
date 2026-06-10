package repository

import (
	"context"
	"time"

	"budgeteer-backend/internal/database"
	"budgeteer-backend/internal/model"
)

type EmailRepository struct{}

func (r *EmailRepository) Create(ctx context.Context, email *model.EmailOutbox) error {
	query := `INSERT INTO email_outbox (id, to_address, subject, body, status, retry_count, scheduled_for, created_at)
	          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`
	_, err := database.Pool.Exec(ctx, query,
		email.ID, email.ToAddress, email.Subject, email.Body,
		email.Status, email.RetryCount, email.ScheduledFor, email.CreatedAt)
	return err
}

func (r *EmailRepository) ListPending(ctx context.Context, limit int) ([]*model.EmailOutbox, error) {
	query := `SELECT id, to_address, subject, body, status, retry_count, scheduled_for, created_at
	          FROM email_outbox WHERE status = 'pending' AND scheduled_for <= $1
	          ORDER BY scheduled_for LIMIT $2`
	rows, err := database.Pool.Query(ctx, query, time.Now(), limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var emails []*model.EmailOutbox
	for rows.Next() {
		e := &model.EmailOutbox{}
		if err := rows.Scan(&e.ID, &e.ToAddress, &e.Subject, &e.Body,
			&e.Status, &e.RetryCount, &e.ScheduledFor, &e.CreatedAt); err != nil {
			return nil, err
		}
		emails = append(emails, e)
	}
	return emails, nil
}

func (r *EmailRepository) MarkSent(ctx context.Context, id string) error {
	query := `UPDATE email_outbox SET status = 'sent' WHERE id = $1`
	_, err := database.Pool.Exec(ctx, query, id)
	return err
}

func (r *EmailRepository) MarkFailed(ctx context.Context, id string) error {
	query := `UPDATE email_outbox SET status = 'failed' WHERE id = $1`
	_, err := database.Pool.Exec(ctx, query, id)
	return err
}

func (r *EmailRepository) IncrementRetry(ctx context.Context, id string, retryCount int) error {
	query := `UPDATE email_outbox SET retry_count = $1 WHERE id = $2`
	if retryCount >= 5 {
		query = `UPDATE email_outbox SET retry_count = $1, status = 'failed' WHERE id = $2`
	}
	_, err := database.Pool.Exec(ctx, query, retryCount, id)
	return err
}
