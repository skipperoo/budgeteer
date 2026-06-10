package middleware

import (
	"encoding/json"
	"net/http"
	"runtime/debug"

	"budgeteer-backend/internal/logger"
	"budgeteer-backend/internal/model"
)

func Recover(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if err := recover(); err != nil {
				logger.Error("Caught panic: %v. Stack trace: %s", err, string(debug.Stack()))
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusInternalServerError)
				json.NewEncoder(w).Encode(model.Error{Error: "Internal Server Error"})
			}
		}()
		next.ServeHTTP(w, r)
	})
}
