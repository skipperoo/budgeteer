package model

import "time"

// Notification represents an in-app notification for the user.
type Notification struct {
	ID        string    `json:"id"`
	UserID    string    `json:"user_id"`
	Type      string    `json:"type"` // e.g. "rule_invitation", "account_invitation", "invitation_accepted", "invitation_expired"
	Title     string    `json:"title"`
	Body      string    `json:"body"`
	Data      *string   `json:"data,omitempty"` // JSON string with additional context
	IsRead    bool      `json:"is_read"`
	CreatedAt time.Time `json:"created_at"`
}

// NotificationData is the typed data stored in the Notification.Data JSON field.
type NotificationData struct {
	InvitationID  string `json:"invitation_id,omitempty"`
	RuleID        string `json:"rule_id,omitempty"`
	AccountID     string `json:"account_id,omitempty"`
	TransactionID string `json:"transaction_id,omitempty"`
	InvitedBy     string `json:"invited_by,omitempty"`
}
