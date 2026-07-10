package handler

import (
	"encoding/json"
	"net/http"

	"budgeteer-backend/internal/middleware"
	"budgeteer-backend/internal/model"
	"budgeteer-backend/internal/repository"
)

var migrationRepo = &repository.MigrationRepository{}

// ListPendingMigrations returns all pending migrations for the authenticated user.
func ListPendingMigrations(w http.ResponseWriter, r *http.Request) {
	claims, ok := r.Context().Value(middleware.ClaimsKey).(*model.UserClaims)
	if !ok || claims == nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(model.Error{Error: "unauthorized"})
		return
	}

	migrations, err := migrationRepo.ListPending(r.Context(), claims.UserID)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(model.Error{Error: "failed to list migrations"})
		return
	}

	if migrations == nil {
		migrations = []*model.PendingMigration{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(model.ListPendingMigrationsResponse{Migrations: migrations})
}

// CompleteMigration marks a pending migration as completed.
func CompleteMigration(w http.ResponseWriter, r *http.Request) {
	claims, ok := r.Context().Value(middleware.ClaimsKey).(*model.UserClaims)
	if !ok || claims == nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(model.Error{Error: "unauthorized"})
		return
	}

	var req model.CompleteMigrationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(model.Error{Error: "invalid request body"})
		return
	}
	defer r.Body.Close()

	if req.MigrationKey == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(model.Error{Error: "migration_key is required"})
		return
	}

	rows, err := migrationRepo.Complete(r.Context(), claims.UserID, req.MigrationKey)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(model.Error{Error: "failed to complete migration"})
		return
	}
	if rows == 0 {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(model.Error{Error: "pending migration not found"})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(model.CompleteMigrationResponse{Status: "completed"})
}

// FailMigration marks a pending migration as failed.
func FailMigration(w http.ResponseWriter, r *http.Request) {
	claims, ok := r.Context().Value(middleware.ClaimsKey).(*model.UserClaims)
	if !ok || claims == nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(model.Error{Error: "unauthorized"})
		return
	}

	var req struct {
		MigrationKey string `json:"migration_key"`
		Error        string `json:"error"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(model.Error{Error: "invalid request body"})
		return
	}
	defer r.Body.Close()

	if req.MigrationKey == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(model.Error{Error: "migration_key is required"})
		return
	}

	if err := migrationRepo.Fail(r.Context(), claims.UserID, req.MigrationKey, req.Error); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(model.Error{Error: "failed to update migration"})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(model.CompleteMigrationResponse{Status: "failed"})
}
