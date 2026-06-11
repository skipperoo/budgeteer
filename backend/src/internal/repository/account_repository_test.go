package repository

import (
	"context"
	"testing"
	"time"

	"budgeteer-backend/internal/model"

	"github.com/google/uuid"
)

func TestAccountRepoCreate(t *testing.T) {
	cleanup := repoSetupDB(t)
	defer cleanup()

	userRepo := &UserRepository{}
	user := createUser(t, "repo-acc-create@test.com")
	userRepo.Create(context.Background(), user)

	repo := &AccountRepository{}
	account := &model.Account{
		ID:        uuid.New().String(),
		Currency:  "USD",
		Type:      "personal",
		CreatedBy: user.ID,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	err := repo.Create(context.Background(), account)
	if err != nil {
		t.Fatalf("AccountRepo.Create failed: %v", err)
	}
}

func TestAccountRepoFindByID(t *testing.T) {
	cleanup := repoSetupDB(t)
	defer cleanup()

	userRepo := &UserRepository{}
	user := createUser(t, "repo-acc-find@test.com")
	userRepo.Create(context.Background(), user)

	repo := &AccountRepository{}
	account := &model.Account{
		ID:        uuid.New().String(),
		Currency:  "EUR",
		Type:      "joint",
		CreatedBy: user.ID,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}
	repo.Create(context.Background(), account)

	found, err := repo.FindByID(context.Background(), account.ID)
	if err != nil {
		t.Fatalf("FindByID failed: %v", err)
	}
	if found == nil {
		t.Fatal("FindByID returned nil for existing account")
	}
	if found.Currency != "EUR" {
		t.Fatalf("Expected currency EUR, got %s", found.Currency)
	}
	if found.Type != "joint" {
		t.Fatalf("Expected type joint, got %s", found.Type)
	}
}

func TestAccountRepoFindByID_NotFound(t *testing.T) {
	cleanup := repoSetupDB(t)
	defer cleanup()

	repo := &AccountRepository{}
	found, err := repo.FindByID(context.Background(), "00000000-0000-0000-0000-000000000000")
	if err != nil {
		t.Fatalf("FindByID failed: %v", err)
	}
	if found != nil {
		t.Fatal("FindByID should return nil for nonexistent ID")
	}
}

func TestAccountRepoSoftDelete(t *testing.T) {
	cleanup := repoSetupDB(t)
	defer cleanup()

	userRepo := &UserRepository{}
	user := createUser(t, "repo-acc-delete@test.com")
	userRepo.Create(context.Background(), user)

	repo := &AccountRepository{}
	account := &model.Account{
		ID:        uuid.New().String(),
		Currency:  "USD",
		Type:      "personal",
		CreatedBy: user.ID,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}
	repo.Create(context.Background(), account)

	err := repo.SoftDelete(context.Background(), account.ID)
	if err != nil {
		t.Fatalf("SoftDelete failed: %v", err)
	}

	found, _ := repo.FindByID(context.Background(), account.ID)
	if found.DeletedAt == nil {
		t.Fatal("Account should have DeletedAt set after soft delete")
	}
}

func TestAccountRepoListByUserID(t *testing.T) {
	cleanup := repoSetupDB(t)
	defer cleanup()

	acctRepo := &AccountRepository{}
	acctUserRepo := &AccountUserRepository{}
	userRepo := &UserRepository{}

	user := createUser(t, "repo-list-accounts@test.com")
	userRepo.Create(context.Background(), user)

	account := &model.Account{
		ID:        uuid.New().String(),
		Currency:  "USD",
		Type:      "personal",
		CreatedBy: user.ID,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}
	acctRepo.Create(context.Background(), account)

	acctUserRepo.Create(context.Background(), &model.AccountUser{
		AccountID: account.ID,
		UserID:    user.ID,
		Role:      "owner",
		JoinedAt:  time.Now(),
	})

	accounts, err := acctRepo.ListByUserID(context.Background(), user.ID)
	if err != nil {
		t.Fatalf("ListByUserID failed: %v", err)
	}
	if len(accounts) != 1 {
		t.Fatalf("Expected 1 account, got %d", len(accounts))
	}
	if accounts[0].ID != account.ID {
		t.Fatalf("Expected account ID %q, got %q", account.ID, accounts[0].ID)
	}
}
