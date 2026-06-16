package repository

import (
	"context"
	"testing"
	"time"

	"budgeteer-backend/internal/model"

	"github.com/google/uuid"
)

func TestRuleRepoCreateAndFindByID(t *testing.T) {
	cleanup := repoSetupDB(t)
	defer cleanup()

	userRepo := &UserRepository{}
	user := createUser(t, "rule-create@test.com")
	userRepo.Create(context.Background(), user)

	repo := &RuleRepository{}
	rule := &model.Rule{
		ID:               uuid.New().String(),
		CreatedBy:        user.ID,
		Name:             "Test Rule",
		EncryptedPayload: "1|test-encrypted-payload",
		Frequency:        "monthly",
		NextOccurrence:   time.Now().Add(7 * 24 * time.Hour),
		OccurrencesSoFar: 0,
		IsActive:         true,
		Status:           "active",
		CreatedAt:        time.Now(),
		UpdatedAt:        time.Now(),
	}

	err := repo.Create(context.Background(), rule)
	if err != nil {
		t.Fatalf("RuleRepo.Create failed: %v", err)
	}

	found, err := repo.FindByID(context.Background(), rule.ID)
	if err != nil {
		t.Fatalf("FindByID failed: %v", err)
	}
	if found == nil {
		t.Fatal("FindByID returned nil for existing rule")
	}
	if found.Name != "Test Rule" {
		t.Fatalf("Expected name 'Test Rule', got %q", found.Name)
	}
	if found.Frequency != "monthly" {
		t.Fatalf("Expected frequency 'monthly', got %q", found.Frequency)
	}
	if found.EncryptedPayload != "1|test-encrypted-payload" {
		t.Fatalf("Expected payload %q, got %q", "1|test-encrypted-payload", found.EncryptedPayload)
	}
	if found.IsActive != true {
		t.Fatal("Rule should be active")
	}
	if found.OccurrencesSoFar != 0 {
		t.Fatalf("Expected occurrences_so_far 0, got %d", found.OccurrencesSoFar)
	}
	if found.Status != "active" {
		t.Fatalf("Expected status 'active', got %q", found.Status)
	}
}

func TestRuleRepoFindByID_NotFound(t *testing.T) {
	cleanup := repoSetupDB(t)
	defer cleanup()

	repo := &RuleRepository{}
	found, err := repo.FindByID(context.Background(), "00000000-0000-0000-0000-000000000000")
	if err != nil {
		t.Fatalf("FindByID failed: %v", err)
	}
	if found != nil {
		t.Fatal("FindByID should return nil for nonexistent ID")
	}
}

func TestRuleRepoListByUserID(t *testing.T) {
	cleanup := repoSetupDB(t)
	defer cleanup()

	userRepo := &UserRepository{}
	user := createUser(t, "rule-list@test.com")
	userRepo.Create(context.Background(), user)

	repo := &RuleRepository{}

	rule1 := &model.Rule{
		ID:               uuid.New().String(),
		CreatedBy:        user.ID,
		Name:             "Rule 1",
		EncryptedPayload: "1|payload-1",
		Frequency:        "weekly",
		NextOccurrence:   time.Now().Add(7 * 24 * time.Hour),
		OccurrencesSoFar: 0,
		IsActive:         true,
		Status:           "active",
		CreatedAt:        time.Now(),
		UpdatedAt:        time.Now(),
	}
	err := repo.Create(context.Background(), rule1)
	if err != nil {
		t.Fatalf("RuleRepo.Create failed for rule1: %v", err)
	}

	rule2 := &model.Rule{
		ID:               uuid.New().String(),
		CreatedBy:        user.ID,
		Name:             "Rule 2",
		EncryptedPayload: "1|payload-2",
		Frequency:        "daily",
		NextOccurrence:   time.Now().Add(24 * time.Hour),
		OccurrencesSoFar: 3,
		IsActive:         true,
		Status:           "active",
		CreatedAt:        time.Now(),
		UpdatedAt:        time.Now(),
	}
	err = repo.Create(context.Background(), rule2)
	if err != nil {
		t.Fatalf("RuleRepo.Create failed for rule2: %v", err)
	}

	rules, err := repo.ListByUserID(context.Background(), user.ID)
	if err != nil {
		t.Fatalf("ListByUserID failed: %v", err)
	}
	if len(rules) != 2 {
		t.Fatalf("Expected 2 rules, got %d", len(rules))
	}
}

