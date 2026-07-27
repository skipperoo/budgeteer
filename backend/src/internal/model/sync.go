package model

import "time"

type SyncQueueItem struct {
	ID               string     `json:"id"`
	TargetUserID     string     `json:"target_user_id"`
	AccountID        *string    `json:"account_id,omitempty"`
	Action           string     `json:"action"`      // INSERT, UPDATE, DELETE
	EntityType       string     `json:"entity_type"` // transaction, account, checkpoint, account_metadata, etc.
	CheckpointMonth  *string    `json:"checkpoint_month,omitempty"` // for entity_type == "checkpoint"
	EncryptedPayload *string    `json:"encrypted_payload,omitempty"`
	SourceUpdatedAt  *time.Time `json:"source_updated_at,omitempty"` // LWW tiebreaker for checkpoint/account_metadata
	CreatedAt        time.Time  `json:"created_at"`
	ConsumedAt       *time.Time `json:"consumed_at,omitempty"`
}

type SyncPushRequest struct {
	Operations []SyncOperation `json:"operations"`
}

type SyncOperation struct {
	Action           string `json:"action"`
	EntityType       string `json:"entity_type"` // for transactions, still the account ID (legacy quirk)
	EntityID         string `json:"entity_id"`
	AccountID        string `json:"account_id,omitempty"`        // explicit account for checkpoint/account_metadata ops
	CheckpointMonth  string `json:"checkpoint_month,omitempty"` // for entity_type == "checkpoint"
	EncryptedPayload string `json:"encrypted_payload"`
	Timestamp        string `json:"timestamp"`                  // RFC3339 — used as source_updated_at for checkpoint/account_metadata
}

type SyncPullResponse struct {
	Items      []*SyncQueueItem `json:"items"`
	NextCursor *string          `json:"next_cursor,omitempty"`
	HasMore    bool             `json:"has_more"`
}
