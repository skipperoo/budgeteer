package repository

import (
	"context"
	"testing"
	"time"

	"budgeteer-backend/internal/database"
	"budgeteer-backend/internal/model"
	"budgeteer-backend/internal/testhelpers"

	"github.com/google/uuid"
)

func repoSetupDB(t *testing.T) func() {
	t.Helper()

	ctx := context.Background()

	pg, err := testhelpers.SetupPostgresOnce(ctx)
	if err != nil {
		t.Skipf("Skipping repository integration test: postgres not available: %v", err)
	}

	if err := database.Connect(ctx, pg.DSN); err != nil {
		t.Skipf("Skipping repository integration test: database connect failed: %v", err)
	}

	cleanup := func() {
		database.Pool.Exec(ctx, "DELETE FROM email_outbox")
		database.Pool.Exec(ctx, "DELETE FROM otps")
		database.Pool.Exec(ctx, "DELETE FROM sync_queue")
		database.Pool.Exec(ctx, "DELETE FROM account_users")
		database.Pool.Exec(ctx, "DELETE FROM accounts")
		database.Pool.Exec(ctx, "DELETE FROM transactions")
		database.Pool.Exec(ctx, "DELETE FROM users")
		database.Close()
	}
	return cleanup
}

func createUser(t *testing.T, email string) *model.User {
	t.Helper()
	u := &model.User{
		ID:                  uuid.New().String(),
		Email:               email,
		PasswordHash:        "$2a$10$hash",
		PublicKey:           "pk",
		EncryptedPrivateKey: "ek",
		IsVerified:          true,
		CreatedAt:           time.Now(),
		UpdatedAt:           time.Now(),
	}
	return u
}

func TestUserRepoCreate(t *testing.T) {
	cleanup := repoSetupDB(t)
	defer cleanup()

	repo := &UserRepository{}
	user := createUser(t, "repo-create@test.com")

	err := repo.Create(context.Background(), user)
	if err != nil {
		t.Fatalf("UserRepo.Create failed: %v", err)
	}
}

func TestUserRepoFindByEmail(t *testing.T) {
	cleanup := repoSetupDB(t)
	defer cleanup()

	repo := &UserRepository{}
	user := createUser(t, "repo-find-by-email@test.com")
	repo.Create(context.Background(), user)

	found, err := repo.FindByEmail(context.Background(), "repo-find-by-email@test.com")
	if err != nil {
		t.Fatalf("FindByEmail failed: %v", err)
	}
	if found == nil {
		t.Fatal("FindByEmail returned nil for existing user")
	}
	if found.Email != user.Email {
		t.Fatalf("Expected email %q, got %q", user.Email, found.Email)
	}
}

func TestUserRepoFindByEmail_NotFound(t *testing.T) {
	cleanup := repoSetupDB(t)
	defer cleanup()

	repo := &UserRepository{}
	found, err := repo.FindByEmail(context.Background(), "nonexistent@test.com")
	if err != nil {
		t.Fatalf("FindByEmail failed: %v", err)
	}
	if found != nil {
		t.Fatal("FindByEmail should return nil for nonexistent email")
	}
}

func TestUserRepoFindByID(t *testing.T) {
	cleanup := repoSetupDB(t)
	defer cleanup()

	repo := &UserRepository{}
	user := createUser(t, "repo-find-by-id@test.com")
	repo.Create(context.Background(), user)

	found, err := repo.FindByID(context.Background(), user.ID)
	if err != nil {
		t.Fatalf("FindByID failed: %v", err)
	}
	if found == nil {
		t.Fatal("FindByID returned nil for existing user")
	}
	if found.ID != user.ID {
		t.Fatalf("Expected ID %q, got %q", user.ID, found.ID)
	}
}

func TestUserRepoFindByID_NotFound(t *testing.T) {
	cleanup := repoSetupDB(t)
	defer cleanup()

	repo := &UserRepository{}
	found, err := repo.FindByID(context.Background(), "00000000-0000-0000-0000-000000000000")
	if err != nil {
		t.Fatalf("FindByID failed: %v", err)
	}
	if found != nil {
		t.Fatal("FindByID should return nil for nonexistent ID")
	}
}

func TestUserRepoUpdateVerified(t *testing.T) {
	cleanup := repoSetupDB(t)
	defer cleanup()

	repo := &UserRepository{}
	user := createUser(t, "repo-update-verified@test.com")
	user.IsVerified = false
	repo.Create(context.Background(), user)

	err := repo.UpdateVerified(context.Background(), user.ID)
	if err != nil {
		t.Fatalf("UpdateVerified failed: %v", err)
	}

	found, _ := repo.FindByID(context.Background(), user.ID)
	if !found.IsVerified {
		t.Fatal("User should be verified after UpdateVerified")
	}
}

func TestUserRepoUpdateEncryptedPrivateKey(t *testing.T) {
	cleanup := repoSetupDB(t)
	defer cleanup()

	repo := &UserRepository{}
	user := createUser(t, "repo-update-key@test.com")
	repo.Create(context.Background(), user)

	newKey := "new-encrypted-key"
	err := repo.UpdateEncryptedPrivateKey(context.Background(), user.ID, newKey)
	if err != nil {
		t.Fatalf("UpdateEncryptedPrivateKey failed: %v", err)
	}

	found, _ := repo.FindByID(context.Background(), user.ID)
	if found.EncryptedPrivateKey != newKey {
		t.Fatalf("Expected key %q, got %q", newKey, found.EncryptedPrivateKey)
	}
}

func TestUserRepoPublicKeyByEmail(t *testing.T) {
	cleanup := repoSetupDB(t)
	defer cleanup()

	repo := &UserRepository{}
	user := createUser(t, "repo-pubkey@test.com")
	user.PublicKey = "my-public-key"
	repo.Create(context.Background(), user)

	pk, err := repo.PublicKeyByEmail(context.Background(), "repo-pubkey@test.com")
	if err != nil {
		t.Fatalf("PublicKeyByEmail failed: %v", err)
	}
	if pk != "my-public-key" {
		t.Fatalf("Expected 'my-public-key', got %q", pk)
	}
}

func TestUserRepoPublicKeyByEmail_NotFound(t *testing.T) {
	cleanup := repoSetupDB(t)
	defer cleanup()

	repo := &UserRepository{}
	pk, err := repo.PublicKeyByEmail(context.Background(), "nonexistent@test.com")
	if err != nil {
		t.Fatalf("PublicKeyByEmail failed: %v", err)
	}
	if pk != "" {
		t.Fatalf("Expected empty string for nonexistent user, got %q", pk)
	}
}
