package repository

import (
	"context"
	"time"

	"budgeteer-backend/internal/database"
	"budgeteer-backend/internal/model"

	"github.com/jackc/pgx/v5/pgtype"
)

type NotificationRepository struct{}

func (r *NotificationRepository) Create(ctx context.Context, n *model.Notification) error {
	q := database.GetQuerier(ctx)
	query := `INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at)
	          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`
	_, err := q.Exec(ctx, query,
		n.ID, n.UserID, n.Type, n.Title, n.Body, n.Data, n.IsRead, n.CreatedAt)
	return err
}

func (r *NotificationRepository) ListByUserID(ctx context.Context, userID string, limit, offset int) ([]*model.Notification, error) {
	q := database.GetQuerier(ctx)
	query := `SELECT id, user_id, type, title, body, data, is_read, created_at
	          FROM notifications WHERE user_id = $1
	          ORDER BY created_at DESC LIMIT $2 OFFSET $3`
	rows, err := q.Query(ctx, query, userID, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var notifications []*model.Notification
	for rows.Next() {
		n := &model.Notification{}
		var data pgtype.Text
		if err := rows.Scan(&n.ID, &n.UserID, &n.Type, &n.Title, &n.Body, &data, &n.IsRead, &n.CreatedAt); err != nil {
			return nil, err
		}
		if data.Valid {
			s := data.String
			n.Data = &s
		}
		notifications = append(notifications, n)
	}
	return notifications, nil
}

func (r *NotificationRepository) MarkRead(ctx context.Context, id, userID string) error {
	q := database.GetQuerier(ctx)
	_, err := q.Exec(ctx,
		`UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2`, id, userID)
	return err
}

func (r *NotificationRepository) CountUnread(ctx context.Context, userID string) (int, error) {
	q := database.GetQuerier(ctx)
	var count int
	err := q.QueryRow(ctx,
		`SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = FALSE`, userID).Scan(&count)
	return count, err
}

// CreateNotification is a convenience wrapper that fills in default values.
func (r *NotificationRepository) CreateNotification(ctx context.Context, userID, notifType, title, body string, data *string) error {
	now := time.Now().UTC()
	id, err := newUUID()
	if err != nil {
		return err
	}
	n := &model.Notification{
		ID:        id,
		UserID:    userID,
		Type:      notifType,
		Title:     title,
		Body:      body,
		Data:      data,
		IsRead:    false,
		CreatedAt: now,
	}
	return r.Create(ctx, n)
}

// newUUID generates a UUID v4 string.
func newUUID() (string, error) {
	var id string
	err := database.Pool.QueryRow(context.Background(), `SELECT gen_random_uuid()::text`).Scan(&id)
	return id, err
}
