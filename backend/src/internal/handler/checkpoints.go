package handler

import (
	"encoding/json"
	"net/http"

	"budgeteer-backend/internal/middleware"
	"budgeteer-backend/internal/model"
	"budgeteer-backend/internal/service"
)

// ListCheckpoints GET /api/v1/accounts/{id}/checkpoints?from=&to=
func ListCheckpoints(w http.ResponseWriter, r *http.Request) {
	claims, ok := r.Context().Value(middleware.ClaimsKey).(*model.UserClaims)
	if !ok || claims == nil {
		writeJSON(w, http.StatusUnauthorized, model.Error{Error: "unauthorized"})
		return
	}
	accountID := r.PathValue("id")
	from := r.URL.Query().Get("from")
	to := r.URL.Query().Get("to")

	checkpoints, err := service.Checkpoints.List(r.Context(), accountID, claims.UserID, from, to)
	if err != nil {
		writeJSON(w, http.StatusForbidden, model.Error{Error: err.Error()})
		return
	}
	if checkpoints == nil {
		checkpoints = []*model.Checkpoint{}
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"checkpoints": checkpoints})
}

// UpsertCheckpoints PUT /api/v1/accounts/{id}/checkpoints
func UpsertCheckpoints(w http.ResponseWriter, r *http.Request) {
	claims, ok := r.Context().Value(middleware.ClaimsKey).(*model.UserClaims)
	if !ok || claims == nil {
		writeJSON(w, http.StatusUnauthorized, model.Error{Error: "unauthorized"})
		return
	}
	accountID := r.PathValue("id")

	var req model.UpsertCheckpointsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, model.Error{Error: "invalid request body"})
		return
	}
	defer r.Body.Close()

	if err := service.Checkpoints.UpsertMany(r.Context(), accountID, claims.UserID, req.Checkpoints); err != nil {
		writeJSON(w, http.StatusBadRequest, model.Error{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// VerifyCheckpoints POST /api/v1/accounts/{id}/checkpoints/verify
func VerifyCheckpoints(w http.ResponseWriter, r *http.Request) {
	claims, ok := r.Context().Value(middleware.ClaimsKey).(*model.UserClaims)
	if !ok || claims == nil {
		writeJSON(w, http.StatusUnauthorized, model.Error{Error: "unauthorized"})
		return
	}
	accountID := r.PathValue("id")

	var req model.VerifyCheckpointsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, model.Error{Error: "invalid request body"})
		return
	}
	defer r.Body.Close()

	resp, err := service.Checkpoints.Verify(r.Context(), accountID, claims.UserID, req.Months)
	if err != nil {
		writeJSON(w, http.StatusForbidden, model.Error{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

// writeJSON is a small helper to write a JSON response with the right headers.
func writeJSON(w http.ResponseWriter, code int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(v)
}