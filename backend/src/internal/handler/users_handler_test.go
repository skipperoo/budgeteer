package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"budgeteer-backend/internal/service"
)

func TestLookupUserHandler(t *testing.T) {
	cleanup := handlerSetupTest(t)
	defer cleanup()

	user, _, _ := createHandlerTestUser(t, "handler-lookup@test.com")
	service.InitUserService()

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/v1/users/lookup?email="+user.Email, nil)
	req = req.WithContext(authenticatedContext(t, user.ID, user.Email))
	LookupUser(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp map[string]string
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["public_key"] != "pk" {
		t.Fatalf("Expected public_key 'pk', got %q", resp["public_key"])
	}
}

func TestLookupUserHandler_MissingEmail(t *testing.T) {
	cleanup := handlerSetupTest(t)
	defer cleanup()

	user, _, _ := createHandlerTestUser(t, "handler-lookup-noemail@test.com")

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/v1/users/lookup", nil)
	req = req.WithContext(authenticatedContext(t, user.ID, user.Email))
	LookupUser(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("Expected 400, got %d", w.Code)
	}
}

func TestLookupUserHandler_NotFound(t *testing.T) {
	cleanup := handlerSetupTest(t)
	defer cleanup()

	user, _, _ := createHandlerTestUser(t, "handler-lookup-notfound@test.com")

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/v1/users/lookup?email=nonexistent@test.com", nil)
	req = req.WithContext(authenticatedContext(t, user.ID, user.Email))
	LookupUser(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("Expected 404, got %d", w.Code)
	}
}

func TestLookupUserHandler_Integration(t *testing.T) {
	cleanup := handlerSetupTest(t)
	defer cleanup()

	user, _, _ := createHandlerTestUser(t, "handler-lookup-int@test.com")
	service.InitUserService()

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/v1/users/lookup?email="+user.Email, nil)
	req = req.WithContext(authenticatedContext(t, user.ID, user.Email))
	LookupUser(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200, got %d", w.Code)
	}
}
