package repository

import (
	"context"

	"budgeteer-backend/internal/database"
	"budgeteer-backend/internal/model"

	"github.com/jackc/pgx/v5"
)

type AccountUserRepository struct{}

func (r *AccountUserRepository) Create(ctx context.Context, au *model.AccountUser) error {
	query := `INSERT INTO account_users (account_id, user_id, encrypted_account_key, role, joined_at)
	          VALUES ($1, $2, $3, $4, $5)`
	_, err := database.Pool.Exec(ctx, query,
		au.AccountID, au.UserID, au.EncryptedAccountKey, au.Role, au.JoinedAt)
	return err
}

func (r *AccountUserRepository) FindByAccountAndUser(ctx context.Context, accountID, userID string) (*model.AccountUser, error) {
	query := `SELECT account_id, user_id, encrypted_account_key, role, joined_at
	          FROM account_users WHERE account_id = $1 AND user_id = $2`
	row := database.Pool.QueryRow(ctx, query, accountID, userID)
	au := &model.AccountUser{}
	err := row.Scan(&au.AccountID, &au.UserID, &au.EncryptedAccountKey, &au.Role, &au.JoinedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return au, nil
}

func (r *AccountUserRepository) ListByAccount(ctx context.Context, accountID string) ([]*model.AccountUser, error) {
	query := `SELECT account_id, user_id, encrypted_account_key, role, joined_at
	          FROM account_users WHERE account_id = $1 ORDER BY joined_at`
	rows, err := database.Pool.Query(ctx, query, accountID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []*model.AccountUser
	for rows.Next() {
		au := &model.AccountUser{}
		if err := rows.Scan(&au.AccountID, &au.UserID, &au.EncryptedAccountKey, &au.Role, &au.JoinedAt); err != nil {
			return nil, err
		}
		users = append(users, au)
	}
	return users, nil
}

func (r *AccountUserRepository) ListByUserID(ctx context.Context, userID string) ([]*model.AccountUser, error) {
	query := `SELECT account_id, user_id, encrypted_account_key, role, joined_at
	          FROM account_users WHERE user_id = $1 ORDER BY joined_at`
	rows, err := database.Pool.Query(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []*model.AccountUser
	for rows.Next() {
		au := &model.AccountUser{}
		if err := rows.Scan(&au.AccountID, &au.UserID, &au.EncryptedAccountKey, &au.Role, &au.JoinedAt); err != nil {
			return nil, err
		}
		users = append(users, au)
	}
	return users, nil
}

func (r *AccountUserRepository) Delete(ctx context.Context, accountID, userID string) error {
	query := `DELETE FROM account_users WHERE account_id = $1 AND user_id = $2`
	_, err := database.Pool.Exec(ctx, query, accountID, userID)
	return err
}

func (r *AccountUserRepository) UpdateKey(ctx context.Context, accountID, userID, encryptedKey string) error {
	query := `UPDATE account_users SET encrypted_account_key = $1 WHERE account_id = $2 AND user_id = $3`
	_, err := database.Pool.Exec(ctx, query, encryptedKey, accountID, userID)
	return err
}

func (r *AccountUserRepository) CountByAccount(ctx context.Context, accountID string) (int, error) {
	query := `SELECT COUNT(*) FROM account_users WHERE account_id = $1`
	var count int
	err := database.Pool.QueryRow(ctx, query, accountID).Scan(&count)
	return count, err
}
