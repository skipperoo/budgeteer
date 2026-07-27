package repository

import (
	"context"
	"time"

	"budgeteer-backend/internal/database"
	"budgeteer-backend/internal/model"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

type AccountRepository struct{}

func (r *AccountRepository) Create(ctx context.Context, a *model.Account) error {
	query := `INSERT INTO accounts (id, name, currency, type, created_by, encrypted_metadata, created_at, updated_at)
	          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`
	_, err := database.Pool.Exec(ctx, query,
		a.ID, a.Name, a.Currency, a.Type, a.CreatedBy, a.EncryptedMetadata, a.CreatedAt, a.UpdatedAt)
	return err
}

func (r *AccountRepository) FindByID(ctx context.Context, id string) (*model.Account, error) {
	query := `SELECT id, name, currency, type, created_by, encrypted_metadata, created_at, updated_at, deleted_at
	          FROM accounts WHERE id = $1`
	row := database.Pool.QueryRow(ctx, query, id)
	a := &model.Account{}
	var meta pgtype.Text
	err := row.Scan(&a.ID, &a.Name, &a.Currency, &a.Type, &a.CreatedBy, &meta, &a.CreatedAt, &a.UpdatedAt, &a.DeletedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	if meta.Valid {
		s := meta.String
		a.EncryptedMetadata = &s
	}
	return a, nil
}

func (r *AccountRepository) Update(ctx context.Context, a *model.Account, updateMetadata bool) error {
	// updateMetadata = true => write the provided EncryptedMetadata (may be nil);
	// false => leave the existing column unchanged (COALESCE keeps current value).
	if updateMetadata {
		query := `UPDATE accounts
		          SET name = $1, currency = $2, type = $3, encrypted_metadata = $4, updated_at = $5
		          WHERE id = $6 AND deleted_at IS NULL`
		_, err := database.Pool.Exec(ctx, query, a.Name, a.Currency, a.Type, a.EncryptedMetadata, time.Now(), a.ID)
		return err
	}
	query := `UPDATE accounts
	          SET name = $1, currency = $2, type = $3, updated_at = $4
	          WHERE id = $5 AND deleted_at IS NULL`
	_, err := database.Pool.Exec(ctx, query, a.Name, a.Currency, a.Type, time.Now(), a.ID)
	return err
}

func (r *AccountRepository) SoftDelete(ctx context.Context, id string) error {
	query := `UPDATE accounts SET deleted_at = $1, updated_at = $1 WHERE id = $2 AND deleted_at IS NULL`
	_, err := database.Pool.Exec(ctx, query, time.Now(), id)
	return err
}

func (r *AccountRepository) ListByUserID(ctx context.Context, userID string) ([]*model.Account, error) {
	query := `SELECT a.id, a.name, a.currency, a.type, a.created_by, a.encrypted_metadata, a.created_at, a.updated_at, a.deleted_at
	          FROM accounts a
	          JOIN account_users au ON au.account_id = a.id
	          WHERE au.user_id = $1 AND a.deleted_at IS NULL
	          ORDER BY a.created_at DESC`
	rows, err := database.Pool.Query(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	accounts := make([]*model.Account, 0)
	for rows.Next() {
		a := &model.Account{}
		var meta pgtype.Text
		if err := rows.Scan(&a.ID, &a.Name, &a.Currency, &a.Type, &a.CreatedBy, &meta, &a.CreatedAt, &a.UpdatedAt, &a.DeletedAt); err != nil {
			return nil, err
		}
		if meta.Valid {
			s := meta.String
			a.EncryptedMetadata = &s
		}
		accounts = append(accounts, a)
	}
	return accounts, nil
}