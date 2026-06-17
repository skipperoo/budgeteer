package handler

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"budgeteer-backend/internal/crypto"
	"budgeteer-backend/internal/database"
	"budgeteer-backend/internal/model"
	"budgeteer-backend/internal/repository"
	"budgeteer-backend/internal/service"

	"github.com/google/uuid"
)

func TestListPendingInvitationsHandler(t *testing.T) {
	cleanup := handlerSetupTest(t)
	defer cleanup()
	defer database.Pool.Exec(context.Background(), "DELETE FROM invitations")

	user, _, _ := createHandlerTestUser(t, "handler-pending-inv@test.com")

	now := time.Now().UTC()
	invID := uuid.New().String()
	expiresAt := now.Add(30 * 24 * time.Hour)
	_, err := database.Pool.Exec(context.Background(),
		`INSERT INTO invitations (id, entity_type, entity_id, invited_by, invited_email, invited_user_id, status, created_at, expires_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
		invID, "rule", uuid.New().String(), user.ID, "inviter@test.com", user.ID, "pending", now, expiresAt)
	if err != nil {
		t.Fatalf("Failed to create invitation: %v", err)
	}

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/v1/invitations", nil)
	req = req.WithContext(authenticatedContext(t, user.ID, user.Email))
	ListPendingInvitations(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var invitations []*model.Invitation
	json.NewDecoder(w.Body).Decode(&invitations)
	if len(invitations) != 1 {
		t.Fatalf("Expected 1 invitation, got %d", len(invitations))
	}
	if invitations[0].ID != invID {
		t.Fatalf("Expected invitation ID %s, got %s", invID, invitations[0].ID)
	}
}

func TestListPendingInvitationsHandler_Empty(t *testing.T) {
	cleanup := handlerSetupTest(t)
	defer cleanup()

	user, _, _ := createHandlerTestUser(t, "handler-pending-empty@test.com")

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/v1/invitations", nil)
	req = req.WithContext(authenticatedContext(t, user.ID, user.Email))
	ListPendingInvitations(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var invitations []*model.Invitation
	json.NewDecoder(w.Body).Decode(&invitations)
	if len(invitations) != 0 {
		t.Fatalf("Expected 0 invitations, got %d", len(invitations))
	}
}

func TestListPendingInvitationsHandler_Unauthorized(t *testing.T) {
	cleanup := handlerSetupTest(t)
	defer cleanup()

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/v1/invitations", nil)
	ListPendingInvitations(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("Expected 401, got %d: %s", w.Code, w.Body.String())
	}

	var errResp model.Error
	json.NewDecoder(w.Body).Decode(&errResp)
	if errResp.Error != "unauthorized" {
		t.Fatalf("Expected 'unauthorized', got %q", errResp.Error)
	}
}

func TestAcceptRuleInvitationHandler(t *testing.T) {
	cleanup := handlerSetupTest(t)
	defer cleanup()
	defer database.Pool.Exec(context.Background(), "DELETE FROM invitations")

	owner, _, _ := createHandlerTestUser(t, "handler-rule-accept-owner@test.com")
	invitee, _, _ := createHandlerTestUser(t, "handler-rule-accept-invitee@test.com")

	now := time.Now().UTC()

	// Create a rule owned by owner
	ruleID := uuid.New().String()
	_, err := database.Pool.Exec(context.Background(),
		`INSERT INTO rules (id, created_by, name, encrypted_payload, frequency, next_occurrence, status, is_active, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
		ruleID, owner.ID, "Test Rule", "encrypted-payload", "monthly", now.Add(24*time.Hour), "pending_accepted", true, now, now)
	if err != nil {
		t.Fatalf("Failed to create rule: %v", err)
	}

	// Create a pending invitation for the invitee
	invID := uuid.New().String()
	expiresAt := now.Add(30 * 24 * time.Hour)
	_, err = database.Pool.Exec(context.Background(),
		`INSERT INTO invitations (id, entity_type, entity_id, invited_by, invited_email, invited_user_id, status, created_at, expires_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
		invID, "rule", ruleID, owner.ID, invitee.Email, invitee.ID, "pending", now, expiresAt)
	if err != nil {
		t.Fatalf("Failed to create invitation: %v", err)
	}

	body := map[string]string{"encrypted_account": "encrypted-account-value"}
	w := httptest.NewRecorder()
	req := request("POST", "/v1/invitations/"+invID+"/accept", body)
	req.SetPathValue("id", invID)
	req = req.WithContext(authenticatedContext(t, invitee.ID, invitee.Email))
	AcceptInvitation(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp map[string]string
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["message"] != "invitation accepted" {
		t.Fatalf("Expected 'invitation accepted', got %q", resp["message"])
	}
}

func TestAcceptAccountInvitationHandler(t *testing.T) {
	cleanup := handlerSetupTest(t)
	defer cleanup()
	defer database.Pool.Exec(context.Background(), "DELETE FROM invitations")
	defer database.Pool.Exec(context.Background(), "DELETE FROM account_users")

	// Set up server keys on Rules and Invitations services
	privKey, pubKey, err := crypto.GenerateServerKeypair()
	if err != nil {
		t.Fatalf("Failed to generate server keypair: %v", err)
	}
	service.Rules = &service.RuleService{
		RuleRepo:         &repository.RuleRepository{},
		ServerPrivateKey: privKey,
		ServerPublicKey:  pubKey,
	}
	service.InitInvitationServiceWithKeys(privKey, pubKey)

	// Create owner user
	owner, _, _ := createHandlerTestUser(t, "handler-acc-accept-owner@test.com")

	// Create invitee user with a valid X25519 public key (base64-encoded)
	_, inviteePubKey, err := crypto.GenerateServerKeypair()
	if err != nil {
		t.Fatalf("Failed to generate invitee keypair: %v", err)
	}
	inviteePubKeyB64 := base64.StdEncoding.EncodeToString(inviteePubKey)
	inviteeID := uuid.New().String()
	inviteeEmail := "handler-acc-accept-invitee@test.com"
	hash, _ := service.HashPassword("test-password-123!")
	_, err = database.Pool.Exec(context.Background(),
		`INSERT INTO users (id, email, password_hash, public_key, encrypted_private_key, is_verified, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
		 ON CONFLICT (email) DO UPDATE SET id = EXCLUDED.id`,
		inviteeID, inviteeEmail, hash, inviteePubKeyB64, "ek", true)
	if err != nil {
		t.Fatalf("Failed to create invitee user: %v", err)
	}

	// Create an account
	service.InitAccountService()
	account, err := service.Accounts.Create(context.Background(), owner.ID, &model.CreateAccountRequest{Currency: "USD", Type: "joint"})
	if err != nil {
		t.Fatalf("Failed to create account: %v", err)
	}

	// Encrypt account key with server's public key
	accountKeyPayload := `{"account_key": "test-account-key-value"}`
	encryptedData, err := crypto.EncryptWithPublicKey([]byte(accountKeyPayload), pubKey)
	if err != nil {
		t.Fatalf("Failed to encrypt account key: %v", err)
	}

	// Create a pending account invitation
	now := time.Now().UTC()
	invID := uuid.New().String()
	expiresAt := now.Add(30 * 24 * time.Hour)
	_, err = database.Pool.Exec(context.Background(),
		`INSERT INTO invitations (id, entity_type, entity_id, invited_by, invited_email, invited_user_id, encrypted_data, status, created_at, expires_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
		invID, "account", account.ID, owner.ID, inviteeEmail, inviteeID, encryptedData, "pending", now, expiresAt)
	if err != nil {
		t.Fatalf("Failed to create invitation: %v", err)
	}

	// Accept the account invitation
	w := httptest.NewRecorder()
	req := request("POST", "/v1/invitations/"+invID+"/accept", nil)
	req.SetPathValue("id", invID)
	req = req.WithContext(authenticatedContext(t, inviteeID, inviteeEmail))
	AcceptInvitation(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp map[string]string
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["message"] != "invitation accepted" {
		t.Fatalf("Expected 'invitation accepted', got %q", resp["message"])
	}
}

func TestAcceptInvitationHandler_NotFound(t *testing.T) {
	cleanup := handlerSetupTest(t)
	defer cleanup()

	user, _, _ := createHandlerTestUser(t, "handler-accept-notfound@test.com")

	w := httptest.NewRecorder()
	req := request("POST", "/v1/invitations/"+uuid.New().String()+"/accept", nil)
	req.SetPathValue("id", uuid.New().String())
	req = req.WithContext(authenticatedContext(t, user.ID, user.Email))
	AcceptInvitation(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("Expected 404, got %d: %s", w.Code, w.Body.String())
	}

	var errResp model.Error
	json.NewDecoder(w.Body).Decode(&errResp)
	if errResp.Error != "invitation not found" {
		t.Fatalf("Expected 'invitation not found', got %q", errResp.Error)
	}
}

func TestAcceptInvitationHandler_Unauthorized(t *testing.T) {
	cleanup := handlerSetupTest(t)
	defer cleanup()

	w := httptest.NewRecorder()
	req := request("POST", "/v1/invitations/"+uuid.New().String()+"/accept", nil)
	AcceptInvitation(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("Expected 401, got %d: %s", w.Code, w.Body.String())
	}

	var errResp model.Error
	json.NewDecoder(w.Body).Decode(&errResp)
	if errResp.Error != "unauthorized" {
		t.Fatalf("Expected 'unauthorized', got %q", errResp.Error)
	}
}

func TestDeclineInvitationHandler(t *testing.T) {
	cleanup := handlerSetupTest(t)
	defer cleanup()
	defer database.Pool.Exec(context.Background(), "DELETE FROM invitations")

	owner, _, _ := createHandlerTestUser(t, "handler-decline-owner@test.com")
	invitee, _, _ := createHandlerTestUser(t, "handler-decline-invitee@test.com")

	now := time.Now().UTC()
	invID := uuid.New().String()
	expiresAt := now.Add(30 * 24 * time.Hour)
	_, err := database.Pool.Exec(context.Background(),
		`INSERT INTO invitations (id, entity_type, entity_id, invited_by, invited_email, invited_user_id, status, created_at, expires_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
		invID, "rule", uuid.New().String(), owner.ID, invitee.Email, invitee.ID, "pending", now, expiresAt)
	if err != nil {
		t.Fatalf("Failed to create invitation: %v", err)
	}

	w := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/v1/invitations/"+invID+"/decline", nil)
	req.SetPathValue("id", invID)
	req = req.WithContext(authenticatedContext(t, invitee.ID, invitee.Email))
	DeclineInvitation(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp map[string]string
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["message"] != "invitation declined" {
		t.Fatalf("Expected 'invitation declined', got %q", resp["message"])
	}
}

func TestDeclineInvitationHandler_Unauthorized(t *testing.T) {
	cleanup := handlerSetupTest(t)
	defer cleanup()

	w := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/v1/invitations/"+uuid.New().String()+"/decline", nil)
	DeclineInvitation(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("Expected 401, got %d: %s", w.Code, w.Body.String())
	}

	var errResp model.Error
	json.NewDecoder(w.Body).Decode(&errResp)
	if errResp.Error != "unauthorized" {
		t.Fatalf("Expected 'unauthorized', got %q", errResp.Error)
	}
}
