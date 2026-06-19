package handler

import (
	"encoding/json"
	"net/http"

	"budgeteer-backend/internal/middleware"
	"budgeteer-backend/internal/model"
	"budgeteer-backend/internal/service"
)

// ListPendingInvitations returns all pending invitations for the current user.
func ListPendingInvitations(w http.ResponseWriter, r *http.Request) {
	claims, ok := r.Context().Value(middleware.ClaimsKey).(*model.UserClaims)
	if !ok || claims == nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(model.Error{Error: "unauthorized"})
		return
	}

	invitations, err := service.Invitations.GetPendingInvitations(r.Context(), claims.UserID)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(model.Error{Error: err.Error()})
		return
	}

	if invitations == nil {
		invitations = []*model.Invitation{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(invitations)
}

// AcceptInvitation accepts a pending invitation.
// For rule invitations, the body may contain an encrypted_account field.
func AcceptInvitation(w http.ResponseWriter, r *http.Request) {
	claims, ok := r.Context().Value(middleware.ClaimsKey).(*model.UserClaims)
	if !ok || claims == nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(model.Error{Error: "unauthorized"})
		return
	}

	invitationID := r.PathValue("id")

	var req model.InvitationActionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		// Empty body is OK for account invitations
		req = model.InvitationActionRequest{}
	}

	// Determine the entity type first
	inv, err := service.Invitations.FindInvitation(r.Context(), invitationID)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(model.Error{Error: err.Error()})
		return
	}
	if inv == nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(model.Error{Error: "invitation not found"})
		return
	}

	var acceptErr error
	switch inv.EntityType {
	case "rule":
		if req.EncryptedAccount == "" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(model.Error{Error: "encrypted_account is required for rule invitations"})
			return
		}
		acceptErr = service.Invitations.AcceptRuleInvitation(r.Context(), invitationID, claims.UserID, req.EncryptedAccount)
	case "account":
		acceptErr = service.Invitations.AcceptAccountInvitation(r.Context(), invitationID, claims.UserID)
	case "transaction":
		if req.EncryptedAccount == "" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(model.Error{Error: "encrypted_account is required for transaction invitations"})
			return
		}
		acceptErr = service.Invitations.AcceptTransactionInvitation(r.Context(), invitationID, claims.UserID, req.EncryptedAccount)
	default:
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(model.Error{Error: "unknown invitation type"})
		return
	}

	if acceptErr != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(model.Error{Error: acceptErr.Error()})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "invitation accepted"})
}

// DeclineInvitation declines a pending invitation.
func DeclineInvitation(w http.ResponseWriter, r *http.Request) {
	claims, ok := r.Context().Value(middleware.ClaimsKey).(*model.UserClaims)
	if !ok || claims == nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(model.Error{Error: "unauthorized"})
		return
	}

	invitationID := r.PathValue("id")

	if err := service.Invitations.DeclineInvitation(r.Context(), invitationID, claims.UserID); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(model.Error{Error: err.Error()})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "invitation declined"})
}
