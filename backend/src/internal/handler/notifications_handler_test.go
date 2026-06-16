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

	"github.com/google/uuid"
)

func TestListNotificationsHandler(t *testing.T) {
	cleanup := handlerSetupTest(t)
	defer cleanup()

	user, _, _ := createHandlerTestUser(t, "handler-list-notif@test.com")

	now := time.Now().UTC()
	notifID := uuid.New().String()
	_, err := database.Pool.Exec(context.Background(),
		`INSERT INTO notifications (id, user_id, type, title, body, is_read, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		notifID, user.ID, "test", "Test Notification", "This is a test notification", false, now)
	if err != nil {
		t.Fatalf("Failed to create notification: %v", err)
	}

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/v1/notifications", nil)
	req = req.WithContext(authenticatedContext(t, user.ID, user.Email))
	ListNotifications(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var notifications []*model.Notification
	json.NewDecoder(w.Body).Decode(&notifications)
	if len(notifications) != 1 {
		t.Fatalf("Expected 1 notification, got %d", len(notifications))
	}
	if notifications[0].ID != notifID {
		t.Fatalf("Expected notification ID %s, got %s", notifID, notifications[0].ID)
	}
	if notifications[0].Title != "Test Notification" {
		t.Fatalf("Expected title 'Test Notification', got %q", notifications[0].Title)
	}
}

func TestListNotificationsHandler_Empty(t *testing.T) {
	cleanup := handlerSetupTest(t)
	defer cleanup()

	user, _, _ := createHandlerTestUser(t, "handler-list-notif-empty@test.com")

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/v1/notifications", nil)
	req = req.WithContext(authenticatedContext(t, user.ID, user.Email))
	ListNotifications(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var notifications []*model.Notification
	json.NewDecoder(w.Body).Decode(&notifications)
	if len(notifications) != 0 {
		t.Fatalf("Expected 0 notifications, got %d", len(notifications))
	}
}

func TestListNotificationsHandler_Unauthorized(t *testing.T) {
	cleanup := handlerSetupTest(t)
	defer cleanup()

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/v1/notifications", nil)
	ListNotifications(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("Expected 401, got %d: %s", w.Code, w.Body.String())
	}

	var errResp model.Error
	json.NewDecoder(w.Body).Decode(&errResp)
	if errResp.Error != "unauthorized" {
		t.Fatalf("Expected 'unauthorized', got %q", errResp.Error)
	}
}

func TestCountUnreadNotificationsHandler(t *testing.T) {
	cleanup := handlerSetupTest(t)
	defer cleanup()

	user, _, _ := createHandlerTestUser(t, "handler-count-unread@test.com")

	now := time.Now().UTC()
	// Create one unread notification
	_, err := database.Pool.Exec(context.Background(),
		`INSERT INTO notifications (id, user_id, type, title, body, is_read, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		uuid.New().String(), user.ID, "test", "Unread Notification", "This is unread", false, now)
	if err != nil {
		t.Fatalf("Failed to create unread notification: %v", err)
	}

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/v1/notifications/count", nil)
	req = req.WithContext(authenticatedContext(t, user.ID, user.Email))
	CountUnreadNotifications(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp map[string]int
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["count"] != 1 {
		t.Fatalf("Expected count=1, got %d", resp["count"])
	}
}

func TestCountUnreadNotificationsHandler_Unauthorized(t *testing.T) {
	cleanup := handlerSetupTest(t)
	defer cleanup()

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/v1/notifications/count", nil)
	CountUnreadNotifications(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("Expected 401, got %d: %s", w.Code, w.Body.String())
	}

	var errResp model.Error
	json.NewDecoder(w.Body).Decode(&errResp)
	if errResp.Error != "unauthorized" {
		t.Fatalf("Expected 'unauthorized', got %q", errResp.Error)
	}
}

func TestMarkNotificationReadHandler(t *testing.T) {
	cleanup := handlerSetupTest(t)
	defer cleanup()

	user, _, _ := createHandlerTestUser(t, "handler-mark-read@test.com")

	now := time.Now().UTC()
	notifID := uuid.New().String()
	_, err := database.Pool.Exec(context.Background(),
		`INSERT INTO notifications (id, user_id, type, title, body, is_read, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		notifID, user.ID, "test", "Read Me", "Please mark me read", false, now)
	if err != nil {
		t.Fatalf("Failed to create notification: %v", err)
	}

	w := httptest.NewRecorder()
	req := httptest.NewRequest("PUT", "/v1/notifications/"+notifID+"/read", nil)
	req.SetPathValue("id", notifID)
	req = req.WithContext(authenticatedContext(t, user.ID, user.Email))
	MarkNotificationRead(w, req)

	if w.Code != http.StatusNoContent {
		t.Fatalf("Expected 204, got %d: %s", w.Code, w.Body.String())
	}

	// Verify the notification was actually marked as read
	var isRead bool
	err = database.Pool.QueryRow(context.Background(),
		`SELECT is_read FROM notifications WHERE id = $1`, notifID).Scan(&isRead)
	if err != nil {
		t.Fatalf("Failed to query notification: %v", err)
	}
	if !isRead {
		t.Fatal("Notification was not marked as read")
	}
}

func TestMarkNotificationReadHandler_Unauthorized(t *testing.T) {
	cleanup := handlerSetupTest(t)
	defer cleanup()

	w := httptest.NewRecorder()
	req := httptest.NewRequest("PUT", "/v1/notifications/"+uuid.New().String()+"/read", nil)
	MarkNotificationRead(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("Expected 401, got %d: %s", w.Code, w.Body.String())
	}

	var errResp model.Error
	json.NewDecoder(w.Body).Decode(&errResp)
	if errResp.Error != "unauthorized" {
		t.Fatalf("Expected 'unauthorized', got %q", errResp.Error)
	}
}
