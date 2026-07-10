package model

import "time"

// PendingMigration represents a client-side migration that needs to run.
type PendingMigration struct {
	ID           string     `json:"id"`
	UserID       string     `json:"user_id"`
	MigrationKey string     `json:"migration_key"`
	Status       string     `json:"status"` // pending, completed, failed
	ErrorMessage *string    `json:"error_message,omitempty"`
	CreatedAt    time.Time  `json:"created_at"`
	CompletedAt  *time.Time `json:"completed_at,omitempty"`
}

// ListPendingMigrationsResponse wraps the list endpoint response.
type ListPendingMigrationsResponse struct {
	Migrations []*PendingMigration `json:"migrations"`
}

// CompleteMigrationRequest is the payload for completing a migration.
type CompleteMigrationRequest struct {
	MigrationKey string `json:"migration_key"`
}

// CompleteMigrationResponse is returned after marking a migration complete.
type CompleteMigrationResponse struct {
	Status string `json:"status"`
}
