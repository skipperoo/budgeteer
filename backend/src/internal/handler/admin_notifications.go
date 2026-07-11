package handler

import (
	"encoding/json"
	"net/http"

	"budgeteer-backend/internal/database"
	"budgeteer-backend/internal/model"
)

// AdminDispatchNotification creates in-app notifications and/or emails for selected users.
func AdminDispatchNotification(w http.ResponseWriter, r *http.Request) {
	if requireAdmin(w, r) == nil {
		return
	}
	var req model.AdminDispatchNotificationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(model.Error{Error: "invalid request body"})
		return
	}
	defer r.Body.Close()

	if req.Title == "" || req.Body == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(model.Error{Error: "title and body are required"})
		return
	}

	// Determine target users
	var userIDs []string
	if len(req.TargetEmails) > 0 {
		// Specific emails
		for _, email := range req.TargetEmails {
			var uid string
			err := database.Pool.QueryRow(r.Context(),
				`SELECT id FROM users WHERE email = $1`, email).Scan(&uid)
			if err == nil {
				userIDs = append(userIDs, uid)
			}
		}
	} else {
		// All users
		rows, err := database.Pool.Query(r.Context(), `SELECT id FROM users`)
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var uid string
				if rows.Scan(&uid) == nil {
					userIDs = append(userIDs, uid)
				}
			}
		}
	}

	if len(userIDs) == 0 {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(model.Error{Error: "no target users found"})
		return
	}

	// Create notifications
	for _, uid := range userIDs {
		_, err := database.Pool.Exec(r.Context(),
			`INSERT INTO notifications (user_id, type, title, body, created_at)
			 VALUES ($1, $2, $3, $4, NOW())`,
			uid, req.Type, req.Title, req.Body)
		if err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(model.Error{Error: err.Error()})
			return
		}
	}

	// Create emails if requested
	if req.SendEmail {
		emailBody := req.EmailBody
		if emailBody == "" {
			emailBody = req.Body
		}
		subject := req.EmailSubject
		if subject == "" {
			subject = req.Title
		}
		for _, uid := range userIDs {
			var email string
			err := database.Pool.QueryRow(r.Context(),
				`SELECT email FROM users WHERE id = $1`, uid).Scan(&email)
			if err != nil {
				continue
			}
			_, err = database.Pool.Exec(r.Context(),
				`INSERT INTO email_outbox (to_address, subject, body, status, created_at)
				 VALUES ($1, $2, $3, 'pending', NOW())`,
				email, subject, emailBody)
			if err != nil {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusInternalServerError)
				json.NewEncoder(w).Encode(model.Error{Error: err.Error()})
				return
			}
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":         "ok",
		"notifications_created": len(userIDs),
	})
}
