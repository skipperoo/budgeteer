package repository

import (
	"context"
	"encoding/json"
	"time"

	"budgeteer-backend/internal/database"
	"budgeteer-backend/internal/model"

	"github.com/jackc/pgx/v5"
)

type UserRepository struct{}

func (r *UserRepository) Create(ctx context.Context, u *model.User) error {
	query := `INSERT INTO users (id, email, password_hash, public_key, encrypted_private_key, is_verified, preferences, created_at, updated_at)
	          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`
	prefsJSON, _ := json.Marshal(u.Preferences)
	_, err := database.Pool.Exec(ctx, query,
		u.ID, u.Email, u.PasswordHash, u.PublicKey, u.EncryptedPrivateKey,
		u.IsVerified, prefsJSON, u.CreatedAt, u.UpdatedAt)
	return err
}

func scanUser(row pgx.Row) (*model.User, error) {
	u := &model.User{}
	var prefsJSON []byte
	err := row.Scan(&u.ID, &u.Email, &u.PasswordHash, &u.PublicKey,
		&u.EncryptedPrivateKey, &u.IsVerified, &prefsJSON, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	if len(prefsJSON) > 0 {
		json.Unmarshal(prefsJSON, &u.Preferences)
	}
	return u, nil
}

func (r *UserRepository) FindByEmail(ctx context.Context, email string) (*model.User, error) {
	query := `SELECT id, email, password_hash, public_key, encrypted_private_key, is_verified, preferences, created_at, updated_at
	          FROM users WHERE email = $1`
	return scanUser(database.Pool.QueryRow(ctx, query, email))
}

func (r *UserRepository) FindByID(ctx context.Context, id string) (*model.User, error) {
	query := `SELECT id, email, password_hash, public_key, encrypted_private_key, is_verified, preferences, created_at, updated_at
	          FROM users WHERE id = $1`
	return scanUser(database.Pool.QueryRow(ctx, query, id))
}

func (r *UserRepository) UpdateVerified(ctx context.Context, userID string) error {
	query := `UPDATE users SET is_verified = true, updated_at = $1 WHERE id = $2`
	_, err := database.Pool.Exec(ctx, query, time.Now(), userID)
	return err
}

func (r *UserRepository) UpdateEncryptedPrivateKey(ctx context.Context, userID, encryptedKey string) error {
	query := `UPDATE users SET encrypted_private_key = $1, updated_at = $2 WHERE id = $3`
	_, err := database.Pool.Exec(ctx, query, encryptedKey, time.Now(), userID)
	return err
}

func (r *UserRepository) UpdatePasswordAndKey(ctx context.Context, userID, passwordHash, encryptedKey string) error {
	query := `UPDATE users SET password_hash = $1, encrypted_private_key = $2, updated_at = $3 WHERE id = $4`
	_, err := database.Pool.Exec(ctx, query, passwordHash, encryptedKey, time.Now(), userID)
	return err
}

func (r *UserRepository) PublicKeyByEmail(ctx context.Context, email string) (string, error) {
	query := `SELECT public_key FROM users WHERE email = $1`
	var publicKey string
	err := database.Pool.QueryRow(ctx, query, email).Scan(&publicKey)
	if err != nil {
		if err == pgx.ErrNoRows {
			return "", nil
		}
		return "", err
	}
	return publicKey, nil
}

func (r *UserRepository) GetPreferences(ctx context.Context, userID string) (*model.UserPreferences, error) {
	query := `SELECT preferences FROM users WHERE id = $1`
	var prefsJSON []byte
	err := database.Pool.QueryRow(ctx, query, userID).Scan(&prefsJSON)
	if err != nil {
		if err == pgx.ErrNoRows {
			return &model.UserPreferences{}, nil
		}
		return nil, err
	}

	var prefs model.UserPreferences
	if len(prefsJSON) > 0 {
		if err := json.Unmarshal(prefsJSON, &prefs); err != nil {
			return &model.UserPreferences{}, nil
		}
	}
	return &prefs, nil
}

func (r *UserRepository) UpdatePreferences(ctx context.Context, userID string, prefs *model.UserPreferences) error {
	prefsJSON, err := json.Marshal(prefs)
	if err != nil {
		return err
	}
	query := `UPDATE users SET preferences = $1, updated_at = $2 WHERE id = $3`
	_, err = database.Pool.Exec(ctx, query, prefsJSON, time.Now(), userID)
	return err
}
