package repository

import (
	"context"
	"time"

	"budgeteer-backend/internal/database"
	"budgeteer-backend/internal/model"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

type BudgetRepository struct{}

func (r *BudgetRepository) Create(ctx context.Context, b *model.Budget) error {
	q := database.GetQuerier(ctx)
	query := `INSERT INTO budgets (id, user_id, account_id, encrypted_payload, period, start_date, end_date,
	          last_notified_50, last_notified_80, last_notified_100, created_at, updated_at)
	          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`
	_, err := q.Exec(ctx, query,
		b.ID, b.UserID, b.AccountID, b.EncryptedPayload,
		b.Period, b.StartDate, b.EndDate,
		b.LastNotified50, b.LastNotified80, b.LastNotified100,
		b.CreatedAt, b.UpdatedAt)
	return err
}

func scanBudget(row pgx.Row) (*model.Budget, error) {
	b := &model.Budget{}
	var accountID, endDate pgtype.Text
	err := row.Scan(
		&b.ID, &b.UserID, &accountID, &b.EncryptedPayload,
		&b.Period, &b.StartDate, &endDate,
		&b.LastNotified50, &b.LastNotified80, &b.LastNotified100,
		&b.CreatedAt, &b.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	if accountID.Valid {
		s := accountID.String
		b.AccountID = &s
	}
	if endDate.Valid {
		s := endDate.String
		b.EndDate = &s
	}
	return b, nil
}

func scanBudgets(rows pgx.Rows, err error) ([]*model.Budget, error) {
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var budgets []*model.Budget
	for rows.Next() {
		b, err := scanBudget(rows)
		if err != nil {
			return nil, err
		}
		budgets = append(budgets, b)
	}
	return budgets, nil
}

func (r *BudgetRepository) FindByID(ctx context.Context, id string) (*model.Budget, error) {
	q := database.GetQuerier(ctx)
	query := `SELECT id, user_id, account_id, encrypted_payload, period, start_date, end_date,
	          last_notified_50, last_notified_80, last_notified_100, created_at, updated_at
	          FROM budgets WHERE id = $1`
	row := q.QueryRow(ctx, query, id)
	return scanBudget(row)
}

func (r *BudgetRepository) ListByUserID(ctx context.Context, userID string) ([]*model.Budget, error) {
	q := database.GetQuerier(ctx)
	query := `SELECT id, user_id, account_id, encrypted_payload, period, start_date, end_date,
	          last_notified_50, last_notified_80, last_notified_100, created_at, updated_at
	          FROM budgets WHERE user_id = $1 ORDER BY created_at DESC`
	return scanBudgets(q.Query(ctx, query, userID))
}

func (r *BudgetRepository) Update(ctx context.Context, b *model.Budget) error {
	q := database.GetQuerier(ctx)
	query := `UPDATE budgets SET account_id = $1, encrypted_payload = $2, period = $3,
	          start_date = $4, end_date = $5, updated_at = $6 WHERE id = $7`
	_, err := q.Exec(ctx, query,
		b.AccountID, b.EncryptedPayload, b.Period,
		b.StartDate, b.EndDate, time.Now().UTC(), b.ID)
	return err
}

func (r *BudgetRepository) Delete(ctx context.Context, id string) error {
	q := database.GetQuerier(ctx)
	_, err := q.Exec(ctx, `DELETE FROM budgets WHERE id = $1`, id)
	return err
}

// MarkNotified updates the notification flag for a budget threshold.
// threshold is one of "50", "80", or "100".
func (r *BudgetRepository) MarkNotified(ctx context.Context, id string, threshold string) error {
	q := database.GetQuerier(ctx)
	var col string
	switch threshold {
	case "50":
		col = "last_notified_50"
	case "80":
		col = "last_notified_80"
	case "100":
		col = "last_notified_100"
	default:
		return nil
	}
	_, err := q.Exec(ctx,
		`UPDATE budgets SET `+col+` = TRUE, updated_at = NOW() WHERE id = $1`, id)
	return err
}
