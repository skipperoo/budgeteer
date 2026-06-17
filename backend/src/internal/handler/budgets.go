package handler

import (
	"encoding/json"
	"net/http"

	"budgeteer-backend/internal/logger"
	"budgeteer-backend/internal/middleware"
	"budgeteer-backend/internal/model"
	"budgeteer-backend/internal/service"
)

// ListBudgets returns all budgets for the authenticated user.
func ListBudgets(w http.ResponseWriter, r *http.Request) {
	claims, ok := r.Context().Value(middleware.ClaimsKey).(*model.UserClaims)
	if !ok || claims == nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(model.Error{Error: "unauthorized"})
		return
	}

	budgets, err := service.Budgets.ListBudgets(r.Context(), claims.UserID)
	if err != nil {
		logger.Error("ListBudgets: %v", err)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(model.Error{Error: "failed to list budgets"})
		return
	}

	if budgets == nil {
		budgets = []*model.Budget{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(budgets)
}

// CreateBudget creates a new budget for the authenticated user.
func CreateBudget(w http.ResponseWriter, r *http.Request) {
	claims, ok := r.Context().Value(middleware.ClaimsKey).(*model.UserClaims)
	if !ok || claims == nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(model.Error{Error: "unauthorized"})
		return
	}

	var req model.CreateBudgetRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(model.Error{Error: "invalid request body"})
		return
	}

	budget, err := service.Budgets.CreateBudget(r.Context(), claims.UserID, &req)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(model.Error{Error: err.Error()})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(budget)
}

// UpdateBudget updates a budget.
func UpdateBudget(w http.ResponseWriter, r *http.Request) {
	claims, ok := r.Context().Value(middleware.ClaimsKey).(*model.UserClaims)
	if !ok || claims == nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(model.Error{Error: "unauthorized"})
		return
	}

	budgetID := r.PathValue("id")
	var req model.UpdateBudgetRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(model.Error{Error: "invalid request body"})
		return
	}

	budget, err := service.Budgets.UpdateBudget(r.Context(), budgetID, claims.UserID, &req)
	if err != nil {
		switch err.Error() {
		case "budget not found":
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusNotFound)
		case "unauthorized":
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusForbidden)
		default:
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
		}
		json.NewEncoder(w).Encode(model.Error{Error: err.Error()})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(budget)
}

// DeleteBudget deletes a budget.
func DeleteBudget(w http.ResponseWriter, r *http.Request) {
	claims, ok := r.Context().Value(middleware.ClaimsKey).(*model.UserClaims)
	if !ok || claims == nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(model.Error{Error: "unauthorized"})
		return
	}

	budgetID := r.PathValue("id")
	if err := service.Budgets.DeleteBudget(r.Context(), budgetID, claims.UserID); err != nil {
		switch err.Error() {
		case "budget not found":
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusNotFound)
		case "unauthorized":
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusForbidden)
		default:
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusInternalServerError)
		}
		json.NewEncoder(w).Encode(model.Error{Error: err.Error()})
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// NotifyBudgetThreshold creates a notification when a budget threshold is reached.
// Called by the frontend after client-side budget progress computation.
func NotifyBudgetThreshold(w http.ResponseWriter, r *http.Request) {
	claims, ok := r.Context().Value(middleware.ClaimsKey).(*model.UserClaims)
	if !ok || claims == nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(model.Error{Error: "unauthorized"})
		return
	}

	budgetID := r.PathValue("id")
	var req model.NotifyBudgetRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(model.Error{Error: "invalid request body"})
		return
	}

	if err := service.Budgets.NotifyBudgetThreshold(r.Context(), budgetID, claims.UserID, req.Threshold); err != nil {
		switch err.Error() {
		case "budget not found":
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusNotFound)
		case "unauthorized":
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusForbidden)
		default:
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
		}
		json.NewEncoder(w).Encode(model.Error{Error: err.Error()})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "notified"})
}
