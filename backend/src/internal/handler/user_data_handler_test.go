package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"budgeteer-backend/internal/database"
	"budgeteer-backend/internal/model"
	"budgeteer-backend/internal/repository"
	"budgeteer-backend/internal/service"

	"github.com/google/uuid"
)

func TestDumpUserDataHandler(t *testing.T) {
	cleanup := handlerSetupTest(t)
	defer cleanup()

	user, _, _ := createHandlerTestUser(t, "dump-test@test.com")

	// Create an account and transaction to test dump completeness
	ctx := context.Background()
	service.InitAccountService()
	account, err := service.Accounts.Create(ctx, user.ID, &model.CreateAccountRequest{
		Currency: "USD",
		Type:     "personal",
	})
	if err != nil {
		t.Fatalf("Failed to create account: %v", err)
	}

	// Create a transaction in the account
	tx := &model.Transaction{
		ID:               uuid.New().String(),
		Time:             time.Now().UTC().Truncate(time.Microsecond),
		AccountID:        account.ID,
		CreatedBy:        user.ID,
		EncryptedPayload: "test-encrypted-payload",
		Version:          1,
		CreatedAt:        time.Now().UTC(),
		UpdatedAt:        time.Now().UTC(),
	}
	repo := &repository.TransactionRepository{}
	if err := repo.Create(ctx, tx); err != nil {
		t.Fatalf("Failed to create transaction: %v", err)
	}

	// Create a category
	if _, err := (&repository.CategoryRepository{}).Create(ctx, user.ID, "Test Category", "expense"); err != nil {
		t.Fatalf("Failed to create category: %v", err)
	}

	// Create a budget
	budget := &model.Budget{
		ID:               uuid.New().String(),
		UserID:           user.ID,
		Name:             "Test Budget",
		AccountID:        &account.ID,
		EncryptedPayload: "test-encrypted-budget",
		Period:           "monthly",
		StartDate:        "2024-01-01",
		CreatedAt:        time.Now().UTC(),
		UpdatedAt:        time.Now().UTC(),
	}
	budgetRepo := &repository.BudgetRepository{}
	if err := budgetRepo.Create(ctx, budget); err != nil {
		t.Fatalf("Failed to create budget: %v", err)
	}

	// Test dump
	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/v1/user/dump", nil)
	req = req.WithContext(authenticatedContext(t, user.ID, user.Email))
	DumpUserData(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK, got %d: %s", w.Code, w.Body.String())
	}

	var dump model.UserDataDump
	if err := json.NewDecoder(w.Body).Decode(&dump); err != nil {
		t.Fatalf("Failed to decode dump response: %v", err)
	}

	// Verify dump contents
	if dump.User == nil {
		t.Fatal("Expected user in dump")
	}
	if dump.User.Email != user.Email {
		t.Fatalf("Expected email %s, got %s", user.Email, dump.User.Email)
	}

	if len(dump.Accounts) != 1 {
		t.Fatalf("Expected 1 account, got %d", len(dump.Accounts))
	}
	if dump.Accounts[0].Account.ID != account.ID {
		t.Fatalf("Expected account ID %s, got %s", account.ID, dump.Accounts[0].Account.ID)
	}
	if len(dump.Accounts[0].Transactions) != 1 {
		t.Fatalf("Expected 1 transaction, got %d", len(dump.Accounts[0].Transactions))
	}

	if len(dump.Categories) != 1 {
		t.Fatalf("Expected 1 category, got %d", len(dump.Categories))
	}
	if len(dump.Budgets) != 1 {
		t.Fatalf("Expected 1 budget, got %d", len(dump.Budgets))
	}
}

func TestDumpUserDataHandler_Unauthorized(t *testing.T) {
	cleanup := handlerSetupTest(t)
	defer cleanup()

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/v1/user/dump", nil)
	DumpUserData(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("Expected 401 for unauthorized, got %d", w.Code)
	}
}

