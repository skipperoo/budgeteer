package handler

import (
	"encoding/json"
	"net/http"

	"budgeteer-backend/internal/database"
	"budgeteer-backend/internal/model"
)

// AdminListClientMigrations returns all client-side migrations grouped by user.
func AdminListClientMigrations(w http.ResponseWriter, r *http.Request) {
	if requireAdmin(w, r) == nil {
		return
	}
	query := `SELECT pm.id, pm.user_id, u.email, pm.migration_key, pm.status,
	                 pm.error_message, pm.created_at, pm.completed_at
	          FROM pending_migrations pm
	          JOIN users u ON u.id = pm.user_id
	          ORDER BY pm.created_at DESC`
	rows, err := database.Pool.Query(r.Context(), query)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(model.Error{Error: err.Error()})
		return
	}
	defer rows.Close()

	var records []model.ClientMigrationRecord
	for rows.Next() {
		rec := model.ClientMigrationRecord{}
		if err := rows.Scan(&rec.ID, &rec.UserID, &rec.UserEmail, &rec.MigrationKey,
			&rec.Status, &rec.ErrorMessage, &rec.CreatedAt, &rec.CompletedAt); err != nil {
			continue
		}
		records = append(records, rec)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(records)
}

// AdminBulkRescheduleMigration bulk-reschedules a migration for selected users.
func AdminBulkRescheduleMigration(w http.ResponseWriter, r *http.Request) {
	if requireAdmin(w, r) == nil {
		return
	}
	var req struct {
		MigrationKey string   `json:"migration_key"`
		UserIDs      []string `json:"user_ids"` // empty = all users
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

	if len(req.UserIDs) > 0 {
		// Reschedule only for specific users
		for _, uid := range req.UserIDs {
			_, err := database.Pool.Exec(r.Context(),
				`INSERT INTO pending_migrations (user_id, migration_key, status)
				 VALUES ($1, $2, 'pending')
				 ON CONFLICT (user_id, migration_key) DO UPDATE SET status = 'pending', error_message = NULL, completed_at = NULL`,
				uid, req.MigrationKey)
			if err != nil {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusInternalServerError)
				json.NewEncoder(w).Encode(model.Error{Error: err.Error()})
				return
			}
		}
	} else {
		// Reschedule for all users
		_, err := database.Pool.Exec(r.Context(),
			`INSERT INTO pending_migrations (user_id, migration_key, status)
			 SELECT id, $1, 'pending' FROM users
			 ON CONFLICT (user_id, migration_key) DO UPDATE SET status = 'pending', error_message = NULL, completed_at = NULL`,
			req.MigrationKey)
		if err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(model.Error{Error: err.Error()})
			return
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

// AdminUpdateMigrationStatus allows an admin to edit a migration's status directly.
func AdminUpdateMigrationStatus(w http.ResponseWriter, r *http.Request) {
	if requireAdmin(w, r) == nil {
		return
	}
	migrationID := r.PathValue("id")
	if migrationID == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(model.Error{Error: "migration id is required"})
		return
	}

	var req struct {
		Status string `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(model.Error{Error: "invalid request body"})
		return
	}
	defer r.Body.Close()

	validStatuses := map[string]bool{"pending": true, "completed": true, "failed": true}
	if !validStatuses[req.Status] {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(model.Error{Error: "invalid status"})
		return
	}

	_, err := database.Pool.Exec(r.Context(),
		`UPDATE pending_migrations SET status = $1,
		 completed_at = CASE WHEN $1 = 'completed' THEN NOW() ELSE NULL END,
		 error_message = CASE WHEN $1 = 'failed' THEN 'Manually set by admin' ELSE NULL END
		 WHERE id = $2`,
		req.Status, migrationID)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(model.Error{Error: err.Error()})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}
