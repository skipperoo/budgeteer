package handler

import (
	"context"
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

func TestRulePublicKeyHandler_NotConfigured(t *testing.T) {
	cleanup := handlerSetupTest(t)
	defer cleanup()

	// After InitServices() with no config, Rules has no server keys.
	// RulePublicKey should return 503.
	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/v1/rules/public-key", nil)
	RulePublicKey(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("Expected 503, got %d: %s", w.Code, w.Body.String())
	}

	var errResp model.Error
	json.NewDecoder(w.Body).Decode(&errResp)
	if errResp.Error == "" {
		t.Fatal("Expected error message in response")
	}
}

func TestListRulesHandler(t *testing.T) {
	cleanup := handlerSetupTest(t)
	defer cleanup()

	user, _, _ := createHandlerTestUser(t, "handler-list-rules@test.com")

	now := time.Now().UTC()
	ruleID := uuid.New().String()
	_, err := database.Pool.Exec(context.Background(),
		`INSERT INTO rules (id, created_by, name, encrypted_payload, frequency, next_occurrence, status, is_active, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
		ruleID, user.ID, "Test Rule", "encrypted-payload", "monthly", now.Add(24*time.Hour), "active", true, now, now)
	if err != nil {
		t.Fatalf("Failed to create rule: %v", err)
	}

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/v1/rules", nil)
	req = req.WithContext(authenticatedContext(t, user.ID, user.Email))
	ListRules(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var rules []*model.Rule
	json.NewDecoder(w.Body).Decode(&rules)
	if len(rules) != 1 {
		t.Fatalf("Expected 1 rule, got %d", len(rules))
	}
	if rules[0].ID != ruleID {
		t.Fatalf("Expected rule ID %s, got %s", ruleID, rules[0].ID)
	}
	if rules[0].Name != "Test Rule" {
		t.Fatalf("Expected rule name 'Test Rule', got %q", rules[0].Name)
	}
}

func TestListRulesHandler_Empty(t *testing.T) {
	cleanup := handlerSetupTest(t)
	defer cleanup()

	user, _, _ := createHandlerTestUser(t, "handler-list-rules-empty@test.com")

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/v1/rules", nil)
	req = req.WithContext(authenticatedContext(t, user.ID, user.Email))
	ListRules(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var rules []*model.Rule
	json.NewDecoder(w.Body).Decode(&rules)
	if len(rules) != 0 {
		t.Fatalf("Expected 0 rules, got %d", len(rules))
	}
}

func TestListRulesHandler_Unauthorized(t *testing.T) {
	cleanup := handlerSetupTest(t)
	defer cleanup()

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/v1/rules", nil)
	ListRules(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("Expected 401, got %d: %s", w.Code, w.Body.String())
	}

	var errResp model.Error
	json.NewDecoder(w.Body).Decode(&errResp)
	if errResp.Error != "unauthorized" {
		t.Fatalf("Expected 'unauthorized', got %q", errResp.Error)
	}
}

func TestCreateRuleHandler(t *testing.T) {
	cleanup := handlerSetupTest(t)
	defer cleanup()

	user, _, _ := createHandlerTestUser(t, "handler-create-rule@test.com")

	// Set up Rules service with a keypair so encryption works
	privKey, pubKey, err := crypto.GenerateServerKeypair()
	if err != nil {
		t.Fatalf("Failed to generate server keypair: %v", err)
	}
	service.Rules = &service.RuleService{
		RuleRepo:         &repository.RuleRepository{},
		ServerPrivateKey: privKey,
		ServerPublicKey:  pubKey,
	}
	// Re-init invitation service with keys too
	service.InitInvitationServiceWithKeys(privKey, pubKey)

	// Generate an encrypted payload using the server's public key
	payloadMap := map[string]interface{}{
		"type":              "payment",
		"amount":            100.0,
		"source_account_id": uuid.New().String(),
		"category_id":       "some-category",
		"notes":             "Test payment",
	}
	payloadJSON, err := json.Marshal(payloadMap)
	if err != nil {
		t.Fatalf("Failed to marshal payload: %v", err)
	}
	encryptedPayload, err := crypto.EncryptWithPublicKey(payloadJSON, pubKey)
	if err != nil {
		t.Fatalf("Failed to encrypt payload: %v", err)
	}

	body := map[string]interface{}{
		"name":              "Test Created Rule",
		"encrypted_payload": encryptedPayload,
		"frequency":         "monthly",
		"next_occurrence":   time.Now().UTC().Add(24 * time.Hour).Format(time.RFC3339),
	}

	w := httptest.NewRecorder()
	req := request("POST", "/v1/rules", body)
	req = req.WithContext(authenticatedContext(t, user.ID, user.Email))
	CreateRule(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("Expected 201, got %d: %s", w.Code, w.Body.String())
	}

	var rule model.Rule
	json.NewDecoder(w.Body).Decode(&rule)
	if rule.ID == "" {
		t.Fatal("Response should include rule ID")
	}
	if rule.Name != "Test Created Rule" {
		t.Fatalf("Expected name 'Test Created Rule', got %q", rule.Name)
	}
}

func TestCreateRuleHandler_MissingFields(t *testing.T) {
	cleanup := handlerSetupTest(t)
	defer cleanup()

	user, _, _ := createHandlerTestUser(t, "handler-create-rule-missing@test.com")

	// Missing encrypted_payload, frequency, and next_occurrence
	body := map[string]string{"name": "Incomplete Rule"}
	w := httptest.NewRecorder()
	req := request("POST", "/v1/rules", body)
	req = req.WithContext(authenticatedContext(t, user.ID, user.Email))
	CreateRule(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("Expected 400, got %d: %s", w.Code, w.Body.String())
	}

	var errResp model.Error
	json.NewDecoder(w.Body).Decode(&errResp)
	if errResp.Error == "" {
		t.Fatal("Expected error message in response")
	}
}

func TestCreateRuleHandler_InvalidFrequency(t *testing.T) {
	cleanup := handlerSetupTest(t)
	defer cleanup()

	user, _, _ := createHandlerTestUser(t, "handler-create-rule-bad-freq@test.com")

	body := map[string]string{
		"name":              "Bad Freq Rule",
		"encrypted_payload": "some-encrypted-data",
		"frequency":         "never",
		"next_occurrence":   time.Now().UTC().Add(24 * time.Hour).Format(time.RFC3339),
	}
	w := httptest.NewRecorder()
	req := request("POST", "/v1/rules", body)
	req = req.WithContext(authenticatedContext(t, user.ID, user.Email))
	CreateRule(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("Expected 400, got %d: %s", w.Code, w.Body.String())
	}

	var errResp model.Error
	json.NewDecoder(w.Body).Decode(&errResp)
	if errResp.Error == "" {
		t.Fatal("Expected error message in response")
	}
}

func TestCreateRuleHandler_Unauthorized(t *testing.T) {
	cleanup := handlerSetupTest(t)
	defer cleanup()

	w := httptest.NewRecorder()
	req := request("POST", "/v1/rules", map[string]string{"name": "Unauthorized Rule"})
	CreateRule(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("Expected 401, got %d: %s", w.Code, w.Body.String())
	}

	var errResp model.Error
	json.NewDecoder(w.Body).Decode(&errResp)
	if errResp.Error != "unauthorized" {
		t.Fatalf("Expected 'unauthorized', got %q", errResp.Error)
	}
}

func TestDeleteRuleHandler(t *testing.T) {
	cleanup := handlerSetupTest(t)
	defer cleanup()

	user, _, _ := createHandlerTestUser(t, "handler-delete-rule@test.com")

	now := time.Now().UTC()
	ruleID := uuid.New().String()
	_, err := database.Pool.Exec(context.Background(),
		`INSERT INTO rules (id, created_by, name, encrypted_payload, frequency, next_occurrence, status, is_active, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
		ruleID, user.ID, "Delete Me", "encrypted-payload", "monthly", now.Add(24*time.Hour), "active", true, now, now)
	if err != nil {
		t.Fatalf("Failed to create rule: %v", err)
	}

	w := httptest.NewRecorder()
	req := httptest.NewRequest("DELETE", "/v1/rules/"+ruleID, nil)
	req.SetPathValue("id", ruleID)
	req = req.WithContext(authenticatedContext(t, user.ID, user.Email))
	DeleteRule(w, req)

	if w.Code != http.StatusNoContent {
		t.Fatalf("Expected 204, got %d: %s", w.Code, w.Body.String())
	}

	// Verify the rule was actually deleted
	var count int
	err = database.Pool.QueryRow(context.Background(),
		`SELECT COUNT(*) FROM rules WHERE id = $1`, ruleID).Scan(&count)
	if err != nil {
		t.Fatalf("Failed to query rule: %v", err)
	}
	if count != 0 {
		t.Fatal("Rule was not deleted")
	}
}

func TestDeleteRuleHandler_Unauthorized(t *testing.T) {
	cleanup := handlerSetupTest(t)
	defer cleanup()

	w := httptest.NewRecorder()
	req := httptest.NewRequest("DELETE", "/v1/rules/"+uuid.New().String(), nil)
	DeleteRule(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("Expected 401, got %d: %s", w.Code, w.Body.String())
	}

	var errResp model.Error
	json.NewDecoder(w.Body).Decode(&errResp)
	if errResp.Error != "unauthorized" {
		t.Fatalf("Expected 'unauthorized', got %q", errResp.Error)
	}
}
