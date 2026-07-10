package repository

import (
	"context"
	"time"

	"budgeteer-backend/internal/database"
	"budgeteer-backend/internal/model"
)

type MigrationRepository struct{}

// ListPending returns all pending migrations for a user.
func (r *MigrationRepository) ListPending(ctx context.Context, userID string) ([]*model.PendingMigration, error) {
	query := `SELECT id, user_id, migration_key, status, error_message, created_at, completed_at
	          FROM pending_migrations
	          WHERE user_id = $1 AND status = 'pending'
	          ORDER BY created_at ASC`
	rows, err := database.Pool.Query(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var migrations []*model.PendingMigration
	for rows.Next() {
		m := &model.PendingMigration{}
		if err := rows.Scan(&m.ID, &m.UserID, &m.MigrationKey, &m.Status, &m.ErrorMessage, &m.CreatedAt, &m.CompletedAt); err != nil {
			return nil, err
		}
		migrations = append(migrations, m)
	}
	return migrations, rows.Err()
}

// Complete marks a pending migration as completed for a given user.
// Returns the number of rows updated (should be 1).
func (r *MigrationRepository) Complete(ctx context.Context, userID, migrationKey string) (int, error) {
	query := `UPDATE pending_migrations
	          SET status = 'completed', completed_at = $3
	          WHERE user_id = $1 AND migration_key = $2 AND status = 'pending'`
	res, err := database.Pool.Exec(ctx, query, userID, migrationKey, time.Now())
	if err != nil {
		return 0, err
	}
	return int(res.RowsAffected()), nil
}

// Fail marks a pending migration as failed with an error message.
func (r *MigrationRepository) Fail(ctx context.Context, userID, migrationKey, errMsg string) error {
	query := `UPDATE pending_migrations
	          SET status = 'failed', error_message = $3, completed_at = NOW()
	          WHERE user_id = $1 AND migration_key = $2 AND status = 'pending'`
	_, err := database.Pool.Exec(ctx, query, userID, migrationKey, errMsg)
	return err
}