func TestDeleteUserAccountHandler(t *testing.T) {
	cleanup := handlerSetupTest(t)
	defer cleanup()

	user, _, _ := createHandlerTestUser(t, "delete-test@test.com")
	ctx := context.Background()
	service.InitAccountService()

	// Create an account for the user
	account, err := service.Accounts.Create(ctx, user.ID, &model.CreateAccountRequest{
		Currency: "USD",
		Type:     "personal",
	})
	if err != nil {
		t.Fatalf("Failed to create account: %v", err)
	}

	// Verify the account exists
	existingAccounts, err := (&repository.AccountRepository{}).ListByUserID(ctx, user.ID)
	if err != nil {
		t.Fatalf("Failed to list accounts: %v", err)
	}
	if len(existingAccounts) != 1 {
		t.Fatalf("Expected 1 account before delete, got %d", len(existingAccounts))
	}

	// Delete the account
	deleteBody := map[string]string{"confirmation": "DELETE"}
	bodyBytes, _ := json.Marshal(deleteBody)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("DELETE", "/v1/user", bytes.NewReader(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(authenticatedContext(t, user.ID, user.Email))
	DeleteUserAccount(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK, got %d: %s", w.Code, w.Body.String())
	}

	// Verify personal accounts are hard-deleted
	var accountExists int
	err = database.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM accounts WHERE id = $1`, account.ID).Scan(&accountExists)
	if err != nil {
		t.Fatalf("Failed to check account after delete: %v", err)
	}
	if accountExists != 0 {
		t.Fatalf("Expected account to be hard-deleted, count=%d", accountExists)
	}

	// Verify the user record is deleted
	var userExists int
	err = database.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM users WHERE id = $1`, user.ID).Scan(&userExists)
	if err != nil {
		t.Fatalf("Failed to query user after delete: %v", err)
	}
	if userExists != 0 {
		t.Fatalf("Expected user to be deleted, count=%d", userExists)
	}

	// Verify the email is free for re-registration
	if _, err := database.Pool.Exec(ctx,
		`INSERT INTO users (id, email, password_hash, public_key, encrypted_private_key)
		 VALUES ($1, $2, $3, $4, $5)`,
		uuid.New().String(), "delete-test@test.com",
		"hash", "pk", "epk"); err != nil {
		t.Fatalf("Failed to re-register with same email after delete: %v", err)
	}
}

func TestDeleteUserAccount_WrongConfirmation(t *testing.T) {
	cleanup := handlerSetupTest(t)
	defer cleanup()

	user, _, _ := createHandlerTestUser(t, "delete-wrong@test.com")

	wrongBody := map[string]string{"confirmation": "wrong"}
	bodyBytes, _ := json.Marshal(wrongBody)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("DELETE", "/v1/user", bytes.NewReader(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(authenticatedContext(t, user.ID, user.Email))
	DeleteUserAccount(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("Expected 400 for wrong confirmation, got %d: %s", w.Code, w.Body.String())
	}
}

func TestDeleteUserAccount_PreservesJointAccountsForOtherUsers(t *testing.T) {
	cleanup := handlerSetupTest(t)
	defer cleanup()

	// Create two users
	owner, _, _ := createHandlerTestUser(t, "joint-owner@test.com")
	member, _, _ := createHandlerTestUser(t, "joint-member@test.com")

	ctx := context.Background()
	service.InitAccountService()

	// Owner creates a joint account and invites the member
	account, err := service.Accounts.Create(ctx, owner.ID, &model.CreateAccountRequest{
		Currency: "USD",
		Type:     "joint",
	})
	if err != nil {
		t.Fatalf("Failed to create joint account: %v", err)
	}

	// Add member to the joint account directly
	au := &model.AccountUser{
		AccountID:           account.ID,
		UserID:              member.ID,
		EncryptedAccountKey: "member-key",
		Role:                "member",
		Status:              "active",
		JoinedAt:            time.Now().UTC(),
	}
	if err := (&repository.AccountUserRepository{}).Create(ctx, au); err != nil {
		t.Fatalf("Failed to add member: %v", err)
	}

	// Member deletes their account
	deleteBody := map[string]string{"confirmation": "DELETE"}
	bodyBytes, _ := json.Marshal(deleteBody)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("DELETE", "/v1/user", bytes.NewReader(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(authenticatedContext(t, member.ID, member.Email))
	DeleteUserAccount(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK, got %d: %s", w.Code, w.Body.String())
	}

	// The joint account should still exist for the owner
	ownerAccounts, err := (&repository.AccountRepository{}).ListByUserID(ctx, owner.ID)
	if err != nil {
		t.Fatalf("Failed to list owner's accounts: %v", err)
	}
	if len(ownerAccounts) != 1 {
		t.Fatalf("Expected 1 account for owner, got %d", len(ownerAccounts))
	}
	if ownerAccounts[0].ID != account.ID {
		t.Fatalf("Expected joint account to remain for owner, got %s", ownerAccounts[0].ID)
	}

	// The member should no longer be in account_users
	var memberCount int
	err = database.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM account_users WHERE account_id = $1 AND user_id = $2`,
		account.ID, member.ID).Scan(&memberCount)
	if err != nil {
		t.Fatalf("Failed to check account_users: %v", err)
	}
	if memberCount != 0 {
		t.Fatalf("Expected member to be removed from account_users, count=%d", memberCount)
	}
}

func TestDumpUserData_PreservesOriginalTimestamps(t *testing.T) {
	cleanup := handlerSetupTest(t)
	defer cleanup()

	user, _, _ := createHandlerTestUser(t, "dump-timestamps@test.com")
	ctx := context.Background()
	service.InitAccountService()

	// Create account with a specific timestamp
	pastTime := time.Date(2023, 6, 15, 10, 30, 0, 0, time.UTC)
	account := &model.Account{
		ID:        uuid.New().String(),
		Name:      "Old Account",
		Currency:  "USD",
		Type:      "personal",
		CreatedBy: user.ID,
		CreatedAt: pastTime,
		UpdatedAt: pastTime,
	}
	au := &model.AccountUser{
		AccountID:           account.ID,
		UserID:              user.ID,
		EncryptedAccountKey: "key",
		Role:                "owner",
		Status:              "active",
		JoinedAt:            pastTime,
	}
	if err := (&repository.AccountRepository{}).Create(ctx, account); err != nil {
		t.Fatalf("Failed to create account: %v", err)
	}
	if err := (&repository.AccountUserRepository{}).Create(ctx, au); err != nil {
		t.Fatalf("Failed to create account_user: %v", err)
	}

	// Dump
	dump, err := buildDump(ctx, user.ID, user.Email)
	if err != nil {
		t.Fatalf("Failed to build dump: %v", err)
	}

	if len(dump.Accounts) != 1 {
		t.Fatalf("Expected 1 account, got %d", len(dump.Accounts))
	}
	if !dump.Accounts[0].Account.CreatedAt.Equal(pastTime) {
		t.Fatalf("Expected CreatedAt %v, got %v", pastTime, dump.Accounts[0].Account.CreatedAt)
	}
	if !dump.Accounts[0].AccountUser.JoinedAt.Equal(pastTime) {
		t.Fatalf("Expected JoinedAt %v, got %v", pastTime, dump.Accounts[0].AccountUser.JoinedAt)
	}
}
