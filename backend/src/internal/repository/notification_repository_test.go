package repository

import (
	"context"
	"testing"
	"time"

	"budgeteer-backend/internal/model"

	"github.com/google/uuid"
)

func TestNotificationRepoCreateAndList(t *testing.T) {
	cleanup := repoSetupDB(t)
	defer cleanup()

	userRepo := &UserRepository{}
	user := createUser(t, "notif-list@test.com")
	userRepo.Create(context.Background(), user)

	repo := &NotificationRepository{}
	data := `{"invitation_id": "inv-123"}`
	notif := &model.Notification{
		ID:        uuid.New().String(),
		UserID:    user.ID,
		Type:      "invitation_received",
		Title:     "New Invitation",
		Body:      "You have a new invitation",
		Data:      &data,
		IsRead:    false,
		CreatedAt: time.Now(),
	}

	err := repo.Create(context.Background(), notif)
	if err != nil {
		t.Fatalf("NotificationRepo.Create failed: %v", err)
	}

	notifications, err := repo.ListByUserID(context.Background(), user.ID, 10, 0)
	if err != nil {
		t.Fatalf("ListByUserID failed: %v", err)
	}
	if len(notifications) != 1 {
		t.Fatalf("Expected 1 notification, got %d", len(notifications))
	}
	if notifications[0].ID != notif.ID {
		t.Fatalf("Expected notification ID %q, got %q", notif.ID, notifications[0].ID)
	}
	if notifications[0].Title != "New Invitation" {
		t.Fatalf("Expected title 'New Invitation', got %q", notifications[0].Title)
	}
	if notifications[0].Type != "invitation_received" {
		t.Fatalf("Expected type 'invitation_received', got %q", notifications[0].Type)
	}
	if notifications[0].IsRead {
		t.Fatal("Expected IsRead to remain false after creation")
	}
	if notifications[0].Data == nil {
		t.Fatal("Data should not be nil")
	}
	if *notifications[0].Data != data {
		t.Fatalf("Expected data %q, got %q", data, *notifications[0].Data)
	}
}

func TestNotificationRepoListByUserID_Empty(t *testing.T) {
	cleanup := repoSetupDB(t)
	defer cleanup()

	userRepo := &UserRepository{}
	user := createUser(t, "notif-empty@test.com")
	userRepo.Create(context.Background(), user)

	repo := &NotificationRepository{}
	notifications, err := repo.ListByUserID(context.Background(), user.ID, 10, 0)
	if err != nil {
		t.Fatalf("ListByUserID failed: %v", err)
	}
	if len(notifications) != 0 {
		t.Fatalf("Expected 0 notifications, got %d", len(notifications))
	}
}

func TestNotificationRepoMarkRead(t *testing.T) {
	cleanup := repoSetupDB(t)
	defer cleanup()

	userRepo := &UserRepository{}
	user := createUser(t, "notif-mark-read@test.com")
	userRepo.Create(context.Background(), user)

	repo := &NotificationRepository{}
	notif := &model.Notification{
		ID:        uuid.New().String(),
		UserID:    user.ID,
		Type:      "test",
		Title:     "Test",
		Body:      "Test body",
		IsRead:    false,
		CreatedAt: time.Now(),
	}

	err := repo.Create(context.Background(), notif)
	if err != nil {
		t.Fatalf("NotificationRepo.Create failed: %v", err)
	}

	err = repo.MarkRead(context.Background(), notif.ID, user.ID)
	if err != nil {
		t.Fatalf("MarkRead failed: %v", err)
	}

	notifications, _ := repo.ListByUserID(context.Background(), user.ID, 10, 0)
	if len(notifications) != 1 {
		t.Fatalf("Expected 1 notification, got %d", len(notifications))
	}
	if !notifications[0].IsRead {
		t.Fatal("Notification should be read after MarkRead")
	}
}

func TestNotificationRepoCountUnread(t *testing.T) {
	cleanup := repoSetupDB(t)
	defer cleanup()

	userRepo := &UserRepository{}
	user := createUser(t, "notif-count-unread@test.com")
	userRepo.Create(context.Background(), user)

	repo := &NotificationRepository{}

	// Create 2 read notifications
	for i := 0; i < 2; i++ {
		notif := &model.Notification{
			ID:        uuid.New().String(),
			UserID:    user.ID,
			Type:      "test",
			Title:     "Read",
			Body:      "Read notification",
			IsRead:    true,
			CreatedAt: time.Now(),
		}
		err := repo.Create(context.Background(), notif)
		if err != nil {
			t.Fatalf("Failed to create read notification: %v", err)
		}
	}

	// Create 1 unread notification
	unread := &model.Notification{
		ID:        uuid.New().String(),
		UserID:    user.ID,
		Type:      "test",
		Title:     "Unread",
		Body:      "Unread notification",
		IsRead:    false,
		CreatedAt: time.Now(),
	}
	err := repo.Create(context.Background(), unread)
	if err != nil {
		t.Fatalf("Failed to create unread notification: %v", err)
	}

	count, err := repo.CountUnread(context.Background(), user.ID)
	if err != nil {
		t.Fatalf("CountUnread failed: %v", err)
	}
	if count != 1 {
		t.Fatalf("Expected 1 unread notification, got %d", count)
	}
}

func TestNotificationRepoCreateNotification(t *testing.T) {
	cleanup := repoSetupDB(t)
	defer cleanup()

	userRepo := &UserRepository{}
	user := createUser(t, "notif-create-conv@test.com")
	userRepo.Create(context.Background(), user)

	repo := &NotificationRepository{}
	data := `{"invitation_id": "inv-456"}`
	err := repo.CreateNotification(context.Background(), user.ID, "test_type", "Test Title", "Test body", &data)
	if err != nil {
		t.Fatalf("CreateNotification failed: %v", err)
	}

	notifications, err := repo.ListByUserID(context.Background(), user.ID, 10, 0)
	if err != nil {
		t.Fatalf("ListByUserID failed: %v", err)
	}
	if len(notifications) != 1 {
		t.Fatalf("Expected 1 notification, got %d", len(notifications))
	}
	if notifications[0].Type != "test_type" {
		t.Fatalf("Expected type 'test_type', got %q", notifications[0].Type)
	}
	if notifications[0].Title != "Test Title" {
		t.Fatalf("Expected title 'Test Title', got %q", notifications[0].Title)
	}
	if notifications[0].Body != "Test body" {
		t.Fatalf("Expected body 'Test body', got %q", notifications[0].Body)
	}
	if notifications[0].IsRead {
		t.Fatal("Expected IsRead to be false by default in CreateNotification")
	}
	if notifications[0].Data == nil {
		t.Fatal("Data should not be nil")
	}
	if *notifications[0].Data != data {
		t.Fatalf("Expected data %q, got %q", data, *notifications[0].Data)
	}
}
