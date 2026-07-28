package model

import "time"

// ============================================================
// Dump models — returned by GET /api/v1/user/dump
// ============================================================

// UserDataDump is the complete dump of a user's data.
// Encrypted blobs are returned as-is (client decrypts locally).
type UserDataDump struct {
	User                *UserDump              `json:"user"`
	Accounts            []*AccountDump         `json:"accounts"`
	Categories          []*UserCategory        `json:"categories"`
	Budgets             []*Budget              `json:"budgets"`
	Rules               []*Rule                `json:"rules"`
	Notifications       []*Notification        `json:"notifications"`
	InvitationsSent     []*Invitation          `json:"invitations_sent"`
	InvitationsReceived []*Invitation          `json:"invitations_received"`
	SavingsPlans        []*SavingsPlan         `json:"savings_plans"`
	RecurringTxs        []*RecurringTransaction `json:"recurring_transactions"`
}

// UserDump is the non-sensitive user info exported in a dump.
// The password_hash is NEVER exported.
type UserDump struct {
	ID                  string          `json:"id"`
	Email               string          `json:"email"`
	PublicKey           string          `json:"public_key"`
	EncryptedPrivateKey string          `json:"encrypted_private_key"`
	Preferences         UserPreferences `json:"preferences"`
	CreatedAt           time.Time       `json:"created_at"`
	UpdatedAt           time.Time       `json:"updated_at"`
}

// AccountDump is an account with all its associated data.
type AccountDump struct {
	Account          *Account                `json:"account"`
	AccountUser      *AccountUser            `json:"account_user"`
	Transactions     []*Transaction          `json:"transactions"`
	Documents        []*TransactionDocument  `json:"documents"`
	Checkpoints      []*Checkpoint           `json:"checkpoints,omitempty"`
}

// ============================================================
// Delete models
// ============================================================

// DeleteAccountRequest is the confirmation body for account deletion.
type DeleteAccountRequest struct {
	Confirmation string `json:"confirmation"`
}
