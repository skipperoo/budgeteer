package repository

import (
	"context"
	"time"

	"budgeteer-backend/internal/database"
	"budgeteer-backend/internal/model"

	"github.com/jackc/pgx/v5"
)

type RuleRepository struct{}

func (r *RuleRepository) Create(ctx context.Context, rule *model.Rule) error {
	q := database.GetQuerier(ctx)
	query := `INSERT INTO rules (id, created_by, name, encrypted_payload, frequency, next_occurrence, end_date, max_occurrences, occurrences_so_far, is_active, created_at, updated_at)
	          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`
	_, err := q.Exec(ctx, query,
		rule.ID, rule.CreatedBy, rule.Name, rule.EncryptedPayload,
		rule.Frequency, rule.NextOccurrence, rule.EndDate, rule.MaxOccurrences,
		rule.OccurrencesSoFar, rule.IsActive, rule.CreatedAt, rule.UpdatedAt)
	return err
}

func (r *RuleRepository) FindByID(ctx context.Context, id string) (*model.Rule, error) {
	q := database.GetQuerier(ctx)
	query := `SELECT id, created_by, name, encrypted_payload, frequency, next_occurrence, end_date, max_occurrences, occurrences_so_far, last_triggered_at, is_active, created_at, updated_at
	          FROM rules WHERE id = $1`
	row := q.QueryRow(ctx, query, id)
	rl := &model.Rule{}
	err := row.Scan(&rl.ID, &rl.CreatedBy, &rl.Name, &rl.EncryptedPayload,
		&rl.Frequency, &rl.NextOccurrence, &rl.EndDate, &rl.MaxOccurrences,
		&rl.OccurrencesSoFar, &rl.LastTriggeredAt, &rl.IsActive, &rl.CreatedAt, &rl.UpdatedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return rl, nil
}

func (r *RuleRepository) ListByUserID(ctx context.Context, userID string) ([]*model.Rule, error) {
	q := database.GetQuerier(ctx)
	query := `SELECT id, created_by, name, encrypted_payload, frequency, next_occurrence, end_date, max_occurrences, occurrences_so_far, last_triggered_at, is_active, created_at, updated_at
	          FROM rules WHERE created_by = $1 ORDER BY created_at DESC`
	rows, err := q.Query(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var rules []*model.Rule
	for rows.Next() {
		rl := &model.Rule{}
		if err := rows.Scan(&rl.ID, &rl.CreatedBy, &rl.Name, &rl.EncryptedPayload,
			&rl.Frequency, &rl.NextOccurrence, &rl.EndDate, &rl.MaxOccurrences,
			&rl.OccurrencesSoFar, &rl.LastTriggeredAt, &rl.IsActive, &rl.CreatedAt, &rl.UpdatedAt); err != nil {
			return nil, err
		}
		rules = append(rules, rl)
	}
	return rules, nil
}

// FindDueRules returns active rules where next_occurrence <= now.
func (r *RuleRepository) FindDueRules(ctx context.Context, now time.Time) ([]*model.Rule, error) {
	q := database.GetQuerier(ctx)
	query := `SELECT id, created_by, name, encrypted_payload, frequency, next_occurrence, end_date, max_occurrences, occurrences_so_far, last_triggered_at, is_active, created_at, updated_at
	          FROM rules WHERE is_active = TRUE AND next_occurrence <= $1
	          ORDER BY next_occurrence ASC`
	rows, err := q.Query(ctx, query, now)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var rules []*model.Rule
	for rows.Next() {
		rl := &model.Rule{}
		if err := rows.Scan(&rl.ID, &rl.CreatedBy, &rl.Name, &rl.EncryptedPayload,
			&rl.Frequency, &rl.NextOccurrence, &rl.EndDate, &rl.MaxOccurrences,
			&rl.OccurrencesSoFar, &rl.LastTriggeredAt, &rl.IsActive, &rl.CreatedAt, &rl.UpdatedAt); err != nil {
			return nil, err
		}
		rules = append(rules, rl)
	}
	return rules, nil
}

func (r *RuleRepository) Update(ctx context.Context, rule *model.Rule) error {
	q := database.GetQuerier(ctx)
	query := `UPDATE rules SET name = $1, encrypted_payload = $2, frequency = $3, next_occurrence = $4,
	          end_date = $5, max_occurrences = $6, occurrences_so_far = $7, last_triggered_at = $8,
	          is_active = $9, updated_at = $10 WHERE id = $11`
	_, err := q.Exec(ctx, query,
		rule.Name, rule.EncryptedPayload, rule.Frequency, rule.NextOccurrence,
		rule.EndDate, rule.MaxOccurrences, rule.OccurrencesSoFar, rule.LastTriggeredAt,
		rule.IsActive, time.Now(), rule.ID)
	return err
}

// UpdateNextOccurrence atomically advances the rule's next_occurrence and
// increments occurrences_so_far. Also sets last_triggered_at.
// Returns the number of rows affected (0 if the rule was deactivated concurrently).
func (r *RuleRepository) UpdateNextOccurrence(ctx context.Context, id string, next time.Time, now time.Time) (int64, error) {
	q := database.GetQuerier(ctx)
	query := `UPDATE rules SET
	          next_occurrence = $2,
	          occurrences_so_far = occurrences_so_far + 1,
	          last_triggered_at = $3,
	          updated_at = $3
	          WHERE id = $1 AND is_active = TRUE`
	rows, err := q.Exec(ctx, query, id, next, now)
	if err != nil {
		return 0, err
	}
	return rows, nil
}

// DeactivateRule sets a rule to inactive.
func (r *RuleRepository) DeactivateRule(ctx context.Context, id string) error {
	q := database.GetQuerier(ctx)
	_, err := q.Exec(ctx,
		`UPDATE rules SET is_active = FALSE, updated_at = NOW() WHERE id = $1`, id)
	return err
}

func (r *RuleRepository) Delete(ctx context.Context, id string) error {
	q := database.GetQuerier(ctx)
	_, err := q.Exec(ctx, `DELETE FROM rules WHERE id = $1`, id)
	return err
}

// GetAccountBalance returns the current plaintext balance of an account.
func (r *RuleRepository) GetAccountBalance(ctx context.Context, accountID string) (int64, error) {
	q := database.GetQuerier(ctx)
	var balance int64
	err := q.QueryRow(ctx,
		`SELECT balance FROM accounts WHERE id = $1 AND deleted_at IS NULL`, accountID).Scan(&balance)
	if err != nil {
		if err == pgx.ErrNoRows {
			return 0, nil
		}
		return 0, err
	}
	return balance, nil
}

// UpdateAccountBalances atomically updates balances for multiple accounts
// within a transaction (use within database.WithTx). Uses SELECT FOR UPDATE
// to prevent race conditions.
func (r *RuleRepository) UpdateAccountBalances(ctx context.Context, updates []BalanceUpdate) error {
	q := database.GetQuerier(ctx)
	for _, u := range updates {
		var current int64
		err := q.QueryRow(ctx,
			`SELECT balance FROM accounts WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, u.AccountID).Scan(&current)
		if err != nil {
			return err
		}
		newBalance := current + u.Change
		_, err = q.Exec(ctx,
			`UPDATE accounts SET balance = $1, updated_at = NOW() WHERE id = $2`, newBalance, u.AccountID)
		if err != nil {
			return err
		}
	}
	return nil
}

// BalanceUpdate represents a balance change for an account.
type BalanceUpdate struct {
	AccountID string
	Change    int64 // in minor currency units (cents)
}

// GetUserPublicKey returns a user's X25519 public key.
func (r *RuleRepository) GetUserPublicKey(ctx context.Context, userID string) (string, error) {
	q := database.GetQuerier(ctx)
	var pubKey string
	err := q.QueryRow(ctx,
		`SELECT public_key FROM users WHERE id = $1`, userID).Scan(&pubKey)
	if err != nil {
		if err == pgx.ErrNoRows {
			return "", nil
		}
		return "", err
	}
	return pubKey, nil
}

// GetAccountCurrency returns the currency of an account.
func (r *RuleRepository) GetAccountCurrency(ctx context.Context, accountID string) (string, error) {
	q := database.GetQuerier(ctx)
	var currency string
	err := q.QueryRow(ctx,
		`SELECT currency FROM accounts WHERE id = $1 AND deleted_at IS NULL`, accountID).Scan(&currency)
	if err != nil {
		if err == pgx.ErrNoRows {
			return "", nil
		}
		return "", err
	}
	return currency, nil
}

// InsertRuleTransaction inserts a rule-generated transaction into the transactions hypertable.
func (r *RuleRepository) InsertRuleTransaction(ctx context.Context, tx *model.Transaction) error {
	q := database.GetQuerier(ctx)
	query := `INSERT INTO transactions (id, time, account_id, created_by, encrypted_payload, version, created_at, updated_at)
	          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`
	_, err := q.Exec(ctx, query,
		tx.ID, tx.Time, tx.AccountID, tx.CreatedBy, tx.EncryptedPayload,
		tx.Version, tx.CreatedAt, tx.UpdatedAt)
	return err
}
