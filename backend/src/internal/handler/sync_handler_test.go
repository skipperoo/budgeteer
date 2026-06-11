package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"budgeteer-backend/internal/model"
	"budgeteer-backend/internal/service"

	"github.com/google/uuid"
)

func TestSyncPullHandler_Empty(t *testing.T) {
	cleanup := handlerSetupTest(t)
	defer cleanup()

	user, _, _ := createHandlerTestUser(t, "handler-sync-pull@test.com")

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/v1/sync/pull", nil)
	req = req.WithContext(authenticatedContext(t, user.ID, user.Email))
	SyncPull(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp model.SyncPullResponse
	json.NewDecoder(w.Body).Decode(&resp)
	if len(resp.Items) != 0 {
		t.Fatalf("Expected 0 items, got %d", len(resp.Items))
	}
	if resp.HasMore {
		t.Fatal("Expected HasMore=false")
	}
}

func TestSyncPushHandler(t *testing.T) {
	cleanup := handlerSetupTest(t)
	defer cleanup()

	service.InitAccountService()
	service.InitSyncService()

	user, _, _ := createHandlerTestUser(t, "handler-sync-push@test.com")
	account, _ := service.Accounts.Create(context.Background(), user.ID, &model.CreateAccountRequest{Currency: "USD", Type: "personal"})

	ops := model.SyncPushRequest{
		Operations: []model.SyncOperation{
			{
				Action:           "INSERT",
				EntityType:       account.ID,
				EntityID:         uuid.New().String(),
				EncryptedPayload: "enc-data",
				Timestamp:        time.Now().UTC().Format(time.RFC3339),
			},
		},
	}

	w := httptest.NewRecorder()
	req := request("POST", "/v1/sync/push", ops)
	req = req.WithContext(authenticatedContext(t, user.ID, user.Email))
	SyncPush(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp map[string]string
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["message"] != "sync successful" {
		t.Fatalf("Expected 'sync successful', got %q", resp["message"])
	}
}

func TestSyncPushHandler_Unauthorized(t *testing.T) {
	w := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/v1/sync/push", nil)
	SyncPush(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("Expected 401, got %d", w.Code)
	}
}

func TestSyncPullHandler_Cursor(t *testing.T) {
	cleanup := handlerSetupTest(t)
	defer cleanup()

	user, _, _ := createHandlerTestUser(t, "handler-sync-cursor@test.com")

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/v1/sync/pull?since=abc", nil)
	req = req.WithContext(authenticatedContext(t, user.ID, user.Email))
	SyncPull(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200, got %d", w.Code)
	}
}
