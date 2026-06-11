package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"budgeteer-backend/internal/database"
	"budgeteer-backend/internal/logger"
	"budgeteer-backend/internal/middleware"
	"budgeteer-backend/internal/model"
	"budgeteer-backend/internal/service"

	"github.com/google/uuid"
)

func authenticatedContext(t *testing.T, userID, email string) context.Context {
	t.Helper()
	ctx := context.WithValue(context.Background(), middleware.ClaimsKey, &model.UserClaims{
		UserID: userID,
		Email:  email,
	})
	return ctx
}

func TestCreateAccountHandler(t *testing.T) {
	cleanup := handlerSetupTest(t)
	defer cleanup()

	user, _, _ := createHandlerTestUser(t, "handler-acc-create@test.com")

	body := map[string]string{"currency": "USD", "type": "personal"}
	w := httptest.NewRecorder()
	req := request("POST", "/v1/accounts/", body)
	req = req.WithContext(authenticatedContext(t, user.ID, user.Email))
	CreateAccount(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("Expected 201 Created, got %d: %s", w.Code, w.Body.String())
	}

	var account model.Account
	json.NewDecoder(w.Body).Decode(&account)
	if account.ID == "" {
		t.Fatal("Response should include account ID")
	}
}

func TestCreateAccountHandler_Unauthorized(t *testing.T) {
	cleanup := handlerSetupTest(t)
	defer cleanup()

	w := httptest.NewRecorder()
	req := request("POST", "/v1/accounts/", map[string]string{"currency": "USD", "type": "personal"})
	CreateAccount(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("Expected 401 for unauthorized, got %d", w.Code)
	}
}

func TestDeleteAccountHandler(t *testing.T) {
	cleanup := handlerSetupTest(t)
	defer cleanup()

	user, _, _ := createHandlerTestUser(t, "handler-acc-del@test.com")
	logger.InitLogger()
	service.InitAccountService()
	account, _ := service.Accounts.Create(context.Background(), user.ID, &model.CreateAccountRequest{Currency: "USD", Type: "personal"})

	w := httptest.NewRecorder()
	req := httptest.NewRequest("DELETE", "/v1/accounts/"+account.ID, nil)
	req.SetPathValue("id", account.ID)
	req = req.WithContext(authenticatedContext(t, user.ID, user.Email))
	DeleteAccount(w, req)

	if w.Code != http.StatusNoContent {
		t.Fatalf("Expected 204 No Content, got %d: %s", w.Code, w.Body.String())
	}
}

func TestInviteToAccountHandler(t *testing.T) {
	cleanup := handlerSetupTest(t)
	defer cleanup()

	owner, _, _ := createHandlerTestUser(t, "handler-invite-owner@test.com")
	member, _, _ := createHandlerTestUser(t, "handler-invite-member@test.com")
	logger.InitLogger()
	service.InitAccountService()
	account, _ := service.Accounts.Create(context.Background(), owner.ID, &model.CreateAccountRequest{Currency: "USD", Type: "joint"})

	body := map[string]string{
		"user_email":            member.Email,
		"encrypted_account_key": "enc-key",
	}
	w := httptest.NewRecorder()
	req := request("POST", "/v1/accounts/"+account.ID+"/invite", body)
	req.SetPathValue("id", account.ID)
	req = req.WithContext(authenticatedContext(t, owner.ID, owner.Email))
	InviteToAccount(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200, got %d: %s", w.Code, w.Body.String())
	}
}

func TestListAccountUsersHandler(t *testing.T) {
	cleanup := handlerSetupTest(t)
	defer cleanup()

	user, _, _ := createHandlerTestUser(t, "handler-list-users@test.com")
	logger.InitLogger()
	service.InitAccountService()
	account, _ := service.Accounts.Create(context.Background(), user.ID, &model.CreateAccountRequest{Currency: "USD", Type: "personal"})

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/v1/accounts/"+account.ID+"/users", nil)
	req.SetPathValue("id", account.ID)
	req = req.WithContext(authenticatedContext(t, user.ID, user.Email))
	ListAccountUsers(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var users []*model.AccountUser
	json.NewDecoder(w.Body).Decode(&users)
	if len(users) != 1 {
		t.Fatalf("Expected 1 user, got %d", len(users))
	}
}

func TestRemoveAccountUserHandler(t *testing.T) {
	cleanup := handlerSetupTest(t)
	defer cleanup()

	owner, _, _ := createHandlerTestUser(t, "handler-remove-owner@test.com")
	member, _, _ := createHandlerTestUser(t, "handler-remove-member@test.com")
	logger.InitLogger()
	service.InitAccountService()
	account, _ := service.Accounts.Create(context.Background(), owner.ID, &model.CreateAccountRequest{Currency: "USD", Type: "joint"})
	service.Accounts.InviteUser(context.Background(), account.ID, owner.ID, member.Email, "key")

	w := httptest.NewRecorder()
	req := httptest.NewRequest("DELETE", "/v1/accounts/"+account.ID+"/users/"+member.ID, nil)
	req.SetPathValue("id", account.ID)
	req.SetPathValue("uid", member.ID)
	req = req.WithContext(authenticatedContext(t, owner.ID, owner.Email))
	RemoveAccountUser(w, req)

	if w.Code != http.StatusNoContent {
		t.Fatalf("Expected 204, got %d: %s", w.Code, w.Body.String())
	}
}

func createHandlerTestUser(t *testing.T, email string) (*model.User, string, string) {
	t.Helper()
	ctx := context.Background()
	hash, _ := service.HashPassword("test-password-123!")
	user := &model.User{
		ID:                  uuid.New().String(),
		Email:               email,
		PasswordHash:        hash,
		PublicKey:           "pk",
		EncryptedPrivateKey: "ek",
		IsVerified:          true,
	}
	_, err := database.Pool.Exec(ctx,
		`INSERT INTO users (id, email, password_hash, public_key, encrypted_private_key, is_verified, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
		 ON CONFLICT (email) DO UPDATE SET id = EXCLUDED.id`,
		user.ID, user.Email, user.PasswordHash, user.PublicKey, user.EncryptedPrivateKey, user.IsVerified)
	if err != nil {
		t.Fatalf("Failed to create test user: %v", err)
	}
	return user, hash, ""
}
