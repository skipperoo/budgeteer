package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"budgeteer-backend/internal/database"
	"budgeteer-backend/internal/model"
	"budgeteer-backend/internal/service"

	"github.com/google/uuid"
)

func TestListBudgetsHandler(t *testing.T) {
	cleanup := handlerSetupTest(t)
	defer cleanup()

	user, _, _ := createHandlerTestUser(t, "handler-list-budgets@test.com")

	now := time.Now().UTC()
	budgetID := uuid.New().String()
	_, err := database.Pool.Exec(context.Background(),
		`INSERT INTO budgets (id, user_id, encrypted_payload, period, start_date, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		budgetID, user.ID, "encrypted-payload", "monthly", now.Format("2006-01-02"), now, now)
	if err != nil {
		t.Fatalf("Failed to create budget: %v", err)
	}

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/v1/budgets", nil)
	req = req.WithContext(authenticatedContext(t, user.ID, user.Email))
	ListBudgets(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var budgets []*model.Budget
	json.NewDecoder(w.Body).Decode(&budgets)
	if len(budgets) != 1 {
		t.Fatalf("Expected 1 budget, got %d", len(budgets))
	}
	if budgets[0].ID != budgetID {
		t.Fatalf("Expected budget ID %s, got %s", budgetID, budgets[0].ID)
	}
}

func TestListBudgetsHandler_Empty(t *testing.T) {
	cleanup := handlerSetupTest(t)
	defer cleanup()

	user, _, _ := createHandlerTestUser(t, "handler-list-budgets-empty@test.com")

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/v1/budgets", nil)
	req = req.WithContext(authenticatedContext(t, user.ID, user.Email))
	ListBudgets(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var budgets []*model.Budget
	json.NewDecoder(w.Body).Decode(&budgets)
	if len(budgets) != 0 {
		t.Fatalf("Expected 0 budgets, got %d", len(budgets))
	}
}

func TestListBudgetsHandler_Unauthorized(t *testing.T) {
	cleanup := handlerSetupTest(t)
	defer cleanup()

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/v1/budgets", nil)
	ListBudgets(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("Expected 401, got %d: %s", w.Code, w.Body.String())
	}

	var errResp model.Error
	json.NewDecoder(w.Body).Decode(&errResp)
	if errResp.Error != "unauthorized" {
		t.Fatalf("Expected 'unauthorized', got %q", errResp.Error)
	}
}

func TestCreateBudgetHandler(t *testing.T) {
	cleanup := handlerSetupTest(t)
	defer cleanup()

	user, _, _ := createHandlerTestUser(t, "handler-create-budget@test.com")

	body := map[string]interface{}{
		"encrypted_payload": "1|encrypted-data-here",
		"period":            "monthly",
		"start_date":        time.Now().UTC().Format("2006-01-02"),
	}

	w := httptest.NewRecorder()
	req := request("POST", "/v1/budgets", body)
	req = req.WithContext(authenticatedContext(t, user.ID, user.Email))
	CreateBudget(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("Expected 201, got %d: %s", w.Code, w.Body.String())
	}

	var budget model.Budget
	json.NewDecoder(w.Body).Decode(&budget)
	if budget.ID == "" {
		t.Fatal("Response should include budget ID")
	}
	if budget.Period != "monthly" {
		t.Fatalf("Expected period 'monthly', got %q", budget.Period)
	}
	if budget.EncryptedPayload != "1|encrypted-data-here" {
		t.Fatalf("Expected encrypted_payload '1|encrypted-data-here', got %q", budget.EncryptedPayload)
	}
}

func TestCreateBudgetHandler_MissingFields(t *testing.T) {
	cleanup := handlerSetupTest(t)
	defer cleanup()

	user, _, _ := createHandlerTestUser(t, "handler-create-budget-missing@test.com")

	// Missing encrypted_payload
	body := map[string]string{"period": "monthly"}
	w := httptest.NewRecorder()
	req := request("POST", "/v1/budgets", body)
	req = req.WithContext(authenticatedContext(t, user.ID, user.Email))
	CreateBudget(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("Expected 400, got %d: %s", w.Code, w.Body.String())
	}

	var errResp model.Error
	json.NewDecoder(w.Body).Decode(&errResp)
	if errResp.Error == "" {
		t.Fatal("Expected error message in response")
	}
}

func TestCreateBudgetHandler_InvalidPeriod(t *testing.T) {
	cleanup := handlerSetupTest(t)
	defer cleanup()

	user, _, _ := createHandlerTestUser(t, "handler-create-budget-bad-period@test.com")

	body := map[string]string{
		"encrypted_payload": "encrypted",
		"period":            "weekly",
		"start_date":        time.Now().UTC().Format("2006-01-02"),
	}
	w := httptest.NewRecorder()
	req := request("POST", "/v1/budgets", body)
	req = req.WithContext(authenticatedContext(t, user.ID, user.Email))
	CreateBudget(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("Expected 400, got %d: %s", w.Code, w.Body.String())
	}

	var errResp model.Error
	json.NewDecoder(w.Body).Decode(&errResp)
	if errResp.Error == "" {
		t.Fatal("Expected error message in response")
	}
}

func TestCreateBudgetHandler_Unauthorized(t *testing.T) {
	cleanup := handlerSetupTest(t)
	defer cleanup()

	w := httptest.NewRecorder()
	req := request("POST", "/v1/budgets", map[string]string{"encrypted_payload": "test"})
	CreateBudget(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("Expected 401, got %d: %s", w.Code, w.Body.String())
	}

	var errResp model.Error
	json.NewDecoder(w.Body).Decode(&errResp)
	if errResp.Error != "unauthorized" {
		t.Fatalf("Expected 'unauthorized', got %q", errResp.Error)
	}
}

func TestDeleteBudgetHandler(t *testing.T) {
	cleanup := handlerSetupTest(t)
	defer cleanup()

	user, _, _ := createHandlerTestUser(t, "handler-delete-budget@test.com")

	now := time.Now().UTC()
	budgetID := uuid.New().String()
	_, err := database.Pool.Exec(context.Background(),
		`INSERT INTO budgets (id, user_id, encrypted_payload, period, start_date, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		budgetID, user.ID, "encrypted-payload", "monthly", now.Format("2006-01-02"), now, now)
	if err != nil {
		t.Fatalf("Failed to create budget: %v", err)
	}

	w := httptest.NewRecorder()
	req := httptest.NewRequest("DELETE", "/v1/budgets/"+budgetID, nil)
	req.SetPathValue("id", budgetID)
	req = req.WithContext(authenticatedContext(t, user.ID, user.Email))
	DeleteBudget(w, req)

	if w.Code != http.StatusNoContent {
		t.Fatalf("Expected 204, got %d: %s", w.Code, w.Body.String())
	}

	// Verify budget was actually deleted
	var count int
	err = database.Pool.QueryRow(context.Background(),
		`SELECT COUNT(*) FROM budgets WHERE id = $1`, budgetID).Scan(&count)
	if err != nil {
		t.Fatalf("Failed to query budget: %v", err)
	}
	if count != 0 {
		t.Fatal("Budget was not deleted")
	}
}

func TestDeleteBudgetHandler_Unauthorized(t *testing.T) {
	cleanup := handlerSetupTest(t)
	defer cleanup()

	w := httptest.NewRecorder()
	req := httptest.NewRequest("DELETE", "/v1/budgets/"+uuid.New().String(), nil)
	DeleteBudget(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("Expected 401, got %d: %s", w.Code, w.Body.String())
	}

	var errResp model.Error
	json.NewDecoder(w.Body).Decode(&errResp)
	if errResp.Error != "unauthorized" {
		t.Fatalf("Expected 'unauthorized', got %q", errResp.Error)
	}
}

func TestNotifyBudgetThresholdHandler(t *testing.T) {
	cleanup := handlerSetupTest(t)
	defer cleanup()

	user, _, _ := createHandlerTestUser(t, "handler-notify-budget@test.com")

	now := time.Now().UTC()
	budgetID := uuid.New().String()
	_, err := database.Pool.Exec(context.Background(),
		`INSERT INTO budgets (id, user_id, encrypted_payload, period, start_date, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		budgetID, user.ID, "encrypted-payload", "monthly", now.Format("2006-01-02"), now, now)
	if err != nil {
		t.Fatalf("Failed to create budget: %v", err)
	}

	// Init notification service (needed for CreateNotification)
	service.InitNotificationService()

	body := map[string]int{"threshold": 80}
	w := httptest.NewRecorder()
	req := request("POST", "/v1/budgets/"+budgetID+"/notify", body)
	req.SetPathValue("id", budgetID)
	req = req.WithContext(authenticatedContext(t, user.ID, user.Email))
	NotifyBudgetThreshold(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp map[string]string
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["status"] != "notified" {
		t.Fatalf("Expected 'notified', got %q", resp["status"])
	}

	// Verify a notification was created
	var notifCount int
	err = database.Pool.QueryRow(context.Background(),
		`SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND type = 'budget_threshold'`, user.ID).Scan(&notifCount)
	if err != nil {
		t.Fatalf("Failed to query notifications: %v", err)
	}
	if notifCount != 1 {
		t.Fatalf("Expected 1 notification, got %d", notifCount)
	}
}

func TestNotifyBudgetThresholdHandler_Duplicate(t *testing.T) {
	cleanup := handlerSetupTest(t)
	defer cleanup()

	user, _, _ := createHandlerTestUser(t, "handler-notify-budget-dup@test.com")

	now := time.Now().UTC()
	budgetID := uuid.New().String()
	_, err := database.Pool.Exec(context.Background(),
		`INSERT INTO budgets (id, user_id, encrypted_payload, period, start_date, last_notified_80, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, TRUE, $6, $7)`,
		budgetID, user.ID, "encrypted-payload", "monthly", now.Format("2006-01-02"), now, now)
	if err != nil {
		t.Fatalf("Failed to create budget: %v", err)
	}

	service.InitNotificationService()

	body := map[string]int{"threshold": 80}
	w := httptest.NewRecorder()
	req := request("POST", "/v1/budgets/"+budgetID+"/notify", body)
	req.SetPathValue("id", budgetID)
	req = req.WithContext(authenticatedContext(t, user.ID, user.Email))
	NotifyBudgetThreshold(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200, got %d: %s", w.Code, w.Body.String())
	}

	// Should NOT create a duplicate notification
	var notifCount int
	err = database.Pool.QueryRow(context.Background(),
		`SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND type = 'budget_threshold'`, user.ID).Scan(&notifCount)
	if err != nil {
		t.Fatalf("Failed to query notifications: %v", err)
	}
	if notifCount != 0 {
		t.Fatalf("Expected 0 notifications (already notified), got %d", notifCount)
	}
}

func TestNotifyBudgetThresholdHandler_Unauthorized(t *testing.T) {
	cleanup := handlerSetupTest(t)
	defer cleanup()

	w := httptest.NewRecorder()
	req := request("POST", "/v1/budgets/"+uuid.New().String()+"/notify", map[string]int{"threshold": 80})
	NotifyBudgetThreshold(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("Expected 401, got %d: %s", w.Code, w.Body.String())
	}

	var errResp model.Error
	json.NewDecoder(w.Body).Decode(&errResp)
	if errResp.Error != "unauthorized" {
		t.Fatalf("Expected 'unauthorized', got %q", errResp.Error)
	}
}
