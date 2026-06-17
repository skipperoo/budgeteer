package service

import (
	"context"
	"testing"
	"time"

	"budgeteer-backend/internal/database"
	"budgeteer-backend/internal/model"
	"budgeteer-backend/internal/repository"

	"github.com/google/uuid"
)

func setupNotificationDB(t *testing.T) context.CancelFunc {
	t.Helper()
	cleanup := setupTestDB(t)

	ctx := context.Background()
	// Notifications table is created in migration 0008
	_, err := database.Pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS notifications (
			id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
			user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			type       VARCHAR(50) NOT NULL,
			title      TEXT NOT NULL,
			body       TEXT NOT NULL,
			data       JSONB,
			is_read    BOOLEAN DEFAULT FALSE,
			created_at TIMESTAMPTZ DEFAULT NOW()
		)
	`)
	if err != nil {
		t.Fatalf("Failed to create notifications table: %v", err)
	}

	// Create indexes needed by the service
	database.Pool.Exec(ctx, `CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications (user_id, created_at DESC)`)
	database.Pool.Exec(ctx, `CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications (user_id, is_read) WHERE is_read = FALSE`)

	return cleanup
}

func createNotificationDirect(t *testing.T, userID, notifType, title, body string, isRead bool) *model.Notification {
	t.Helper()
	now := time.Now().UTC()
	n := &model.Notification{
		ID:        uuid.New().String(),
		UserID:    userID,
		Type:      notifType,
		Title:     title,
		Body:      body,
		IsRead:    isRead,
		CreatedAt: now,
	}
	repo := &repository.NotificationRepository{}
	if err := repo.Create(context.Background(), n); err != nil {
		t.Fatalf("Failed to create notification: %v", err)
	}
	return n
}

func TestNotificationServiceList(t *testing.T) {
	cleanup := setupNotificationDB(t)
	defer cleanup()
	InitNotificationService()

	user, _, _ := createTestUser(t, "notif-list@test.com")

	createNotificationDirect(t, user.ID, "info", "Title 1", "Body 1", false)
	createNotificationDirect(t, user.ID, "info", "Title 2", "Body 2", true)

	notifs, err := Notifications.List(context.Background(), user.ID, 10, 0)
	if err != nil {
		t.Fatalf("List failed: %v", err)
	}
	if len(notifs) != 2 {
		t.Fatalf("Expected 2 notifications, got %d", len(notifs))
	}
}

func TestNotificationServiceList_Empty(t *testing.T) {
	cleanup := setupNotificationDB(t)
	defer cleanup()
	InitNotificationService()

	user, _, _ := createTestUser(t, "notif-empty@test.com")

	notifs, err := Notifications.List(context.Background(), user.ID, 10, 0)
	if err != nil {
		t.Fatalf("List failed: %v", err)
	}
	if len(notifs) != 0 {
		t.Fatalf("Expected 0 notifications, got %d", len(notifs))
	}
}

func TestNotificationServiceCountUnread(t *testing.T) {
	cleanup := setupNotificationDB(t)
	defer cleanup()
	InitNotificationService()

	user, _, _ := createTestUser(t, "notif-count@test.com")

	// Create 3 unread and 2 read notifications
	createNotificationDirect(t, user.ID, "info", "U1", "Unread 1", false)
	createNotificationDirect(t, user.ID, "info", "U2", "Unread 2", false)
	createNotificationDirect(t, user.ID, "info", "U3", "Unread 3", false)
	createNotificationDirect(t, user.ID, "info", "R1", "Read 1", true)
	createNotificationDirect(t, user.ID, "info", "R2", "Read 2", true)

	count, err := Notifications.CountUnread(context.Background(), user.ID)
	if err != nil {
		t.Fatalf("CountUnread failed: %v", err)
	}
	if count != 3 {
		t.Fatalf("Expected 3 unread, got %d", count)
	}
}

func TestNotificationServiceMarkRead(t *testing.T) {
	cleanup := setupNotificationDB(t)
	defer cleanup()
	InitNotificationService()

	user, _, _ := createTestUser(t, "notif-markread@test.com")
	n := createNotificationDirect(t, user.ID, "info", "Markable", "Will be marked read", false)

	err := Notifications.MarkRead(context.Background(), n.ID, user.ID)
	if err != nil {
		t.Fatalf("MarkRead failed: %v", err)
	}

	count, _ := Notifications.CountUnread(context.Background(), user.ID)
	if count != 0 {
		t.Fatalf("Expected 0 unread after marking read, got %d", count)
	}
}

func TestNotificationServiceMarkRead_WrongUser(t *testing.T) {
	cleanup := setupNotificationDB(t)
	defer cleanup()
	InitNotificationService()

	user, _, _ := createTestUser(t, "notif-owner@test.com")
	other, _, _ := createTestUser(t, "notif-other@test.com")
	n := createNotificationDirect(t, user.ID, "info", "Owner's", "Other user cannot mark", false)

	// MarkRead with wrong user should not error (it just won't match any rows)
	err := Notifications.MarkRead(context.Background(), n.ID, other.ID)
	// MarkRead uses UPDATE ... WHERE id = $1 AND user_id = $2, so it succeeds silently
	if err != nil {
		t.Fatalf("MarkRead with wrong user should not error: %v", err)
	}

	// Verify notification is still unread for the owner
	count, _ := Notifications.CountUnread(context.Background(), user.ID)
	if count != 1 {
		t.Fatalf("Expected 1 unread for owner, got %d", count)
	}
}
