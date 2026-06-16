package model

import "time"

// Invitation represents a pending invitation for a rule or account.
type Invitation struct {
	ID            string    `json:"id"`
	EntityType    string    `json:"entity_type"` // "rule" or "account"
	EntityID      string    `json:"entity_id"`
	InvitedBy     string    `json:"invited_by"`
	InvitedEmail  string    `json:"invited_email"`
	InvitedUserID *string   `json:"invited_user_id,omitempty"`
	EncryptedData *string   `json:"encrypted_data,omitempty"`
	Status        string    `json:"status"` // pending, accepted, declined, expired
	CreatedAt     time.Time `json:"created_at"`
	ExpiresAt     time.Time `json:"expires_at"`
}

// InvitationActionRequest is the body for accepting/declining an invitation.
// For rule invitations, encrypted_account is required (the receiver's chosen
// account_id encrypted with the server's public key).
type InvitationActionRequest struct {
	EncryptedAccount string `json:"encrypted_account,omitempty"`
}
