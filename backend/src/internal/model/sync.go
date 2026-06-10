package model

import "time"

type SyncQueueItem struct {
	ID               string     `json:"id"`
	TargetUserID     string     `json:"target_user_id"`
	AccountID        string     `json:"account_id"`
	Action           string     `json:"action"`      // INSERT, UPDATE, DELETE
	EntityType       string     `json:"entity_type"` // transaction, account, etc.
	EncryptedPayload *string    `json:"encrypted_payload,omitempty"`
	CreatedAt        time.Time  `json:"created_at"`
	ConsumedAt       *time.Time `json:"consumed_at,omitempty"`
}

type SyncPushRequest struct {
	Operations []SyncOperation `json:"operations"`
}

type SyncOperation struct {
	Action           string `json:"action"`
	EntityType       string `json:"entity_type"`
	EntityID         string `json:"entity_id"`
	EncryptedPayload string `json:"encrypted_payload"`
	Timestamp        string `json:"timestamp"`
}

type SyncPullResponse struct {
	Items      []*SyncQueueItem `json:"items"`
	NextCursor *string          `json:"next_cursor,omitempty"`
	HasMore    bool             `json:"has_more"`
}
