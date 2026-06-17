package model

import "time"

// Budget represents a user-defined monthly/yearly spending limit.
// The sensitive payload (amount, category) is ECIES-encrypted with
// the user's X25519 public key.
type Budget struct {
	ID                string     `json:"id"`
	UserID            string     `json:"user_id"`
	AccountID         *string    `json:"account_id,omitempty"`
	EncryptedPayload  string     `json:"encrypted_payload"`
	Period            string     `json:"period"`
	StartDate         string     `json:"start_date"`
	EndDate           *string    `json:"end_date,omitempty"`
	LastNotified50    bool       `json:"-"`
	LastNotified80    bool       `json:"-"`
	LastNotified100   bool       `json:"-"`
	CreatedAt         time.Time  `json:"created_at"`
	UpdatedAt         time.Time  `json:"updated_at"`
}

// BudgetPayload is the decrypted payload inside EncryptedPayload.
type BudgetPayload struct {
	Amount   float64 `json:"amount"`
	Category string  `json:"category,omitempty"`
}

// CreateBudgetRequest is the API request body for creating a budget.
type CreateBudgetRequest struct {
	AccountID        *string `json:"account_id,omitempty"`
	EncryptedPayload string  `json:"encrypted_payload"`
	Period           string  `json:"period"`
	StartDate        string  `json:"start_date"`
	EndDate          *string `json:"end_date,omitempty"`
}

// UpdateBudgetRequest is the API request body for updating a budget.
type UpdateBudgetRequest struct {
	AccountID        *string `json:"account_id,omitempty"`
	EncryptedPayload *string `json:"encrypted_payload,omitempty"`
	Period           *string `json:"period,omitempty"`
	StartDate        *string `json:"start_date,omitempty"`
	EndDate          *string `json:"end_date,omitempty"`
}

// NotifyBudgetRequest is the body for triggering a budget threshold notification.
type NotifyBudgetRequest struct {
	Threshold int `json:"threshold"` // 50, 80, or 100
}
