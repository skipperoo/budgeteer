package service

import (
	"context"
	"testing"
	"time"

	"budgeteer-backend/internal/model"
	"budgeteer-backend/internal/repository"

	"github.com/google/uuid"
)

func createTestUser(t *testing.T, email string) (*model.User, string, string) {
	t.Helper()
	hash, _ := HashPassword("test-password-123!")
	user := &model.User{
		ID:                  uuid.New().String(),
		Email:               email,
		PasswordHash:        hash,
		PublicKey:           "test-public-key",
		EncryptedPrivateKey: "test-encrypted-key",
		IsVerified:          true,
		CreatedAt:           time.Now(),
		UpdatedAt:           time.Now(),
	}
	userRepo := &repository.UserRepository{}
	if err := userRepo.Create(context.Background(), user); err != nil {
		t.Fatalf("Failed to create test user: %v", err)
	}
	return user, hash, ""
}

func TestSyncServicePull_Empty(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	InitSyncService()

	user, _, _ := createTestUser(t, "sync-pull-empty@test.com")

	items, cursor, err := Sync.Pull(context.Background(), user.ID, nil)
	if err != nil {
		t.Fatalf("Pull failed: %v", err)
	}
	if len(items) != 0 {
		t.Fatalf("Expected 0 items, got %d", len(items))
	}
	if cursor != nil {
		t.Fatal("Expected nil cursor for empty results")
	}
}

func TestSyncServicePushInsertTransaction(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	InitAccountService()
	InitSyncService()
	InitUserService()

	payer, _, _ := createTestUser(t, "sync-push-payer@test.com")
	jointUser, _, _ := createTestUser(t, "sync-push-joint@test.com")

	account, _ := Accounts.Create(context.Background(), payer.ID, &model.CreateAccountRequest{Currency: "USD", Type: "joint"})
	// Directly add joint user to account_users (not via invitation flow)
	acctUserRepo := &repository.AccountUserRepository{}
	acctUserRepo.Create(context.Background(), &model.AccountUser{
		AccountID:           account.ID,
		UserID:              jointUser.ID,
		EncryptedAccountKey: "encrypted-key",
		Role:                "member",
		Status:              "active",
		JoinedAt:            time.Now(),
	})

	payload := "encrypted-transaction-data"
	ops := []model.SyncOperation{
		{
			Action:           "INSERT",
			EntityType:       account.ID,
			EntityID:         uuid.New().String(),
			EncryptedPayload: payload,
			Timestamp:        time.Now().UTC().Format(time.RFC3339),
		},
	}

	err := Sync.Push(context.Background(), payer.ID, ops)
	if err != nil {
		t.Fatalf("Push failed: %v", err)
	}

	items, _, err := Sync.Pull(context.Background(), jointUser.ID, nil)
	if err != nil {
		t.Fatalf("Pull for joint user failed: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("Expected 1 sync item for joint user, got %d", len(items))
	}
	if items[0].Action != "INSERT" {
		t.Fatalf("Expected action INSERT, got %s", items[0].Action)
	}
}

func TestSyncServicePullPagination(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	InitSyncService()

	user, _, _ := createTestUser(t, "sync-pagination@test.com")
	syncRepo := &repository.SyncRepository{}
	now := time.Now()

	for i := 0; i < 3; i++ {
		item := &model.SyncQueueItem{
			ID:           uuid.New().String(),
			TargetUserID: user.ID,
			Action:       "INSERT",
			EntityType:   "transaction",
			CreatedAt:    now.Add(time.Duration(i) * time.Second),
		}
		syncRepo.Create(context.Background(), item)
	}

	items1, cursor, err := Sync.Pull(context.Background(), user.ID, nil)
	if err != nil {
		t.Fatalf("First Pull failed: %v", err)
	}
	if len(items1) != 3 {
		t.Fatalf("Expected 3 items in first pull, got %d", len(items1))
	}
	if cursor != nil {
		t.Fatalf("Expected nil cursor for 3 items (limit=500), got %v", *cursor)
	}

	items2, _, _ := Sync.Pull(context.Background(), user.ID, nil)
	if len(items2) != 0 {
		t.Fatalf("Expected 0 items on second pull (all consumed), got %d", len(items2))
	}
}

func TestSyncServicePushDeleteSyncsToJointUsers(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	InitAccountService()
	InitSyncService()

	owner, _, _ := createTestUser(t, "sync-delete-owner@test.com")
	member, _, _ := createTestUser(t, "sync-delete-member@test.com")

	account, _ := Accounts.Create(context.Background(), owner.ID, &model.CreateAccountRequest{Currency: "USD", Type: "joint"})
	acctUserRepo := &repository.AccountUserRepository{}
	acctUserRepo.Create(context.Background(), &model.AccountUser{
		AccountID:           account.ID,
		UserID:              member.ID,
		EncryptedAccountKey: "key",
		Role:                "member",
		Status:              "active",
		JoinedAt:            time.Now(),
	})

	ops := []model.SyncOperation{
		{
			Action:           "DELETE",
			EntityType:       account.ID,
			EntityID:         "tx-1",
			EncryptedPayload: "",
			Timestamp:        time.Now().UTC().Format(time.RFC3339),
		},
	}

	err := Sync.Push(context.Background(), owner.ID, ops)
	if err != nil {
		t.Fatalf("Push with DELETE failed: %v", err)
	}

	items, _, _ := Sync.Pull(context.Background(), member.ID, nil)
	if len(items) != 1 {
		t.Fatalf("Expected 1 sync item for DELETE, got %d", len(items))
	}
	if items[0].Action != "DELETE" {
		t.Fatalf("Expected action DELETE, got %s", items[0].Action)
	}
}

func TestParseTime(t *testing.T) {
	tests := []struct {
		input string
		valid bool
	}{
		{time.Now().UTC().Format(time.RFC3339), true},
		{time.Now().UTC().Format(time.RFC3339Nano), true},
		{time.Now().UTC().Format("2006-01-02T15:04:05Z"), true},
		{"invalid-time", false},
	}

	for _, tt := range tests {
		_, err := parseTime(tt.input)
		if tt.valid && err != nil {
			t.Fatalf("parseTime(%q) should succeed: %v", tt.input, err)
		}
		if !tt.valid && err == nil {
			t.Fatalf("parseTime(%q) should fail", tt.input)
		}
	}
}
