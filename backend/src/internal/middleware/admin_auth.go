package middleware

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"

	"budgeteer-backend/internal/logger"
	"budgeteer-backend/internal/model"
	"budgeteer-backend/internal/service"
)

// AdminAuth is JWT middleware that also requires the "role": "admin" claim.
func AdminAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw := r.Header.Get("Authorization")
		if raw == "" || !strings.HasPrefix(raw, "Bearer ") {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(model.Error{Error: "unauthorized"})
			return
		}

		claims, tokenString, _, err := service.ValidateJWT(raw)
		if err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			logger.Error("Admin JWT validation error: %v", err)
			json.NewEncoder(w).Encode(model.Error{Error: "unauthorized"})
			return
		}

		// Verify admin role
		if claims.Role != "admin" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusForbidden)
			json.NewEncoder(w).Encode(model.Error{Error: "admin access required"})
			return
		}

		blocked, err := service.Auth.IsBlocked(r.Context(), tokenString)
		if err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(model.Error{Error: "internal server error"})
			return
		}
		if blocked {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(model.Error{Error: "token revoked"})
			return
		}

		ctx := context.WithValue(r.Context(), ClaimsKey, claims)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