func TestRuleRepoListByUserID_Empty(t *testing.T) {
	cleanup := repoSetupDB(t)
	defer cleanup()

	userRepo := &UserRepository{}
	user := createUser(t, "rule-list-empty@test.com")
	userRepo.Create(context.Background(), user)

	repo := &RuleRepository{}
	rules, err := repo.ListByUserID(context.Background(), user.ID)
	if err != nil {
		t.Fatalf("ListByUserID failed: %v", err)
	}
	if len(rules) != 0 {
		t.Fatalf("Expected 0 rules, got %d", len(rules))
	}
}

func TestRuleRepoUpdate(t *testing.T) {
	cleanup := repoSetupDB(t)
	defer cleanup()

	userRepo := &UserRepository{}
	user := createUser(t, "rule-update@test.com")
	userRepo.Create(context.Background(), user)

	repo := &RuleRepository{}
	rule := &model.Rule{
		ID:               uuid.New().String(),
		CreatedBy:        user.ID,
		Name:             "Original Name",
		EncryptedPayload: "1|original-payload",
		Frequency:        "monthly",
		NextOccurrence:   time.Now().Add(7 * 24 * time.Hour),
		OccurrencesSoFar: 0,
		IsActive:         true,
		Status:           "active",
		CreatedAt:        time.Now(),
		UpdatedAt:        time.Now(),
	}

	err := repo.Create(context.Background(), rule)
	if err != nil {
		t.Fatalf("RuleRepo.Create failed: %v", err)
	}

	// Update the rule fields
	rule.Name = "Updated Name"
	rule.EncryptedPayload = "1|updated-payload"
	rule.Frequency = "weekly"
	err = repo.Update(context.Background(), rule)
	if err != nil {
		t.Fatalf("RuleRepo.Update failed: %v", err)
	}

	found, _ := repo.FindByID(context.Background(), rule.ID)
	if found == nil {
		t.Fatal("FindByID returned nil after update")
	}
	if found.Name != "Updated Name" {
		t.Fatalf("Expected name 'Updated Name', got %q", found.Name)
	}
	if found.EncryptedPayload != "1|updated-payload" {
		t.Fatalf("Expected payload '1|updated-payload', got %q", found.EncryptedPayload)
	}
	if found.Frequency != "weekly" {
		t.Fatalf("Expected frequency 'weekly', got %q", found.Frequency)
	}
}

func TestRuleRepoDelete(t *testing.T) {
	cleanup := repoSetupDB(t)
	defer cleanup()

	userRepo := &UserRepository{}
	user := createUser(t, "rule-delete@test.com")
	userRepo.Create(context.Background(), user)

	repo := &RuleRepository{}
	rule := &model.Rule{
		ID:               uuid.New().String(),
		CreatedBy:        user.ID,
		Name:             "Delete Me",
		EncryptedPayload: "1|delete-payload",
		Frequency:        "yearly",
		NextOccurrence:   time.Now().Add(365 * 24 * time.Hour),
		OccurrencesSoFar: 0,
		IsActive:         true,
		Status:           "active",
		CreatedAt:        time.Now(),
		UpdatedAt:        time.Now(),
	}

	err := repo.Create(context.Background(), rule)
	if err != nil {
		t.Fatalf("RuleRepo.Create failed: %v", err)
	}

	err = repo.Delete(context.Background(), rule.ID)
	if err != nil {
		t.Fatalf("Delete failed: %v", err)
	}

	found, err := repo.FindByID(context.Background(), rule.ID)
	if err != nil {
		t.Fatalf("FindByID after delete failed: %v", err)
	}
	if found != nil {
		t.Fatal("FindByID should return nil after delete")
	}
}

func TestRuleRepoFindDueRules(t *testing.T) {
	cleanup := repoSetupDB(t)
	defer cleanup()

	userRepo := &UserRepository{}
	user := createUser(t, "rule-due@test.com")
	userRepo.Create(context.Background(), user)

	repo := &RuleRepository{}
	rule := &model.Rule{
		ID:               uuid.New().String(),
		CreatedBy:        user.ID,
		Name:             "Due Rule",
		EncryptedPayload: "1|due-payload",
		Frequency:        "daily",
		NextOccurrence:   time.Now().Add(-1 * time.Hour), // past, should be due
		OccurrencesSoFar: 0,
		IsActive:         true,
		Status:           "active",
		CreatedAt:        time.Now(),
		UpdatedAt:        time.Now(),
	}

	err := repo.Create(context.Background(), rule)
	if err != nil {
		t.Fatalf("RuleRepo.Create failed: %v", err)
	}

	dueRules, err := repo.FindDueRules(context.Background(), time.Now())
	if err != nil {
		t.Fatalf("FindDueRules failed: %v", err)
	}
	if len(dueRules) != 1 {
		t.Fatalf("Expected 1 due rule, got %d", len(dueRules))
	}
	if dueRules[0].ID != rule.ID {
		t.Fatalf("Expected rule ID %q, got %q", rule.ID, dueRules[0].ID)
	}
}

