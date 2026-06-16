package service

import (
	"context"
	"testing"

	"budgeteer-backend/internal/database"
	"budgeteer-backend/internal/model"
	"budgeteer-backend/internal/repository"
)

func TestAccountServiceCreate(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	InitAccountService()

	user, _, _ := createTestUser(t, "account-create@test.com")
	req := &model.CreateAccountRequest{Currency: "USD", Type: "personal"}

	account, err := Accounts.Create(context.Background(), user.ID, req)
	if err != nil {
		t.Fatalf("Create account failed: %v", err)
	}
	if account.ID == "" {
		t.Fatal("Created account has empty ID")
	}
	if account.Currency != "USD" {
		t.Fatalf("Expected currency USD, got %s", account.Currency)
	}
	if account.Type != "personal" {
		t.Fatalf("Expected type personal, got %s", account.Type)
	}
}

func TestAccountServiceCreateAndDelete(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	InitAccountService()

	user, _, _ := createTestUser(t, "account-delete@test.com")
	account, _ := Accounts.Create(context.Background(), user.ID, &model.CreateAccountRequest{Currency: "EUR", Type: "personal"})

	err := Accounts.SoftDelete(context.Background(), account.ID, user.ID)
	if err != nil {
		t.Fatalf("SoftDelete failed: %v", err)
	}

	err = Accounts.SoftDelete(context.Background(), account.ID, user.ID)
	if err == nil {
		t.Fatal("SoftDelete deleted account again should fail")
	}
}

func TestAccountServiceDeleteNonOwnerFails(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	InitAccountService()

	owner, _, _ := createTestUser(t, "owner@test.com")
	other, _, _ := createTestUser(t, "other@test.com")
	account, _ := Accounts.Create(context.Background(), owner.ID, &model.CreateAccountRequest{Currency: "USD", Type: "joint"})

	err := Accounts.SoftDelete(context.Background(), account.ID, other.ID)
	if err == nil {
		t.Fatal("Non-owner should not be able to delete account")
	}
}

func TestAccountServiceInviteUser(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	InitAccountService()
	InitInvitationService()

	owner, _, _ := createTestUser(t, "inviter@test.com")
	member, _, _ := createTestUser(t, "invitee@test.com")
	account, _ := Accounts.Create(context.Background(), owner.ID, &model.CreateAccountRequest{Currency: "USD", Type: "joint"})

	err := Accounts.InviteUser(context.Background(), account.ID, owner.ID, member.Email, "encrypted-key")
	if err != nil {
		t.Fatalf("InviteUser failed: %v", err)
	}

	// Verify invitation was created (new flow uses invitations table)
	invRepo := &repository.InvitationRepository{}
	invitations, err := invRepo.FindPendingByUserID(context.Background(), member.ID)
	if err != nil {
		t.Fatalf("FindPendingByUserID failed: %v", err)
	}
	if len(invitations) != 1 {
		t.Fatalf("Expected 1 invitation, got %d", len(invitations))
	}
	if invitations[0].EntityType != "account" {
		t.Fatalf("Expected account invitation, got %s", invitations[0].EntityType)
	}

	// Account should still only have 1 user (owner)
	users, err := Accounts.ListUsers(context.Background(), account.ID)
	if err != nil {
		t.Fatalf("ListUsers failed: %v", err)
	}
	if len(users) != 1 {
		t.Fatalf("Expected 1 user (owner only), got %d", len(users))
	}
}

func TestAccountServiceInviteDuplicatedFails(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	InitAccountService()
	InitInvitationService()

	owner, _, _ := createTestUser(t, "inviter2@test.com")
	member, _, _ := createTestUser(t, "invitee2@test.com")
	account, _ := Accounts.Create(context.Background(), owner.ID, &model.CreateAccountRequest{Currency: "USD", Type: "joint"})

	Accounts.InviteUser(context.Background(), account.ID, owner.ID, member.Email, "key")
	err := Accounts.InviteUser(context.Background(), account.ID, owner.ID, member.Email, "key2")
	if err == nil {
		t.Fatal("Duplicate invite should fail")
	}
}

func TestAccountServiceInviteNonExistentUser(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	InitAccountService()
	InitInvitationService()

	owner, _, _ := createTestUser(t, "inviter3@test.com")
	account, _ := Accounts.Create(context.Background(), owner.ID, &model.CreateAccountRequest{Currency: "USD", Type: "joint"})

	// New flow: inviting a nonexistent user creates a pending invitation
	// so the user can accept after registering
	err := Accounts.InviteUser(context.Background(), account.ID, owner.ID, "nonexistent@test.com", "key")
	if err != nil {
		t.Fatalf("InviteUser failed for nonexistent email: %v", err)
	}

	// Verify invitation was created
	var invCount int
	database.Pool.QueryRow(context.Background(),
		`SELECT COUNT(*) FROM invitations WHERE invited_email = $1 AND entity_type = 'account'`,
		"nonexistent@test.com").Scan(&invCount)
	if invCount != 1 {
		t.Fatalf("Expected 1 invitation for nonexistent user, got %d", invCount)
	}
}

func TestAccountServiceRemoveUser(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	InitAccountService()

	owner, _, _ := createTestUser(t, "remove-owner@test.com")
	member, _, _ := createTestUser(t, "remove-member@test.com")
	account, _ := Accounts.Create(context.Background(), owner.ID, &model.CreateAccountRequest{Currency: "USD", Type: "joint"})
	Accounts.InviteUser(context.Background(), account.ID, owner.ID, member.Email, "key")

	err := Accounts.RemoveUser(context.Background(), account.ID, owner.ID, member.ID)
	if err != nil {
		t.Fatalf("RemoveUser failed: %v", err)
	}

	users, _ := Accounts.ListUsers(context.Background(), account.ID)
	if len(users) != 1 {
		t.Fatalf("Expected 1 user after removal, got %d", len(users))
	}
}

func TestAccountServiceRemoveSelfFails(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()
	InitAccountService()

	owner, _, _ := createTestUser(t, "remove-self@test.com")
	account, _ := Accounts.Create(context.Background(), owner.ID, &model.CreateAccountRequest{Currency: "USD", Type: "personal"})

	err := Accounts.RemoveUser(context.Background(), account.ID, owner.ID, owner.ID)
	if err == nil {
		t.Fatal("Removing yourself should fail")
	}
}
