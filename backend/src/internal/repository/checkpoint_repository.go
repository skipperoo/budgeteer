package repository

import (
	"context"
	"fmt"
	"time"

	"budgeteer-backend/internal/database"
	"budgeteer-backend/internal/model"
)

type CheckpointRepository struct{}

// ListByAccount returns checkpoints for an account within [from, to] (both
// optional; when empty, unbounded on that side), ascending by checkpoint_month.
func (r *CheckpointRepository) ListByAccount(ctx context.Context, accountID, from, to string) ([]*model.Checkpoint, error) {
	q := database.Pool
	args := []interface{}{accountID}
	query := `SELECT account_id, checkpoint_month, encrypted_balance, created_at, updated_at
	          FROM transactions_checkpoints WHERE account_id = $1`
	if from != "" {
		args = append(args, from)
		query += fmt.Sprintf(" AND checkpoint_month >= $%d", len(args))
	}
	if to != "" {
		args = append(args, to)
		query += fmt.Sprintf(" AND checkpoint_month <= $%d", len(args))
	}
	query += " ORDER BY checkpoint_month ASC"

	rows, err := q.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*model.Checkpoint
	for rows.Next() {
		c := &model.Checkpoint{}
		var month time.Time
		if err := rows.Scan(&c.AccountID, &month, &c.EncryptedBalance, &c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, err
		}
		c.CheckpointMonth = month.Format("2006-01-02")
		out = append(out, c)
	}
	return out, nil
}

// UpsertMany bulk-upserts checkpoints for an account inside a single tx.
// On conflict (account_id, checkpoint_month) the encrypted_balance is
// overwritten and updated_at is bumped.
func (r *CheckpointRepository) UpsertMany(ctx context.Context, accountID string, items []model.CheckpointInput) error {
	return database.WithTx(ctx, func(txCtx context.Context) error {
		q := database.GetQuerier(txCtx)
		query := `INSERT INTO transactions_checkpoints (account_id, checkpoint_month, encrypted_balance, created_at, updated_at)
		          VALUES ($1, $2, $3, NOW(), NOW())
		          ON CONFLICT (account_id, checkpoint_month) DO UPDATE
		          SET encrypted_balance = EXCLUDED.encrypted_balance, updated_at = NOW()`
		for _, it := range items {
			if _, err := q.Exec(txCtx, query, accountID, it.CheckpointMonth, it.EncryptedBalance); err != nil {
				return err
			}
		}
		return nil
	})
}

// CountTransactionsThroughMonth returns the number of non-deleted transactions
// for an account whose UTC month-of-time is <= the UTC month of `monthEnd`.
// Both `time` and `account_id` are plaintext, so no decryption is needed.
func (r *CheckpointRepository) CountTransactionsThroughMonth(ctx context.Context, accountID, monthEnd string) (int, error) {
	q := database.Pool
	var count int
	query := `SELECT COUNT(*) FROM transactions
	          WHERE account_id = $1 AND deleted_at IS NULL
	            AND date_trunc('month', time AT TIME ZONE 'UTC') <= date_trunc('month', $2::date)`
	if err := q.QueryRow(ctx, query, accountID, monthEnd).Scan(&count); err != nil {
		return 0, err
	}
	return count, nil
}