func TestRuleRepoFindDueRules_NotDue(t *testing.T) {
	cleanup := repoSetupDB(t)
	defer cleanup()

	userRepo := &UserRepository{}
	user := createUser(t, "rule-not-due@test.com")
	userRepo.Create(context.Background(), user)

	repo := &RuleRepository{}
	rule := &model.Rule{
		ID:               uuid.New().String(),
		CreatedBy:        user.ID,
		Name:             "Not Due Rule",
		EncryptedPayload: "1|not-due-payload",
		Frequency:        "monthly",
		NextOccurrence:   time.Now().Add(7 * 24 * time.Hour), // future, should not be due
		OccurrencesSoFar: 0,
		IsActive:         true,
		Status:           "active",
		CreatedAt:        time.Now(),
		UpdatedAt:        time.Now(),
	}

	err := repo.Create(context.Background(), rule)
	if err != nil {
		t.Fatalf("RuleRepo.Create failed: %v", err)
	}

	dueRules, err := repo.FindDueRules(context.Background(), time.Now())
	if err != nil {
		t.Fatalf("FindDueRules failed: %v", err)
	}
	if len(dueRules) != 0 {
		t.Fatalf("Expected 0 due rules, got %d", len(dueRules))
	}
}

func TestRuleRepoUpdateStatus(t *testing.T) {
	cleanup := repoSetupDB(t)
	defer cleanup()

	userRepo := &UserRepository{}
	user := createUser(t, "rule-upd-status@test.com")
	userRepo.Create(context.Background(), user)

	repo := &RuleRepository{}
	rule := &model.Rule{
		ID:               uuid.New().String(),
		CreatedBy:        user.ID,
		Name:             "Status Rule",
		EncryptedPayload: "1|status-payload",
		Frequency:        "weekly",
		NextOccurrence:   time.Now().Add(7 * 24 * time.Hour),
		OccurrencesSoFar: 0,
		IsActive:         true,
		Status:           "pending_accepted",
		CreatedAt:        time.Now(),
		UpdatedAt:        time.Now(),
	}

	err := repo.Create(context.Background(), rule)
	if err != nil {
		t.Fatalf("RuleRepo.Create failed: %v", err)
	}

	err = repo.UpdateStatus(context.Background(), rule.ID, "active")
	if err != nil {
		t.Fatalf("UpdateStatus failed: %v", err)
	}

	found, _ := repo.FindByID(context.Background(), rule.ID)
	if found == nil {
		t.Fatal("FindByID returned nil after status update")
	}
	if found.Status != "active" {
		t.Fatalf("Expected status 'active', got %q", found.Status)
	}
}

func TestRuleRepoUpdateTargetAccountEncrypted(t *testing.T) {
	cleanup := repoSetupDB(t)
	defer cleanup()

	userRepo := &UserRepository{}
	user := createUser(t, "rule-upd-target@test.com")
	userRepo.Create(context.Background(), user)

	repo := &RuleRepository{}
	rule := &model.Rule{
		ID:               uuid.New().String(),
		CreatedBy:        user.ID,
		Name:             "Target Rule",
		EncryptedPayload: "1|target-payload",
		Frequency:        "monthly",
		NextOccurrence:   time.Now().Add(30 * 24 * time.Hour),
		OccurrencesSoFar: 0,
		IsActive:         true,
		Status:           "pending_accepted",
		CreatedAt:        time.Now(),
		UpdatedAt:        time.Now(),
	}

	err := repo.Create(context.Background(), rule)
	if err != nil {
		t.Fatalf("RuleRepo.Create failed: %v", err)
	}

	encrypted := "1|encrypted-account-data"
	err = repo.UpdateTargetAccountEncrypted(context.Background(), rule.ID, encrypted)
	if err != nil {
		t.Fatalf("UpdateTargetAccountEncrypted failed: %v", err)
	}

	found, _ := repo.FindByID(context.Background(), rule.ID)
	if found == nil {
		t.Fatal("FindByID returned nil after target update")
	}
	if found.TargetAccountEncrypted == nil {
		t.Fatal("TargetAccountEncrypted should not be nil after update")
	}
	if *found.TargetAccountEncrypted != encrypted {
		t.Fatalf("Expected TargetAccountEncrypted %q, got %q", encrypted, *found.TargetAccountEncrypted)
	}
}
