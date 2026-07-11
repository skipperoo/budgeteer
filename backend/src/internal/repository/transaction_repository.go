package repository

import (
	"context"
	"fmt"
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
	// Find the existing transaction to get its original time
	oldTx, err := r.FindByID(ctx, t.ID)
	if err != nil {
		return err
	}
	if oldTx == nil {
		return fmt.Errorf("transaction not found")
	}

	// If the time has changed, we must delete the old row and insert the new one
	// to avoid TimescaleDB partition key update restrictions on hypertables
	if !oldTx.Time.Equal(t.Time) {
		txConn, err := database.Pool.Begin(ctx)
		if err != nil {
			return err
		}
		defer txConn.Rollback(ctx)

		// Hard delete the old row (since we are replacing it with the new partition key)
		deleteQuery := `DELETE FROM transactions WHERE id = $1 AND time = $2`
		_, err = txConn.Exec(ctx, deleteQuery, t.ID, oldTx.Time)
		if err != nil {
			return err
		}

		// Insert the new row
		insertQuery := `INSERT INTO transactions (id, time, account_id, created_by, encrypted_payload, version, created_at, updated_at)
		                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`
		_, err = txConn.Exec(ctx, insertQuery,
			t.ID, t.Time, t.AccountID, t.CreatedBy, t.EncryptedPayload,
			t.Version, t.CreatedAt, t.UpdatedAt)
		if err != nil {
			return err
		}

		return txConn.Commit(ctx)
	}

	// If time has not changed, we can perform a normal update
	query := `UPDATE transactions SET encrypted_payload = $1, version = $2, updated_at = $3
	          WHERE id = $4 AND time = $5 AND deleted_at IS NULL`
	_, err = database.Pool.Exec(ctx, query,
		t.EncryptedPayload, t.Version, t.UpdatedAt, t.ID, t.Time)
	return err
}

// BulkUpdateTransactions updates multiple transactions atomically in a single DB transaction.
// All items must belong to the same user (access is verified by the caller).
func (r *TransactionRepository) BulkUpdateTransactions(ctx context.Context, items []model.BulkTransactionItem) error {
	if len(items) == 0 {
		return nil
	}

	tx, err := database.Pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	now := time.Now()
	query := `UPDATE transactions SET encrypted_payload = $1, version = version + 1, updated_at = $2
	          WHERE id = $3 AND time = $4 AND deleted_at IS NULL`

	for _, item := range items {
		res, err := tx.Exec(ctx, query, item.EncryptedPayload, now, item.ID, item.Time)
		if err != nil {
			return fmt.Errorf("failed to update transaction %s: %w", item.ID, err)
		}
		if res.RowsAffected() == 0 {
			return fmt.Errorf("transaction %s not found or already deleted", item.ID)
		}
	}

	return tx.Commit(ctx)
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
