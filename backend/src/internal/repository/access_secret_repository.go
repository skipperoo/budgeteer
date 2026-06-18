package repository

import (
	"context"
	"time"

	"budgeteer-backend/internal/database"
	"budgeteer-backend/internal/model"

	"github.com/jackc/pgx/v5"
)

type AccessSecretRepository struct{}

func (r *AccessSecretRepository) Create(ctx context.Context, s *model.AccessSecret) error {
	query := `INSERT INTO access_secrets (id, user_id, fingerprint_hash, secret_hash, device_name, created_at)
	          VALUES ($1, $2, $3, $4, $5, $6)`
	_, err := database.Pool.Exec(ctx, query,
		s.ID, s.UserID, s.FingerprintHash, s.SecretHash, s.DeviceName, s.CreatedAt)
	return err
}

func (r *AccessSecretRepository) FindByUserAndFingerprint(ctx context.Context, userID, fingerprintHash string) (*model.AccessSecret, error) {
	query := `SELECT id, user_id, fingerprint_hash, secret_hash, device_name, last_used_at, created_at
	          FROM access_secrets WHERE user_id = $1 AND fingerprint_hash = $2`
	row := database.Pool.QueryRow(ctx, query, userID, fingerprintHash)
	return scanAccessSecret(row)
}

func (r *AccessSecretRepository) ListByUserID(ctx context.Context, userID string) ([]*model.AccessSecret, error) {
	query := `SELECT id, user_id, fingerprint_hash, secret_hash, device_name, last_used_at, created_at
	          FROM access_secrets WHERE user_id = $1 ORDER BY created_at DESC`
	rows, err := database.Pool.Query(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []*model.AccessSecret
	for rows.Next() {
		s, err := scanAccessSecret(rows)
		if err != nil {
			return nil, err
		}
		results = append(results, s)
	}
	return results, nil
}

func (r *AccessSecretRepository) Delete(ctx context.Context, id, userID string) error {
	query := `DELETE FROM access_secrets WHERE id = $1 AND user_id = $2`
	_, err := database.Pool.Exec(ctx, query, id, userID)
	return err
}

func (r *AccessSecretRepository) DeleteAllByUser(ctx context.Context, userID string) error {
	query := `DELETE FROM access_secrets WHERE user_id = $1`
	_, err := database.Pool.Exec(ctx, query, userID)
	return err
}

func (r *AccessSecretRepository) UpdateLastUsed(ctx context.Context, id string) error {
	query := `UPDATE access_secrets SET last_used_at = $1 WHERE id = $2`
	_, err := database.Pool.Exec(ctx, query, time.Now(), id)
	return err
}

func scanAccessSecret(row pgx.Row) (*model.AccessSecret, error) {
	s := &model.AccessSecret{}
	err := row.Scan(&s.ID, &s.UserID, &s.FingerprintHash, &s.SecretHash, &s.DeviceName, &s.LastUsedAt, &s.CreatedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return s, nil
}
