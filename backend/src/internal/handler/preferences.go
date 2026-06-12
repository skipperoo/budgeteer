package handler

import (
	"encoding/json"
	"net/http"

	"budgeteer-backend/internal/middleware"
	"budgeteer-backend/internal/model"
	"budgeteer-backend/internal/repository"
)

var prefsRepo = &repository.UserRepository{}

// GetPreferences returns the authenticated user's UI preferences.
func GetPreferences(w http.ResponseWriter, r *http.Request) {
	claims, ok := r.Context().Value(middleware.ClaimsKey).(*model.UserClaims)
	if !ok || claims == nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(model.Error{Error: "unauthorized"})
		return
	}

	prefs, err := prefsRepo.GetPreferences(r.Context(), claims.UserID)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(model.Error{Error: "failed to load preferences"})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(prefs)
}

// UpdatePreferences updates the authenticated user's UI preferences.
func UpdatePreferences(w http.ResponseWriter, r *http.Request) {
	claims, ok := r.Context().Value(middleware.ClaimsKey).(*model.UserClaims)
	if !ok || claims == nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(model.Error{Error: "unauthorized"})
		return
	}

	var req model.UpdatePreferencesRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(model.Error{Error: "invalid request body"})
		return
	}
	defer r.Body.Close()

	if err := prefsRepo.UpdatePreferences(r.Context(), claims.UserID, &req.Preferences); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(model.Error{Error: "failed to update preferences"})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(req.Preferences)
}
