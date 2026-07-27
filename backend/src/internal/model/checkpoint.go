package model

import "time"

// Checkpoint is a monthly balance prefix-sum row for an account.
// Metadata (AccountID, CheckpointMonth) is plaintext for filtering;
// EncryptedBalance is an AES-GCM(account-key) JSON blob {balance, tx_count}
// that only the frontend can read.
type Checkpoint struct {
	AccountID        string    `json:"account_id"`
	CheckpointMonth  string    `json:"checkpoint_month"` // DATE, e.g. "2025-07-31"
	EncryptedBalance string    `json:"encrypted_balance"`
	CreatedAt        time.Time `json:"created_at"`
	UpdatedAt        time.Time `json:"updated_at"`
}

// UpsertCheckpointsRequest is the body of PUT /api/v1/accounts/{id}/checkpoints.
type UpsertCheckpointsRequest struct {
	Checkpoints []CheckpointInput `json:"checkpoints"`
}

// CheckpointInput is a single upsert entry.
type CheckpointInput struct {
	CheckpointMonth  string `json:"checkpoint_month"` // e.g. "2025-07-31"
	EncryptedBalance string `json:"encrypted_balance"`
}

// VerifyCheckpointsRequest is the body of POST /api/v1/accounts/{id}/checkpoints/verify.
type VerifyCheckpointsRequest struct {
	Months []string `json:"months"` // checkpoint_month endpoints, e.g. ["2025-07-31"]
}

// VerifyCheckpointsResponse returns the plaintext tx_count up to each month,
// so the frontend can compare to the tx_count it stored encrypted.
type VerifyCheckpointsResponse struct {
	Counts []CheckpointCount `json:"counts"`
}

// CheckpointCount is one row of the verify response.
type CheckpointCount struct {
	CheckpointMonth string `json:"checkpoint_month"`
	TxCount         int    `json:"tx_count"`
}