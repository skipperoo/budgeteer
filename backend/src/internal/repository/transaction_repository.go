package repository

import (
	"context"
	"time"

	"budgeteer-backend/internal/database"
	"budgeteer-backend/internal/model"

	"github.com/jackc/pgx/v5"
)

type TransactionRepository struct{}

func (r *TransactionRepository) Create(ctx context.Context, t *model.Transaction) error {
	query := `INSERT INTO transactions (id, time, account_id, created_by, encrypted_payload, version, created_at, updated_at)
	          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`
	_, err := database.Pool.Exec(ctx, query,
		t.ID, t.Time, t.AccountID, t.CreatedBy, t.EncryptedPayload,
		t.Version, t.CreatedAt, t.UpdatedAt)
	return err
}

func (r *TransactionRepository) SoftDelete(ctx context.Context, id string) error {
	query := `UPDATE transactions SET deleted_at = $1, updated_at = $1 WHERE id = $2 AND deleted_at IS NULL`
	_, err := database.Pool.Exec(ctx, query, time.Now(), id)
	return err
}

func (r *TransactionRepository) FindByID(ctx context.Context, id string) (*model.Transaction, error) {
	query := `SELECT id, time, account_id, created_by, encrypted_payload, version, created_at, updated_at, deleted_at
	          FROM transactions WHERE id = $1 AND deleted_at IS NULL`
	row := database.Pool.QueryRow(ctx, query, id)
	t := &model.Transaction{}
	err := row.Scan(&t.ID, &t.Time, &t.AccountID, &t.CreatedBy, &t.EncryptedPayload,
		&t.Version, &t.CreatedAt, &t.UpdatedAt, &t.DeletedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return t, nil
}

func (r *TransactionRepository) Update(ctx context.Context, t *model.Transaction) error {
	query := `UPDATE transactions SET time = $1, encrypted_payload = $2, version = $3, updated_at = $4
	          WHERE id = $5 AND deleted_at IS NULL`
	_, err := database.Pool.Exec(ctx, query,
		t.Time, t.EncryptedPayload, t.Version, t.UpdatedAt, t.ID)
	return err
}

func (r *TransactionRepository) ListByAccountID(ctx context.Context, accountID string, limit, offset int) ([]*model.Transaction, error) {
	query := `SELECT id, time, account_id, created_by, encrypted_payload, version, created_at, updated_at, deleted_at
	          FROM transactions WHERE account_id = $1 AND deleted_at IS NULL
	          ORDER BY time DESC LIMIT $2 OFFSET $3`
	rows, err := database.Pool.Query(ctx, query, accountID, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var transactions []*model.Transaction
	for rows.Next() {
		t := &model.Transaction{}
		if err := rows.Scan(&t.ID, &t.Time, &t.AccountID, &t.CreatedBy, &t.EncryptedPayload,
			&t.Version, &t.CreatedAt, &t.UpdatedAt, &t.DeletedAt); err != nil {
			return nil, err
		}
		transactions = append(transactions, t)
	}
	return transactions, nil
}
