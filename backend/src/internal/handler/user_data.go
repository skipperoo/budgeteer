package handler

import (
	"context"
	"encoding/json"
	"net/http"

	"budgeteer-backend/internal/crypto"
	"budgeteer-backend/internal/database"
	"budgeteer-backend/internal/middleware"
	"budgeteer-backend/internal/model"
	"budgeteer-backend/internal/repository"
	"budgeteer-backend/internal/service"
)

var userDataRepo = &repository.UserDataRepository{}

// DumpUserData exports all the authenticated user's data.
// GET /api/v1/user/dump
func DumpUserData(w http.ResponseWriter, r *http.Request) {
	claims, ok := r.Context().Value(middleware.ClaimsKey).(*model.UserClaims)
	if !ok || claims == nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(model.Error{Error: "unauthorized"})
		return
	}

	dump, err := buildDump(r.Context(), claims.UserID, claims.Email)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(model.Error{Error: "failed to export data: " + err.Error()})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(dump)
}

func buildDump(ctx context.Context, userID, email string) (*model.UserDataDump, error) {
	dump := &model.UserDataDump{}

	// User info
	user, err := userDataRepo.GetUserDumpInfo(ctx, userID)
	if err != nil {
		return nil, err
	}
	dump.User = user

	// Accounts
	accounts, accountUsers, err := userDataRepo.GetUserAccounts(ctx, userID)
	if err != nil {
		return nil, err
	}
	for i, a := range accounts {
		ad := &model.AccountDump{
			Account:     a,
			AccountUser: accountUsers[i],
		}

		// Transactions for this account
		txs, err := userDataRepo.GetAccountTransactions(ctx, a.ID)
		if err != nil {
			return nil, err
		}
		ad.Transactions = txs

		// Documents for each transaction
		for _, tx := range txs {
			docs, err := userDataRepo.GetTransactionDocuments(ctx, tx.ID)
			if err != nil {
				return nil, err
			}
			ad.Documents = append(ad.Documents, docs...)
		}

		dump.Accounts = append(dump.Accounts, ad)
	}

	// Categories
	cats, err := userDataRepo.GetUserCategories(ctx, userID)
	if err != nil {
		return nil, err
	}
	dump.Categories = cats

	// Budgets
	budgets, err := userDataRepo.GetUserBudgets(ctx, userID)
	if err != nil {
		return nil, err
	}
	dump.Budgets = budgets

	// Rules (decrypt payloads server-side since the frontend cannot
	// decrypt ECIES payloads encrypted with the server's public key)
	rules, err := userDataRepo.GetUserRules(ctx, userID)
	if err != nil {
		return nil, err
	}
	if service.Rules != nil && len(service.Rules.ServerPrivateKey) > 0 {
		for _, rule := range rules {
			if crypto.IsECIESPayload(rule.EncryptedPayload) {
				decrypted, err := crypto.DecryptWithPrivateKey(rule.EncryptedPayload, service.Rules.ServerPrivateKey)
				if err == nil {
					rule.EncryptedPayload = string(decrypted)
				}
			}
		}
	}
	dump.Rules = rules

	// Notifications
	notifs, err := userDataRepo.GetUserNotifications(ctx, userID)
	if err != nil {
		return nil, err
	}
	dump.Notifications = notifs

	// Invitations
	sent, received, err := userDataRepo.GetUserInvitations(ctx, userID, email)
	if err != nil {
		return nil, err
	}
	dump.InvitationsSent = sent
	dump.InvitationsReceived = received

	// Savings plans
	plans, err := userDataRepo.GetUserSavingsPlans(ctx, userID)
	if err != nil {
		return nil, err
	}
	dump.SavingsPlans = plans

	// Recurring transactions
	rts, err := userDataRepo.GetUserRecurringTransactions(ctx, userID)
	if err != nil {
		return nil, err
	}
	dump.RecurringTxs = rts

	return dump, nil
}

// ClearUserData clears all the authenticated user's data in preparation
// for a restore. Unlike DeleteUserAccount, this preserves the user record
// (password, keys) and only removes data that will be recreated.
// POST /api/v1/user/clear
func ClearUserData(w http.ResponseWriter, r *http.Request) {
	claims, ok := r.Context().Value(middleware.ClaimsKey).(*model.UserClaims)
	if !ok || claims == nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(model.Error{Error: "unauthorized"})
		return
	}

	if err := database.WithTx(r.Context(), func(txCtx context.Context) error {
		return userDataRepo.ClearUserDataForRestore(txCtx, claims.UserID)
	}); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(model.Error{Error: "failed to clear data: " + err.Error()})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

// DeleteUserAccount deletes all the authenticated user's data and
// removes their account.
// DELETE /api/v1/user
func DeleteUserAccount(w http.ResponseWriter, r *http.Request) {
	claims, ok := r.Context().Value(middleware.ClaimsKey).(*model.UserClaims)
	if !ok || claims == nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(model.Error{Error: "unauthorized"})
		return
	}

	var req model.DeleteAccountRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(model.Error{Error: "invalid request body"})
		return
	}
	defer r.Body.Close()

	if req.Confirmation != "DELETE" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(model.Error{Error: "confirmation must be \"DELETE\""})
		return
	}

	// Execute deletion in a transaction
	if err := database.WithTx(r.Context(), func(txCtx context.Context) error {
		_, err := userDataRepo.DeleteUserData(txCtx, claims.UserID)
		return err
	}); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(model.Error{Error: "failed to delete account: " + err.Error()})
		return
	}

	// Revoke the current JWT by adding it to the Redis blocklist
	raw := r.Header.Get("Authorization")
	if raw != "" {
		_, tokenString, expiresAt, err := service.ValidateJWT(raw)
		if err == nil {
			_ = service.Auth.Logout(r.Context(), tokenString, expiresAt)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}
