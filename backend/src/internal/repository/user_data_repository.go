package repository

import (
	"context"
	"encoding/base64"
	"time"

	"budgeteer-backend/internal/database"
	"budgeteer-backend/internal/model"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

// UserDataRepository handles bulk data operations for user data
// export (dump), import (restore), and account deletion.
type UserDataRepository struct{}

// ============================================================
// Dump operations — read all user data
// ============================================================

// GetUserDumpInfo returns the user's non-sensitive info for export.
func (r *UserDataRepository) GetUserDumpInfo(ctx context.Context, userID string) (*model.UserDump, error) {
	q := database.GetQuerier(ctx)
	query := `SELECT id, email, public_key, encrypted_private_key, preferences, created_at, updated_at
	          FROM users WHERE id = $1`
	row := q.QueryRow(ctx, query, userID)
	u := &model.UserDump{}
	var prefsJSON []byte
	err := row.Scan(&u.ID, &u.Email, &u.PublicKey, &u.EncryptedPrivateKey,
		&prefsJSON, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	if len(prefsJSON) > 0 {
		u.Preferences.FromJSON(prefsJSON)
	}
	return u, nil
}

// GetUserAccounts returns all accounts the user has access to (via account_users),
// along with the user's account_user record for each.
func (r *UserDataRepository) GetUserAccounts(ctx context.Context, userID string) ([]*model.Account, []*model.AccountUser, error) {
	q := database.GetQuerier(ctx)
	query := `SELECT a.id, a.name, a.currency, a.type, a.created_by, a.encrypted_metadata, a.created_at, a.updated_at, a.deleted_at,
	                 au.account_id, au.user_id, au.encrypted_account_key, au.role, au.status, au.joined_at
	          FROM accounts a
	          JOIN account_users au ON au.account_id = a.id
	          WHERE au.user_id = $1 AND a.deleted_at IS NULL
	          ORDER BY a.created_at DESC`
	rows, err := q.Query(ctx, query, userID)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()

	var accounts []*model.Account
	var accountUsers []*model.AccountUser
	for rows.Next() {
		a := &model.Account{}
		au := &model.AccountUser{}
		var meta pgtype.Text
		err := rows.Scan(&a.ID, &a.Name, &a.Currency, &a.Type, &a.CreatedBy, &meta,
			&a.CreatedAt, &a.UpdatedAt, &a.DeletedAt,
			&au.AccountID, &au.UserID, &au.EncryptedAccountKey,
			&au.Role, &au.Status, &au.JoinedAt)
		if err != nil {
			return nil, nil, err
		}
		if meta.Valid {
			s := meta.String
			a.EncryptedMetadata = &s
		}
		accounts = append(accounts, a)
		accountUsers = append(accountUsers, au)
	}
	return accounts, accountUsers, nil
}

// GetAccountCheckpoints returns all monthly balance checkpoints for an account
// (used by the dump so the frontend can re-upload them on restore).
func (r *UserDataRepository) GetAccountCheckpoints(ctx context.Context, accountID string) ([]*model.Checkpoint, error) {
	q := database.GetQuerier(ctx)
	query := `SELECT account_id, checkpoint_month, encrypted_balance, created_at, updated_at
	          FROM transactions_checkpoints WHERE account_id = $1
	          ORDER BY checkpoint_month ASC`
	rows, err := q.Query(ctx, query, accountID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*model.Checkpoint
	for rows.Next() {
		c := &model.Checkpoint{}
		var month time.Time
		if err := rows.Scan(&c.AccountID, &month, &c.EncryptedBalance, &c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, err
		}
		c.CheckpointMonth = month.Format("2006-01-02")
		out = append(out, c)
	}
	return out, nil
}

// GetAccountTransactions returns all non-deleted transactions for an account.
func (r *UserDataRepository) GetAccountTransactions(ctx context.Context, accountID string) ([]*model.Transaction, error) {
	q := database.GetQuerier(ctx)
	query := `SELECT id, time, account_id, created_by, encrypted_payload, version, created_at, updated_at, deleted_at
	          FROM transactions WHERE account_id = $1 AND deleted_at IS NULL
	          ORDER BY time ASC`
	rows, err := q.Query(ctx, query, accountID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var txs []*model.Transaction
	for rows.Next() {
		t := &model.Transaction{}
		err := rows.Scan(&t.ID, &t.Time, &t.AccountID, &t.CreatedBy, &t.EncryptedPayload,
			&t.Version, &t.CreatedAt, &t.UpdatedAt, &t.DeletedAt)
		if err != nil {
			return nil, err
		}
		txs = append(txs, t)
	}
	return txs, nil
}

// GetTransactionDocuments returns all documents for a given transaction.
func (r *UserDataRepository) GetTransactionDocuments(ctx context.Context, transactionID string) ([]*model.TransactionDocument, error) {
	q := database.GetQuerier(ctx)
	query := `SELECT id, transaction_id, encrypted_data, mime_type, file_name, file_size, created_at
	          FROM transaction_documents WHERE transaction_id = $1 ORDER BY created_at ASC`
	rows, err := q.Query(ctx, query, transactionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var docs []*model.TransactionDocument
	for rows.Next() {
		d := &model.TransactionDocument{}
		err := rows.Scan(&d.ID, &d.TransactionID, &d.EncryptedData, &d.MimeType,
			&d.FileName, &d.FileSize, &d.CreatedAt)
		if err != nil {
			return nil, err
		}
		docs = append(docs, d)
	}
	return docs, nil
}

// GetUserCategories returns all categories for a user.
func (r *UserDataRepository) GetUserCategories(ctx context.Context, userID string) ([]*model.UserCategory, error) {
	q := database.GetQuerier(ctx)
	query := `SELECT id, user_id, name, type, created_at FROM user_categories WHERE user_id = $1 ORDER BY created_at ASC`
	rows, err := q.Query(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cats []*model.UserCategory
	for rows.Next() {
		c := &model.UserCategory{}
		if err := rows.Scan(&c.ID, &c.UserID, &c.Name, &c.Type, &c.CreatedAt); err != nil {
			return nil, err
		}
		cats = append(cats, c)
	}
	return cats, nil
}

// GetUserBudgets returns all budgets for a user.
func (r *UserDataRepository) GetUserBudgets(ctx context.Context, userID string) ([]*model.Budget, error) {
	rr := &BudgetRepository{}
	return rr.ListByUserID(ctx, userID)
}

// GetUserRules returns all rules created by a user.
func (r *UserDataRepository) GetUserRules(ctx context.Context, userID string) ([]*model.Rule, error) {
	rr := &RuleRepository{}
	return rr.ListByUserID(ctx, userID)
}

// GetUserNotifications returns all notifications for a user.
func (r *UserDataRepository) GetUserNotifications(ctx context.Context, userID string) ([]*model.Notification, error) {
	query := `SELECT id, user_id, type, title, body, data, is_read, created_at
	          FROM notifications WHERE user_id = $1 ORDER BY created_at DESC`
	rows, err := database.Pool.Query(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var notifs []*model.Notification
	for rows.Next() {
		n := &model.Notification{}
		if err := rows.Scan(&n.ID, &n.UserID, &n.Type, &n.Title, &n.Body, &n.Data, &n.IsRead, &n.CreatedAt); err != nil {
			return nil, err
		}
		notifs = append(notifs, n)
	}
	return notifs, nil
}

// GetUserInvitations returns all invitations sent by or addressed to a user.
func (r *UserDataRepository) GetUserInvitations(ctx context.Context, userID, userEmail string) (sent []*model.Invitation, received []*model.Invitation, err error) {
	q := database.GetQuerier(ctx)

	// Invitations sent
	sentQuery := `SELECT id, entity_type, entity_id, invited_by, invited_email, invited_user_id, encrypted_data, status, created_at, expires_at
	              FROM invitations WHERE invited_by = $1 ORDER BY created_at DESC`
	sRows, err := q.Query(ctx, sentQuery, userID)
	if err != nil {
		return nil, nil, err
	}
	defer sRows.Close()
	for sRows.Next() {
		inv := &model.Invitation{}
		if err := scanInvitationRow(sRows, inv); err != nil {
			return nil, nil, err
		}
		sent = append(sent, inv)
	}

	// Invitations received (by user ID or email)
	receivedQuery := `SELECT id, entity_type, entity_id, invited_by, invited_email, invited_user_id, encrypted_data, status, created_at, expires_at
	                  FROM invitations WHERE invited_user_id = $1 OR invited_email = $2 ORDER BY created_at DESC`
	rRows, err := q.Query(ctx, receivedQuery, userID, userEmail)
	if err != nil {
		return nil, nil, err
	}
	defer rRows.Close()
	for rRows.Next() {
		inv := &model.Invitation{}
		if err := scanInvitationRow(rRows, inv); err != nil {
			return nil, nil, err
		}
		received = append(received, inv)
	}

	return sent, received, nil
}

// scanInvitationRow scans an invitation from a row set (pgx.Rows).
func scanInvitationRow(row pgx.Row, inv *model.Invitation) error {
	var invitedUserID, encryptedData *string
	err := row.Scan(&inv.ID, &inv.EntityType, &inv.EntityID, &inv.InvitedBy,
		&inv.InvitedEmail, &invitedUserID, &encryptedData,
		&inv.Status, &inv.CreatedAt, &inv.ExpiresAt)
	if err != nil {
		return err
	}
	inv.InvitedUserID = invitedUserID
	inv.EncryptedData = encryptedData
	return nil
}

// GetUserSavingsPlans returns all savings plans created by a user.
func (r *UserDataRepository) GetUserSavingsPlans(ctx context.Context, userID string) ([]*model.SavingsPlan, error) {
	q := database.GetQuerier(ctx)
	query := `SELECT id, account_id, source_account_id, created_by, currency,
	                 tracking_start, tracking_end, last_logged_at, encrypted_payload,
	                 is_active, created_at, updated_at
	          FROM savings_plans WHERE created_by = $1 ORDER BY created_at DESC`
	rows, err := q.Query(ctx, query, userID)
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

// GetUserRecurringTransactions returns all recurring transactions created by a user.
func (r *UserDataRepository) GetUserRecurringTransactions(ctx context.Context, userID string) ([]*model.RecurringTransaction, error) {
	q := database.GetQuerier(ctx)
	query := `SELECT id, account_id, created_by, frequency, next_occurrence, end_date,
	                 encrypted_payload, is_active, created_at, updated_at
	          FROM recurring_transactions WHERE created_by = $1 ORDER BY created_at DESC`
	rows, err := q.Query(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var rts []*model.RecurringTransaction
	for rows.Next() {
		rt := &model.RecurringTransaction{}
		if err := rows.Scan(&rt.ID, &rt.AccountID, &rt.CreatedBy, &rt.Frequency,
			&rt.NextOccurrence, &rt.EndDate, &rt.EncryptedPayload,
			&rt.IsActive, &rt.CreatedAt, &rt.UpdatedAt); err != nil {
			return nil, err
		}
		rts = append(rts, rt)
	}
	return rts, nil
}

// ============================================================
// Delete operations — remove all user data
// ============================================================

// DeleteUserData removes ALL data associated with the given user and
// then deletes the user record itself. The sequence is:
//
//  1. Delete all user-scoped data (categories, budgets, notifications,
//     rules, sync_queue, access_secrets, OTPs, savings plans, recurring
//     transactions, invitations).
//  2. Delete documents for transactions created by the user.
//  3. Delete transactions in personal accounts owned by the user (these
//     accounts are deleted next).
//  4. Hard-delete personal accounts (created by the user, type = 'personal').
//  5. NULL out `created_by` on remaining transactions (those in joint
//     accounts), so financial data is preserved for other members.
//  6. NULL out `created_by` on remaining accounts (joint accounts the
//     user created), so the account remains usable by other members.
//  7. Remove the user from all account_users memberships.
//  8. DELETE the user record.
//
// Transactions sent to other users via send-to-user are separate rows
// in the recipients' accounts and are untouched.
func (r *UserDataRepository) DeleteUserData(ctx context.Context, userID string) ([]string, error) {
	q := database.GetQuerier(ctx)

	// Track personal account IDs that get hard-deleted.
	deletedAccounts := make([]string, 0)

	// ── 1. Delete user-scoped data ───────────────────────────
	if _, err := q.Exec(ctx, `DELETE FROM user_categories WHERE user_id = $1`, userID); err != nil {
		return nil, err
	}
	if _, err := q.Exec(ctx, `DELETE FROM budgets WHERE user_id = $1`, userID); err != nil {
		return nil, err
	}
	if _, err := q.Exec(ctx, `DELETE FROM notifications WHERE user_id = $1`, userID); err != nil {
		return nil, err
	}
	if _, err := q.Exec(ctx, `DELETE FROM rules WHERE created_by = $1`, userID); err != nil {
		return nil, err
	}
	if _, err := q.Exec(ctx, `DELETE FROM sync_queue WHERE target_user_id = $1`, userID); err != nil {
		return nil, err
	}
	if _, err := q.Exec(ctx, `DELETE FROM access_secrets WHERE user_id = $1`, userID); err != nil {
		return nil, err
	}
	if _, err := q.Exec(ctx, `DELETE FROM otps WHERE user_id = $1`, userID); err != nil {
		return nil, err
	}
	if _, err := q.Exec(ctx, `DELETE FROM savings_plans WHERE created_by = $1`, userID); err != nil {
		return nil, err
	}
	if _, err := q.Exec(ctx, `DELETE FROM recurring_transactions WHERE created_by = $1`, userID); err != nil {
		return nil, err
	}
	if _, err := q.Exec(ctx, `DELETE FROM invitations WHERE invited_by = $1`, userID); err != nil {
		return nil, err
	}
	if _, err := q.Exec(ctx, `DELETE FROM invitations WHERE invited_user_id = $1`, userID); err != nil {
		return nil, err
	}

	// ── 2. Delete documents for transactions created BY the user ──
	if _, err := q.Exec(ctx,
		`DELETE FROM transaction_documents WHERE transaction_id IN
		 (SELECT id FROM transactions WHERE created_by = $1)`, userID); err != nil {
		return nil, err
	}

	// ── 3. Find personal accounts created by the user ────────────
	rows, err := q.Query(ctx,
		`SELECT id FROM accounts WHERE created_by = $1 AND type = 'personal'`, userID)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var acctID string
		if err := rows.Scan(&acctID); err != nil {
			rows.Close()
			return nil, err
		}
		deletedAccounts = append(deletedAccounts, acctID)
	}
	rows.Close()

	// Delete all transactions in those personal accounts.
	// (transaction_documents already cleaned up in step 2.)
	for _, acctID := range deletedAccounts {
		if _, err := q.Exec(ctx,
			`DELETE FROM transactions WHERE account_id = $1`, acctID); err != nil {
			return nil, err
		}
	}

	// ── 4. Hard-delete personal accounts ─────────────────────────
	for _, acctID := range deletedAccounts {
		if _, err := q.Exec(ctx, `DELETE FROM accounts WHERE id = $1`, acctID); err != nil {
			return nil, err
		}
	}

	// ── 5. NULL out created_by on remaining transactions ─────────
	//      (transactions in joint accounts — preserve financial data
	//       for other members but remove the FK reference).
	if _, err := q.Exec(ctx,
		`UPDATE transactions SET created_by = NULL WHERE created_by = $1`, userID); err != nil {
		return nil, err
	}

	// ── 6. NULL out created_by on remaining accounts ─────────────
	//      (joint accounts the user created — preserve the account
	//       for other members).
	if _, err := q.Exec(ctx,
		`UPDATE accounts SET created_by = NULL WHERE created_by = $1`, userID); err != nil {
		return nil, err
	}

	// ── 7. Remove user from all account_users memberships ────────
	if _, err := q.Exec(ctx,
		`DELETE FROM account_users WHERE user_id = $1`, userID); err != nil {
		return nil, err
	}

	// ── 8. Delete the user record ────────────────────────────────
	//      By this point all FK references are gone:
	//        - Everything referencing users(id) has been deleted,
	//          set to NULL, or cascaded.
	if _, err := q.Exec(ctx, `DELETE FROM users WHERE id = $1`, userID); err != nil {
		return nil, err
	}

	return deletedAccounts, nil
}

// ============================================================
// Clear operations — delete all user data for restore
// ============================================================

// ClearUserDataForRestore removes ALL the user's existing data in
// preparation for a restore. Unlike DeleteUserData, this also
// deletes transactions and account data completely (hard delete),
// because the restore will recreate everything.
//
// Only data owned by this user is deleted:
//   - Transactions created BY the user (not by other users in joint accounts)
//   - Accounts created BY the user (joint accounts created by others are kept)
//
// The user's row in the users table is preserved (password, keys).
func (r *UserDataRepository) ClearUserDataForRestore(ctx context.Context, userID string) error {
	q := database.GetQuerier(ctx)

	// 1. Delete user categories
	if _, err := q.Exec(ctx, `DELETE FROM user_categories WHERE user_id = $1`, userID); err != nil {
		return err
	}

	// 2. Delete budgets
	if _, err := q.Exec(ctx, `DELETE FROM budgets WHERE user_id = $1`, userID); err != nil {
		return err
	}

	// 3. Delete notifications
	if _, err := q.Exec(ctx, `DELETE FROM notifications WHERE user_id = $1`, userID); err != nil {
		return err
	}

	// 4. Delete rules created by user
	if _, err := q.Exec(ctx, `DELETE FROM rules WHERE created_by = $1`, userID); err != nil {
		return err
	}

	// 5. Delete sync_queue entries
	if _, err := q.Exec(ctx, `DELETE FROM sync_queue WHERE target_user_id = $1`, userID); err != nil {
		return err
	}

	// 6. Delete access_secrets
	if _, err := q.Exec(ctx, `DELETE FROM access_secrets WHERE user_id = $1`, userID); err != nil {
		return err
	}

	// 7. Delete OTPs
	if _, err := q.Exec(ctx, `DELETE FROM otps WHERE user_id = $1`, userID); err != nil {
		return err
	}

	// 8. Delete savings plans created by user
	if _, err := q.Exec(ctx, `DELETE FROM savings_plans WHERE created_by = $1`, userID); err != nil {
		return err
	}

	// 9. Delete recurring transactions created by user
	if _, err := q.Exec(ctx, `DELETE FROM recurring_transactions WHERE created_by = $1`, userID); err != nil {
		return err
	}

	// 10. Delete invitations (sent or received)
	if _, err := q.Exec(ctx, `DELETE FROM invitations WHERE invited_by = $1`, userID); err != nil {
		return err
	}
	if _, err := q.Exec(ctx, `DELETE FROM invitations WHERE invited_user_id = $1`, userID); err != nil {
		return err
	}

	// 11. Delete transaction documents for transactions created BY the user
	//     (not transactions created by other users in joint accounts).
	if _, err := q.Exec(ctx,
		`DELETE FROM transaction_documents WHERE transaction_id IN
		 (SELECT id FROM transactions WHERE created_by = $1)`, userID); err != nil {
		return err
	}

	// 12. Delete transactions created BY the user (not by other users in joint accounts)
	if _, err := q.Exec(ctx, `DELETE FROM transactions WHERE created_by = $1`, userID); err != nil {
		return err
	}

	// 13. Delete accounts created BY the user (personal accounts).
	//     Joint accounts created by other users are preserved — they'll be
	//     re-linked via account_users in the restore step.
	if _, err := q.Exec(ctx, `DELETE FROM accounts WHERE created_by = $1`, userID); err != nil {
		return err
	}

	// 14. Remove user from remaining accounts (joint accounts created by others)
	if _, err := q.Exec(ctx, `DELETE FROM account_users WHERE user_id = $1`, userID); err != nil {
		return err
	}

	return nil
}

// ============================================================
// Helpers
// ============================================================

// EncodeDocumentData base64-encodes binary document data for JSON transport.
func EncodeDocumentData(data []byte) string {
	return base64.StdEncoding.EncodeToString(data)
}

// DecodeDocumentData base64-decodes document data from JSON transport.
func DecodeDocumentData(encoded string) ([]byte, error) {
	return base64.StdEncoding.DecodeString(encoded)
}
