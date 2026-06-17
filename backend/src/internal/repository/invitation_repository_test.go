package repository

import (
	"context"
	"testing"
	"time"

	"budgeteer-backend/internal/model"

	"github.com/google/uuid"
)

func TestInvitationRepoCreateAndFindByID(t *testing.T) {
	cleanup := repoSetupDB(t)
	defer cleanup()

	userRepo := &UserRepository{}
	inviter := createUser(t, "inv-repo-create@test.com")
	userRepo.Create(context.Background(), inviter)

	repo := &InvitationRepository{}
	inv := &model.Invitation{
		ID:           uuid.New().String(),
		EntityType:   "rule",
		EntityID:     uuid.New().String(),
		InvitedBy:    inviter.ID,
		InvitedEmail: "invited-create@test.com",
		Status:       "pending",
		CreatedAt:    time.Now(),
		ExpiresAt:    time.Now().Add(30 * 24 * time.Hour),
	}

	err := repo.Create(context.Background(), inv)
	if err != nil {
		t.Fatalf("InvitationRepo.Create failed: %v", err)
	}

	found, err := repo.FindByID(context.Background(), inv.ID)
	if err != nil {
		t.Fatalf("FindByID failed: %v", err)
	}
	if found == nil {
		t.Fatal("FindByID returned nil for existing invitation")
	}
	if found.EntityType != "rule" {
		t.Fatalf("Expected entity_type 'rule', got %q", found.EntityType)
	}
	if found.InvitedEmail != "invited-create@test.com" {
		t.Fatalf("Expected email 'invited-create@test.com', got %q", found.InvitedEmail)
	}
	if found.Status != "pending" {
		t.Fatalf("Expected status 'pending', got %q", found.Status)
	}
}

func TestInvitationRepoFindByID_NotFound(t *testing.T) {
	cleanup := repoSetupDB(t)
	defer cleanup()

	repo := &InvitationRepository{}
	found, err := repo.FindByID(context.Background(), "00000000-0000-0000-0000-000000000000")
	if err != nil {
		t.Fatalf("FindByID failed: %v", err)
	}
	if found != nil {
		t.Fatal("FindByID should return nil for nonexistent ID")
	}
}

func TestInvitationRepoFindPendingByUserID(t *testing.T) {
	cleanup := repoSetupDB(t)
	defer cleanup()

	userRepo := &UserRepository{}
	inviter := createUser(t, "inv-find-user-inviter@test.com")
	invitee := createUser(t, "inv-find-user-invitee@test.com")
	userRepo.Create(context.Background(), inviter)
	userRepo.Create(context.Background(), invitee)

	repo := &InvitationRepository{}
	inv := &model.Invitation{
		ID:            uuid.New().String(),
		EntityType:    "account",
		EntityID:      uuid.New().String(),
		InvitedBy:     inviter.ID,
		InvitedEmail:  invitee.Email,
		InvitedUserID: &invitee.ID,
		Status:        "pending",
		CreatedAt:     time.Now(),
		ExpiresAt:     time.Now().Add(30 * 24 * time.Hour),
	}

	err := repo.Create(context.Background(), inv)
	if err != nil {
		t.Fatalf("InvitationRepo.Create failed: %v", err)
	}

	invitations, err := repo.FindPendingByUserID(context.Background(), invitee.ID)
	if err != nil {
		t.Fatalf("FindPendingByUserID failed: %v", err)
	}
	if len(invitations) != 1 {
		t.Fatalf("Expected 1 invitation, got %d", len(invitations))
	}
	if invitations[0].ID != inv.ID {
		t.Fatalf("Expected invitation ID %q, got %q", inv.ID, invitations[0].ID)
	}
}

func TestInvitationRepoFindPendingByEmail(t *testing.T) {
	cleanup := repoSetupDB(t)
	defer cleanup()

	userRepo := &UserRepository{}
	inviter := createUser(t, "inv-find-email-inviter@test.com")
	userRepo.Create(context.Background(), inviter)

	repo := &InvitationRepository{}
	inv := &model.Invitation{
		ID:           uuid.New().String(),
		EntityType:   "rule",
		EntityID:     uuid.New().String(),
		InvitedBy:    inviter.ID,
		InvitedEmail: "pending-email@test.com",
		Status:       "pending",
		CreatedAt:    time.Now(),
		ExpiresAt:    time.Now().Add(30 * 24 * time.Hour),
	}

	err := repo.Create(context.Background(), inv)
	if err != nil {
		t.Fatalf("InvitationRepo.Create failed: %v", err)
	}

	invitations, err := repo.FindPendingByEmail(context.Background(), "pending-email@test.com")
	if err != nil {
		t.Fatalf("FindPendingByEmail failed: %v", err)
	}
	if len(invitations) != 1 {
		t.Fatalf("Expected 1 invitation, got %d", len(invitations))
	}
	if invitations[0].ID != inv.ID {
		t.Fatalf("Expected invitation ID %q, got %q", inv.ID, invitations[0].ID)
	}
}

