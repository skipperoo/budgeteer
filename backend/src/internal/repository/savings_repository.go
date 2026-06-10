package repository

import (
	"context"
	"time"

	"budgeteer-backend/internal/database"
	"budgeteer-backend/internal/model"
)

type SavingsPlanRepository struct{}

func (r *SavingsPlanRepository) FindStale(ctx context.Context) ([]*model.SavingsPlan, error) {
	query := `SELECT id, account_id, source_account_id, created_by, currency, tracking_start, tracking_end, last_logged_at, encrypted_payload, is_active, created_at, updated_at
	          FROM savings_plans
	          WHERE is_active = TRUE
	            AND (tracking_end < $1 OR last_logged_at IS NULL OR last_logged_at < $2)`
	cutoff := time.Now().Add(-30 * 24 * time.Hour)
	rows, err := database.Pool.Query(ctx, query, time.Now(), cutoff)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var plans []*model.SavingsPlan
	for rows.Next() {
		p := &model.SavingsPlan{}
		if err := rows.Scan(&p.ID, &p.AccountID, &p.SourceAccountID, &p.CreatedBy,
			&p.Currency, &p.TrackingStart, &p.TrackingEnd, &p.LastLoggedAt,
			&p.EncryptedPayload, &p.IsActive, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, err
		}
		plans = append(plans, p)
	}
	return plans, nil
}
