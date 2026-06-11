package model

import "time"

type CreateTransactionRequest struct {
	AccountID        string    `json:"account_id"`
	Time             time.Time `json:"time"`
	EncryptedPayload string    `json:"encrypted_payload"`
}

type Transaction struct {
	ID               string    `json:"id"`
	Time             time.Time `json:"time"`
	AccountID        string    `json:"account_id"`
	CreatedBy        string    `json:"created_by"`
	EncryptedPayload string    `json:"encrypted_payload"`
	Version          int       `json:"version"`
	CreatedAt        time.Time `json:"created_at"`
	UpdatedAt        time.Time `json:"updated_at"`
	DeletedAt        *time.Time `json:"deleted_at,omitempty"`
}

type RecurringTransaction struct {
	ID               string    `json:"id"`
	AccountID        string    `json:"account_id"`
	CreatedBy        string    `json:"created_by"`
	Frequency        string    `json:"frequency"`
	NextOccurrence   time.Time `json:"next_occurrence"`
	EndDate          *time.Time `json:"end_date,omitempty"`
	EncryptedPayload string    `json:"encrypted_payload"`
	IsActive         bool      `json:"is_active"`
	CreatedAt        time.Time `json:"created_at"`
	UpdatedAt        time.Time `json:"updated_at"`
}

type SavingsPlan struct {
	ID               string    `json:"id"`
	AccountID        string    `json:"account_id"`
	SourceAccountID  string    `json:"source_account_id"`
	CreatedBy        string    `json:"created_by"`
	Currency         string    `json:"currency"`
	TrackingStart    time.Time `json:"tracking_start"`
	TrackingEnd      time.Time `json:"tracking_end"`
	LastLoggedAt     *time.Time `json:"last_logged_at,omitempty"`
	EncryptedPayload string    `json:"encrypted_payload"`
	IsActive         bool      `json:"is_active"`
	CreatedAt        time.Time `json:"created_at"`
	UpdatedAt        time.Time `json:"updated_at"`
}
