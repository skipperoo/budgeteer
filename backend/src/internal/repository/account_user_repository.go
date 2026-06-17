package repository

import (
	"context"

	"budgeteer-backend/internal/database"
	"budgeteer-backend/internal/model"

	"github.com/jackc/pgx/v5"
)

type AccountUserRepository struct{}

func scanAccountUser(row pgx.Row) (*model.AccountUser, error) {
	au := &model.AccountUser{}
	err := row.Scan(&au.AccountID, &au.UserID, &au.EncryptedAccountKey, &au.Role, &au.Status, &au.JoinedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return au, nil
}

func scanAccountUsers(rows pgx.Rows, err error) ([]*model.AccountUser, error) {
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var users []*model.AccountUser
	for rows.Next() {
		au, err := scanAccountUser(rows)
		if err != nil {
			return nil, err
		}
		users = append(users, au)
	}
	return users, nil
}

func (r *AccountUserRepository) Create(ctx context.Context, au *model.AccountUser) error {
	query := `INSERT INTO account_users (account_id, user_id, encrypted_account_key, role, status, joined_at)
	          VALUES ($1, $2, $3, $4, $5, $6)`
	_, err := database.Pool.Exec(ctx, query,
		au.AccountID, au.UserID, au.EncryptedAccountKey, au.Role, au.Status, au.JoinedAt)
	return err
}

func (r *AccountUserRepository) FindByAccountAndUser(ctx context.Context, accountID, userID string) (*model.AccountUser, error) {
	query := `SELECT account_id, user_id, encrypted_account_key, role, status, joined_at
	          FROM account_users WHERE account_id = $1 AND user_id = $2`
	return scanAccountUser(database.Pool.QueryRow(ctx, query, accountID, userID))
}

func (r *AccountUserRepository) ListByAccount(ctx context.Context, accountID string) ([]*model.AccountUser, error) {
	query := `SELECT account_id, user_id, encrypted_account_key, role, status, joined_at
	          FROM account_users WHERE account_id = $1 AND status = 'active' ORDER BY joined_at`
	return scanAccountUsers(database.Pool.Query(ctx, query, accountID))
}

func (r *AccountUserRepository) ListByUserID(ctx context.Context, userID string) ([]*model.AccountUser, error) {
	query := `SELECT account_id, user_id, encrypted_account_key, role, status, joined_at
	          FROM account_users WHERE user_id = $1 ORDER BY joined_at`
	return scanAccountUsers(database.Pool.Query(ctx, query, userID))
}

// ListPendingByUserID returns pending (unaccepted) account invites for a user.
func (r *AccountUserRepository) ListPendingByUserID(ctx context.Context, userID string) ([]*model.AccountUser, error) {
	query := `SELECT account_id, user_id, encrypted_account_key, role, status, joined_at
	          FROM account_users WHERE user_id = $1 AND status = 'pending_accepted' ORDER BY joined_at`
	return scanAccountUsers(database.Pool.Query(ctx, query, userID))
}

// AcceptPending updates a pending account user record to active.
func (r *AccountUserRepository) AcceptPending(ctx context.Context, accountID, userID string) error {
	_, err := database.Pool.Exec(ctx,
		`UPDATE account_users SET status = 'active', joined_at = NOW() WHERE account_id = $1 AND user_id = $2 AND status = 'pending_accepted'`,
		accountID, userID)
	return err
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
