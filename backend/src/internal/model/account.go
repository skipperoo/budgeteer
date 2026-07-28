package model

import (
	"time"
)

type Account struct {
	ID                 string     `json:"id"`
	Name               string     `json:"name"`
	Currency           string     `json:"currency"`
	Type               string     `json:"type"` // personal, joint, savings
	CreatedBy          string     `json:"created_by"`
	EncryptedMetadata  *string    `json:"encrypted_metadata,omitempty"` // AES-GCM(account key) JSON {opening_balance,...}
	CreatedAt          time.Time  `json:"created_at"`
	UpdatedAt          time.Time  `json:"updated_at"`
	DeletedAt          *time.Time `json:"deleted_at,omitempty"`
}

type CreateAccountRequest struct {
	Name                string  `json:"name"`
	Currency             string  `json:"currency"`
	Type                 string  `json:"type"`
	EncryptedAccountKey  string  `json:"encrypted_account_key"`
	EncryptedMetadata    *string `json:"encrypted_metadata,omitempty"` // optional at creation time
}

type AccountUser struct {
	AccountID           string    `json:"account_id"`
	UserID              string    `json:"user_id"`
	EncryptedAccountKey string    `json:"encrypted_account_key"`
	Role                string    `json:"role"`
	Status              string    `json:"status"` // pending_accepted, active
	JoinedAt            time.Time `json:"joined_at"`
}

type InviteRequest struct {
	UserEmail           string `json:"user_email"`
	EncryptedAccountKey string `json:"encrypted_account_key"`
}