func TestInvitationRepoFindExpired(t *testing.T) {
	cleanup := repoSetupDB(t)
	defer cleanup()

	userRepo := &UserRepository{}
	inviter := createUser(t, "inv-find-expired@test.com")
	userRepo.Create(context.Background(), inviter)

	repo := &InvitationRepository{}
	inv := &model.Invitation{
		ID:           uuid.New().String(),
		EntityType:   "rule",
		EntityID:     uuid.New().String(),
		InvitedBy:    inviter.ID,
		InvitedEmail: "expired@test.com",
		Status:       "pending",
		CreatedAt:    time.Now().Add(-48 * time.Hour),
		ExpiresAt:    time.Now().Add(-24 * time.Hour), // in the past
	}

	err := repo.Create(context.Background(), inv)
	if err != nil {
		t.Fatalf("InvitationRepo.Create failed: %v", err)
	}

	invitations, err := repo.FindExpired(context.Background(), time.Now())
	if err != nil {
		t.Fatalf("FindExpired failed: %v", err)
	}
	if len(invitations) != 1 {
		t.Fatalf("Expected 1 expired invitation, got %d", len(invitations))
	}
	if invitations[0].ID != inv.ID {
		t.Fatalf("Expected invitation ID %q, got %q", inv.ID, invitations[0].ID)
	}
}

func TestInvitationRepoUpdateStatus(t *testing.T) {
	cleanup := repoSetupDB(t)
	defer cleanup()

	userRepo := &UserRepository{}
	inviter := createUser(t, "inv-update-status@test.com")
	userRepo.Create(context.Background(), inviter)

	repo := &InvitationRepository{}
	inv := &model.Invitation{
		ID:           uuid.New().String(),
		EntityType:   "rule",
		EntityID:     uuid.New().String(),
		InvitedBy:    inviter.ID,
		InvitedEmail: "update-status@test.com",
		Status:       "pending",
		CreatedAt:    time.Now(),
		ExpiresAt:    time.Now().Add(30 * 24 * time.Hour),
	}

	err := repo.Create(context.Background(), inv)
	if err != nil {
		t.Fatalf("InvitationRepo.Create failed: %v", err)
	}

	err = repo.UpdateStatus(context.Background(), inv.ID, "accepted")
	if err != nil {
		t.Fatalf("UpdateStatus failed: %v", err)
	}

	found, _ := repo.FindByID(context.Background(), inv.ID)
	if found == nil {
		t.Fatal("FindByID returned nil after update")
	}
	if found.Status != "accepted" {
		t.Fatalf("Expected status 'accepted', got %q", found.Status)
	}
}

func TestInvitationRepoUpdateInvitedUserID(t *testing.T) {
	cleanup := repoSetupDB(t)
	defer cleanup()

	userRepo := &UserRepository{}
	inviter := createUser(t, "inv-update-user-inviter@test.com")
	invitee := createUser(t, "inv-update-user-invitee@test.com")
	userRepo.Create(context.Background(), inviter)
	userRepo.Create(context.Background(), invitee)

	repo := &InvitationRepository{}
	inv := &model.Invitation{
		ID:           uuid.New().String(),
		EntityType:   "rule",
		EntityID:     uuid.New().String(),
		InvitedBy:    inviter.ID,
		InvitedEmail: invitee.Email,
		Status:       "pending",
		CreatedAt:    time.Now(),
		ExpiresAt:    time.Now().Add(30 * 24 * time.Hour),
	}

	err := repo.Create(context.Background(), inv)
	if err != nil {
		t.Fatalf("InvitationRepo.Create failed: %v", err)
	}

	err = repo.UpdateInvitedUserID(context.Background(), inv.ID, invitee.ID)
	if err != nil {
		t.Fatalf("UpdateInvitedUserID failed: %v", err)
	}

	found, _ := repo.FindByID(context.Background(), inv.ID)
	if found == nil {
		t.Fatal("FindByID returned nil after update")
	}
	if found.InvitedUserID == nil {
		t.Fatal("InvitedUserID should not be nil after update")
	}
	if *found.InvitedUserID != invitee.ID {
		t.Fatalf("Expected InvitedUserID %q, got %q", invitee.ID, *found.InvitedUserID)
	}
}

func TestInvitationRepoFindByEntity(t *testing.T) {
	cleanup := repoSetupDB(t)
	defer cleanup()

	userRepo := &UserRepository{}
	inviter := createUser(t, "inv-find-entity@test.com")
	userRepo.Create(context.Background(), inviter)

	entityID := uuid.New().String()

	repo := &InvitationRepository{}
	inv := &model.Invitation{
		ID:           uuid.New().String(),
		EntityType:   "account",
		EntityID:     entityID,
		InvitedBy:    inviter.ID,
		InvitedEmail: "find-entity@test.com",
		Status:       "pending",
		CreatedAt:    time.Now(),
		ExpiresAt:    time.Now().Add(30 * 24 * time.Hour),
	}

	err := repo.Create(context.Background(), inv)
	if err != nil {
		t.Fatalf("InvitationRepo.Create failed: %v", err)
	}

	found, err := repo.FindByEntity(context.Background(), "account", entityID)
	if err != nil {
		t.Fatalf("FindByEntity failed: %v", err)
	}
	if found == nil {
		t.Fatal("FindByEntity returned nil for existing invitation")
	}
	if found.ID != inv.ID {
		t.Fatalf("Expected invitation ID %q, got %q", inv.ID, found.ID)
	}
}
