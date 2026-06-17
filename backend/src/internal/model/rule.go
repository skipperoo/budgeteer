package model

import "time"

// Rule represents an automated payment or transfer rule.
type Rule struct {
	ID                    string     `json:"id"`
	CreatedBy             string     `json:"created_by"`
	Name                  string     `json:"name"`
	EncryptedPayload      string     `json:"encrypted_payload"`
	Frequency             string     `json:"frequency"`
	NextOccurrence        time.Time  `json:"next_occurrence"`
	EndDate               *time.Time `json:"end_date,omitempty"`
	MaxOccurrences        *int       `json:"max_occurrences,omitempty"`
	OccurrencesSoFar      int        `json:"occurrences_so_far"`
	LastTriggeredAt       *time.Time `json:"last_triggered_at,omitempty"`
	IsActive              bool       `json:"is_active"`
	Status                string     `json:"status"`
	TargetEmail           *string    `json:"target_email,omitempty"`
	TargetAccountEncrypted *string   `json:"target_account_encrypted,omitempty"`
	AlertOffset           *string    `json:"alert_offset,omitempty"` // e.g. "1 hour", "2 days" — plaintext for scheduler
	LastAlertedAt         *time.Time `json:"last_alerted_at,omitempty"`
	CreatedAt             time.Time  `json:"created_at"`
	UpdatedAt             time.Time  `json:"updated_at"`
}

// RulePayload is the decrypted payload inside EncryptedPayload.
type RulePayload struct {
	Type            string  `json:"type"`             // payment, transfer, user_transfer, income, mortgage
	Amount          float64 `json:"amount"`
	SourceAccountID string  `json:"source_account_id"`
	TargetAccountID string  `json:"target_account_id,omitempty"`
	TargetUserID    string  `json:"target_user_id,omitempty"`
	CategoryID      string  `json:"category_id,omitempty"`
	Notes           string  `json:"notes,omitempty"`
	Counterparty    string  `json:"counterparty,omitempty"`
	Commission      float64 `json:"commission,omitempty"` // fee added to amount; default 0

	// Mortgage-specific fields
	MortgageTotalAmount      float64 `json:"mortgage_total_amount,omitempty"`
	MortgageInterestRate     float64 `json:"mortgage_interest_rate,omitempty"`      // yearly rate in % (e.g. 3.5 = 3.5%)
	MortgageTermMonths       int     `json:"mortgage_term_months,omitempty"`        // total term in months
	MortgagePaymentDay       int     `json:"mortgage_payment_day,omitempty"`        // day of month (1-28)
	MortgageAmortizationType string  `json:"mortgage_amortization_type,omitempty"` // "french" or "italian"
	MortgageRemainingBalance float64 `json:"mortgage_remaining_balance,omitempty"`  // updated after each payment
}

// CreateRuleRequest is the API request body for creating a rule.
type CreateRuleRequest struct {
	Name             string  `json:"name"`
	EncryptedPayload string  `json:"encrypted_payload"`
	Frequency        string  `json:"frequency"`
	NextOccurrence   string  `json:"next_occurrence"`
	EndDate          string  `json:"end_date,omitempty"`
	MaxOccurrences   *int    `json:"max_occurrences,omitempty"`
	TargetEmail      string  `json:"target_email,omitempty"`
	AlertOffset      *string `json:"alert_offset,omitempty"` // e.g. "1 hour", "2 days"
}

// UpdateRuleRequest is the API request body for updating a rule.
type UpdateRuleRequest struct {
	Name             *string `json:"name,omitempty"`
	EncryptedPayload *string `json:"encrypted_payload,omitempty"`
	Frequency        *string `json:"frequency,omitempty"`
	NextOccurrence   *string `json:"next_occurrence,omitempty"`
	EndDate          *string `json:"end_date,omitempty"`
	MaxOccurrences   *int    `json:"max_occurrences,omitempty"`
	IsActive         *bool   `json:"is_active,omitempty"`
	AlertOffset      *string `json:"alert_offset,omitempty"`
}

// ServerPublicKeyResponse is returned by the public-key endpoint.
type ServerPublicKeyResponse struct {
	PublicKey string `json:"public_key"` // base64-encoded X25519 public key
}

// RulePublicKey is the endpoint path constant for the server public key.
// This endpoint is unauthenticated.
const RulePublicKeyEndpoint = "/api/v1/rules/public-key"
