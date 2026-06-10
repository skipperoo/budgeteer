package repository

import (
	"context"
	"time"

	"budgeteer-backend/internal/database"
	"budgeteer-backend/internal/model"

	"github.com/jackc/pgx/v5"
)

type OTPRepository struct{}

func (r *OTPRepository) Create(ctx context.Context, otp *model.OTP) error {
	query := `INSERT INTO otps (id, user_id, code_hash, expires_at, consumed, created_at)
	          VALUES ($1, $2, $3, $4, $5, $6)`
	_, err := database.Pool.Exec(ctx, query,
		otp.ID, otp.UserID, otp.CodeHash, otp.ExpiresAt, otp.Consumed, otp.CreatedAt)
	return err
}

func (r *OTPRepository) FindValidByUserID(ctx context.Context, userID string) (*model.OTP, error) {
	query := `SELECT id, user_id, code_hash, expires_at, consumed, created_at
	          FROM otps WHERE user_id = $1 AND consumed = FALSE AND expires_at > $2
	          ORDER BY created_at DESC LIMIT 1`
	row := database.Pool.QueryRow(ctx, query, userID, time.Now())
	o := &model.OTP{}
	err := row.Scan(&o.ID, &o.UserID, &o.CodeHash, &o.ExpiresAt, &o.Consumed, &o.CreatedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return o, nil
}

func (r *OTPRepository) MarkConsumed(ctx context.Context, id string) error {
	query := `UPDATE otps SET consumed = TRUE WHERE id = $1`
	_, err := database.Pool.Exec(ctx, query, id)
	return err
}

func (r *OTPRepository) DeleteExpired(ctx context.Context) error {
	query := `DELETE FROM otps WHERE expires_at < $1`
	_, err := database.Pool.Exec(ctx, query, time.Now())
	return err
}
