package service

import (
	"context"
	"testing"
	"time"

	"budgeteer-backend/internal/model"
	"budgeteer-backend/internal/repository"

	"github.com/google/uuid"
)

func TestLookupPublicKey_ExistingUser(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	InitUserService()

	userRepo := &repository.UserRepository{}
	user := &model.User{
		ID:                  uuid.New().String(),
		Email:               "pubkey-test@example.com",
		PasswordHash:        "hash",
		PublicKey:           "my-public-key-value",
		EncryptedPrivateKey: "enc-priv-key",
		IsVerified:          true,
		CreatedAt:           time.Now(),
		UpdatedAt:           time.Now(),
	}
	userRepo.Create(context.Background(), user)

	pk, err := Users.LookupPublicKey(context.Background(), "pubkey-test@example.com")
	if err != nil {
		t.Fatalf("LookupPublicKey failed: %v", err)
	}
	if pk != "my-public-key-value" {
		t.Fatalf("Expected public key 'my-public-key-value', got %q", pk)
	}
}

func TestLookupPublicKey_NotFound(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	InitUserService()

	_, err := Users.LookupPublicKey(context.Background(), "nonexistent@example.com")
	if err == nil {
		t.Fatal("LookupPublicKey should fail for nonexistent user")
	}
}

func TestLookupPublicKey_EmptyPublicKey(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	InitUserService()

	userRepo := &repository.UserRepository{}
	user := &model.User{
		ID:                  uuid.New().String(),
		Email:               "empty-pubkey@example.com",
		PasswordHash:        "hash",
		PublicKey:           "",
		EncryptedPrivateKey: "enc-priv-key",
		IsVerified:          true,
		CreatedAt:           time.Now(),
		UpdatedAt:           time.Now(),
	}
	userRepo.Create(context.Background(), user)

	_, err := Users.LookupPublicKey(context.Background(), "empty-pubkey@example.com")
	if err == nil {
		t.Fatal("LookupPublicKey should fail when public key is empty")
	}
}
