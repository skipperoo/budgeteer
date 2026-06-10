package repository

import (
	"context"
	"time"

	"budgeteer-backend/internal/database"
	"budgeteer-backend/internal/model"

	"github.com/jackc/pgx/v5"
)

type SyncRepository struct{}

func (r *SyncRepository) Create(ctx context.Context, item *model.SyncQueueItem) error {
	query := `INSERT INTO sync_queue (id, target_user_id, account_id, action, entity_type, encrypted_payload, created_at)
	          VALUES ($1, $2, $3, $4, $5, $6, $7)`
	_, err := database.Pool.Exec(ctx, query,
		item.ID, item.TargetUserID, item.AccountID, item.Action,
		item.EntityType, item.EncryptedPayload, item.CreatedAt)
	return err
}

func (r *SyncRepository) ListPendingByUserID(ctx context.Context, userID string, cursor *string, limit int) ([]*model.SyncQueueItem, *string, error) {
	var rows pgx.Rows
	var err error

	if cursor != nil && *cursor != "" {
		query := `SELECT id, target_user_id, account_id, action, entity_type, encrypted_payload, created_at, consumed_at
		          FROM sync_queue
		          WHERE target_user_id = $1 AND consumed_at IS NULL AND id > $2
		          ORDER BY id LIMIT $3`
		rows, err = database.Pool.Query(ctx, query, userID, *cursor, limit+1)
	} else {
		query := `SELECT id, target_user_id, account_id, action, entity_type, encrypted_payload, created_at, consumed_at
		          FROM sync_queue
		          WHERE target_user_id = $1 AND consumed_at IS NULL
		          ORDER BY id LIMIT $2`
		rows, err = database.Pool.Query(ctx, query, userID, limit+1)
	}
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()

	var items []*model.SyncQueueItem
	for rows.Next() {
		item := &model.SyncQueueItem{}
		if err := rows.Scan(&item.ID, &item.TargetUserID, &item.AccountID, &item.Action,
			&item.EntityType, &item.EncryptedPayload, &item.CreatedAt, &item.ConsumedAt); err != nil {
			return nil, nil, err
		}
		items = append(items, item)
	}

	var nextCursor *string
	if len(items) > limit {
		nextCursor = &items[limit-1].ID
		items = items[:limit]
	}

	return items, nextCursor, nil
}

func (r *SyncRepository) MarkConsumed(ctx context.Context, ids []string) error {
	query := `UPDATE sync_queue SET consumed_at = $1 WHERE id = ANY($2)`
	_, err := database.Pool.Exec(ctx, query, time.Now(), ids)
	return err
}

func (r *SyncRepository) DeleteConsumedBefore(ctx context.Context, before time.Time) error {
	query := `DELETE FROM sync_queue WHERE consumed_at IS NOT NULL AND consumed_at < $1`
	_, err := database.Pool.Exec(ctx, query, before)
	return err
}
