package service

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"testing"
	"time"

	"budgeteer-backend/internal/crypto"
	"budgeteer-backend/internal/database"
	"budgeteer-backend/internal/model"
	"budgeteer-backend/internal/repository"

	"github.com/google/uuid"
)

func setupRuleDB(t *testing.T) context.CancelFunc {
	t.Helper()
	cleanup := setupTestDB(t)

	ctx := context.Background()

	// Migration 0002: name column
	database.Pool.Exec(ctx, `ALTER TABLE accounts ADD COLUMN IF NOT EXISTS name VARCHAR(255) NOT NULL DEFAULT ''`)

	// Migration 0007: rules table + balance on accounts
	database.Pool.Exec(ctx, `ALTER TABLE accounts ADD COLUMN IF NOT EXISTS balance BIGINT NOT NULL DEFAULT 0`)
	database.Pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS rules (
			id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
			created_by           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			name                 VARCHAR(255) NOT NULL,
			encrypted_payload    TEXT NOT NULL,
			frequency            VARCHAR(20) NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly', 'yearly')),
			next_occurrence      TIMESTAMPTZ NOT NULL,
			end_date             TIMESTAMPTZ,
			max_occurrences      INT,
			occurrences_so_far   INT NOT NULL DEFAULT 0,
			last_triggered_at    TIMESTAMPTZ,
			is_active            BOOLEAN NOT NULL DEFAULT TRUE,
			created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)
	`)

	// Migration 0008: invitation-related columns on rules
	database.Pool.Exec(ctx, `ALTER TABLE rules ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active'`)
	database.Pool.Exec(ctx, `ALTER TABLE rules ADD COLUMN IF NOT EXISTS target_email VARCHAR(255)`)
	database.Pool.Exec(ctx, `ALTER TABLE rules ADD COLUMN IF NOT EXISTS target_account_encrypted TEXT`)
	database.Pool.Exec(ctx, `ALTER TABLE account_users ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active'`)

	// Notifications table
	database.Pool.Exec(ctx, `
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

	// Invitations table
	database.Pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS invitations (
			id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
			entity_type     VARCHAR(20) NOT NULL CHECK (entity_type IN ('rule', 'account')),
			entity_id       UUID NOT NULL,
			invited_by      UUID NOT NULL REFERENCES users(id),
			invited_email   VARCHAR(255) NOT NULL,
			invited_user_id UUID REFERENCES users(id),
			encrypted_data  TEXT,
			status          VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
			created_at      TIMESTAMPTZ DEFAULT NOW(),
			expires_at      TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 days'
		)
	`)

	return cleanup
}

// initRuleServiceWithKeys sets up the Rules service with a real server keypair.
func initRuleServiceWithKeys(t *testing.T) (privKey, pubKey []byte) {
	t.Helper()
	privKey, pubKey, err := crypto.GenerateServerKeypair()
	if err != nil {
		t.Fatalf("GenerateServerKeypair failed: %v", err)
	}
	Rules = &RuleService{
		RuleRepo:         &repository.RuleRepository{},
		ServerPrivateKey: privKey,
		ServerPublicKey:  pubKey,
	}
	return privKey, pubKey
}

// encryptRulePayload encrypts a RulePayload for the tests.
func encryptRulePayload(t *testing.T, pubKey []byte, payload *model.RulePayload) string {
	t.Helper()
	data, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("Marshal rule payload failed: %v", err)
	}
	encrypted, err := crypto.EncryptWithPublicKey(data, pubKey)
	if err != nil {
		t.Fatalf("EncryptWithPublicKey failed: %v", err)
	}
	return encrypted
}

func TestComputeNextOccurrence(t *testing.T) {
	base := time.Date(2024, 1, 15, 10, 0, 0, 0, time.UTC)

	tests := []struct {
		frequency string
		from      time.Time
		expected  time.Time
	}{
		{"daily", base, base.AddDate(0, 0, 1)},
		{"weekly", base, base.AddDate(0, 0, 7)},
		{"monthly", base, base.AddDate(0, 1, 0)},
		{"yearly", base, base.AddDate(1, 0, 0)},
	}

	for _, tt := range tests {
		result := computeNextOccurrence(tt.frequency, tt.from)
		if !result.Equal(tt.expected) {
			t.Errorf("computeNextOccurrence(%q, %v) = %v, want %v",
				tt.frequency, tt.from, result, tt.expected)
		}
	}
}

func TestRuleServiceCreateRule_Payment(t *testing.T) {
	cleanup := setupRuleDB(t)
	defer cleanup()

	_, pubKey := initRuleServiceWithKeys(t)

	user, _, _ := createTestUser(t, "rule-create-payment@test.com")

	payload := encryptRulePayload(t, pubKey, &model.RulePayload{
		Type:            "payment",
		Amount:          100.00,
		SourceAccountID: "acct-1",
		CategoryID:      "cat-1",
		Notes:           "Test payment",
		Counterparty:    "Vendor",
	})

	req := &model.CreateRuleRequest{
		Name:             "Test Payment Rule",
		EncryptedPayload: payload,
		Frequency:        "monthly",
		NextOccurrence:   time.Now().UTC().Add(24 * time.Hour).Format(time.RFC3339),
	}

	rule, err := Rules.CreateRule(context.Background(), user.ID, req)
	if err != nil {
		t.Fatalf("CreateRule failed: %v", err)
	}
	if rule == nil {
		t.Fatal("CreateRule returned nil")
	}
	if rule.Name != "Test Payment Rule" {
		t.Fatalf("Expected name 'Test Payment Rule', got %s", rule.Name)
	}
	if rule.Frequency != "monthly" {
		t.Fatalf("Expected frequency 'monthly', got %s", rule.Frequency)
	}
	if rule.Status != "active" {
		t.Fatalf("Expected status 'active' for payment rule, got %s", rule.Status)
	}
	if rule.CreatedBy != user.ID {
		t.Fatalf("Expected created_by %s, got %s", user.ID, rule.CreatedBy)
	}
	if rule.EncryptedPayload != payload {
		t.Fatal("EncryptedPayload mismatch")
	}
}

func TestRuleServiceCreateRule_UserTransfer(t *testing.T) {
	cleanup := setupRuleDB(t)
	defer cleanup()

	privKey, pubKey := initRuleServiceWithKeys(t)

	// Initialize invitation service with same keys
	InitInvitationServiceWithKeys(privKey, pubKey)

	user, _, _ := createTestUser(t, "rule-create-ut@test.com")
	target, _, _ := createTestUser(t, "rule-create-ut-target@test.com")

	payload := encryptRulePayload(t, pubKey, &model.RulePayload{
		Type:            "user_transfer",
		Amount:          50.00,
		SourceAccountID: "acct-1",
		TargetAccountID: "acct-2",
	})

	req := &model.CreateRuleRequest{
		Name:             "Test User Transfer",
		EncryptedPayload: payload,
		Frequency:        "weekly",
		NextOccurrence:   time.Now().UTC().Add(24 * time.Hour).Format(time.RFC3339),
		TargetEmail:      target.Email,
	}

	rule, err := Rules.CreateRule(context.Background(), user.ID, req)
	if err != nil {
		t.Fatalf("CreateRule user_transfer failed: %v", err)
	}
	if rule.Status != "pending_accepted" {
		t.Fatalf("Expected status 'pending_accepted', got %s", rule.Status)
	}
	if rule.TargetEmail == nil || *rule.TargetEmail != target.Email {
		t.Fatalf("Expected TargetEmail %s, got %v", target.Email, rule.TargetEmail)
	}

	// Verify invitation was created
	invRepo := &repository.InvitationRepository{}
	invs, err := invRepo.FindPendingByUserID(context.Background(), target.ID)
	if err != nil {
		t.Fatalf("FindPendingByUserID failed: %v", err)
	}
	if len(invs) != 1 {
		t.Fatalf("Expected 1 invitation for target user, got %d", len(invs))
	}
	if invs[0].EntityType != "rule" {
		t.Fatalf("Expected entity_type=rule, got %s", invs[0].EntityType)
	}
}

func TestRuleServiceCreateRule_TargetEmailWithoutUserTransfer(t *testing.T) {
	cleanup := setupRuleDB(t)
	defer cleanup()

	_, pubKey := initRuleServiceWithKeys(t)

	user, _, _ := createTestUser(t, "rule-create-bad-email@test.com")

	// Payment payload (not user_transfer) but with target_email set
	payload := encryptRulePayload(t, pubKey, &model.RulePayload{
		Type:            "payment",
		Amount:          100.00,
		SourceAccountID: "acct-1",
	})

	req := &model.CreateRuleRequest{
		Name:             "Bad Rule",
		EncryptedPayload: payload,
		Frequency:        "monthly",
		NextOccurrence:   time.Now().UTC().Add(24 * time.Hour).Format(time.RFC3339),
		TargetEmail:      "someone@test.com",
	}

	_, err := Rules.CreateRule(context.Background(), user.ID, req)
	if err == nil {
		t.Fatal("Expected error for target_email on non-user_transfer rule")
	}
}

func TestRuleServiceListRules(t *testing.T) {
	cleanup := setupRuleDB(t)
	defer cleanup()

	_, pubKey := initRuleServiceWithKeys(t)

	user, _, _ := createTestUser(t, "rule-list@test.com")

	payload := encryptRulePayload(t, pubKey, &model.RulePayload{
		Type:            "payment",
		Amount:          100.00,
		SourceAccountID: "acct-1",
	})

	// Create 2 rules
	req1 := &model.CreateRuleRequest{
		Name:             "Rule One",
		EncryptedPayload: payload,
		Frequency:        "monthly",
		NextOccurrence:   time.Now().UTC().Add(24 * time.Hour).Format(time.RFC3339),
	}
	req2 := &model.CreateRuleRequest{
		Name:             "Rule Two",
		EncryptedPayload: payload,
		Frequency:        "weekly",
		NextOccurrence:   time.Now().UTC().Add(48 * time.Hour).Format(time.RFC3339),
	}

	_, err := Rules.CreateRule(context.Background(), user.ID, req1)
	if err != nil {
		t.Fatalf("CreateRule 1 failed: %v", err)
	}
	_, err = Rules.CreateRule(context.Background(), user.ID, req2)
	if err != nil {
		t.Fatalf("CreateRule 2 failed: %v", err)
	}

	rules, err := Rules.ListRules(context.Background(), user.ID)
	if err != nil {
		t.Fatalf("ListRules failed: %v", err)
	}
	if len(rules) != 2 {
		t.Fatalf("Expected 2 rules, got %d", len(rules))
	}
}

func TestRuleServiceUpdateRule(t *testing.T) {
	cleanup := setupRuleDB(t)
	defer cleanup()

	_, pubKey := initRuleServiceWithKeys(t)

	user, _, _ := createTestUser(t, "rule-update@test.com")

	payload := encryptRulePayload(t, pubKey, &model.RulePayload{
		Type:            "payment",
		Amount:          100.00,
		SourceAccountID: "acct-1",
	})

	req := &model.CreateRuleRequest{
		Name:             "Original Name",
		EncryptedPayload: payload,
		Frequency:        "monthly",
		NextOccurrence:   time.Now().UTC().Add(24 * time.Hour).Format(time.RFC3339),
	}

	rule, err := Rules.CreateRule(context.Background(), user.ID, req)
	if err != nil {
		t.Fatalf("CreateRule failed: %v", err)
	}

	newName := "Updated Name"
	newPayload := encryptRulePayload(t, pubKey, &model.RulePayload{
		Type:            "payment",
		Amount:          200.00,
		SourceAccountID: "acct-1",
	})
	freq := "weekly"

	updated, err := Rules.UpdateRule(context.Background(), rule.ID, user.ID, &model.UpdateRuleRequest{
		Name:             &newName,
		EncryptedPayload: &newPayload,
		Frequency:        &freq,
	})
	if err != nil {
		t.Fatalf("UpdateRule failed: %v", err)
	}
	if updated.Name != newName {
		t.Fatalf("Expected name %s, got %s", newName, updated.Name)
	}
	if updated.EncryptedPayload != newPayload {
		t.Fatal("EncryptedPayload not updated")
	}
	if updated.Frequency != freq {
		t.Fatalf("Expected frequency %s, got %s", freq, updated.Frequency)
	}
}

func TestRuleServiceUpdateRule_NotFound(t *testing.T) {
	cleanup := setupRuleDB(t)
	defer cleanup()

	initRuleServiceWithKeys(t)

	user, _, _ := createTestUser(t, "rule-update-notfound@test.com")
	name := "New Name"

	_, err := Rules.UpdateRule(context.Background(), uuid.New().String(), user.ID, &model.UpdateRuleRequest{
		Name: &name,
	})
	if err == nil {
		t.Fatal("Expected error when updating non-existent rule")
	}
}

func TestRuleServiceDeleteRule(t *testing.T) {
	cleanup := setupRuleDB(t)
	defer cleanup()

	_, pubKey := initRuleServiceWithKeys(t)

	user, _, _ := createTestUser(t, "rule-delete@test.com")

	payload := encryptRulePayload(t, pubKey, &model.RulePayload{
		Type:            "payment",
		Amount:          100.00,
		SourceAccountID: "acct-1",
	})

	req := &model.CreateRuleRequest{
		Name:             "To Delete",
		EncryptedPayload: payload,
		Frequency:        "monthly",
		NextOccurrence:   time.Now().UTC().Add(24 * time.Hour).Format(time.RFC3339),
	}

	rule, err := Rules.CreateRule(context.Background(), user.ID, req)
	if err != nil {
		t.Fatalf("CreateRule failed: %v", err)
	}

	err = Rules.DeleteRule(context.Background(), rule.ID, user.ID)
	if err != nil {
		t.Fatalf("DeleteRule failed: %v", err)
	}

	// Verify rule is gone
	ruleRepo := &repository.RuleRepository{}
	found, err := ruleRepo.FindByID(context.Background(), rule.ID)
	if err != nil {
		t.Fatalf("FindByID failed: %v", err)
	}
	if found != nil {
		t.Fatal("Rule should have been deleted")
	}
}

func TestRuleServiceDeleteRule_Unauthorized(t *testing.T) {
	cleanup := setupRuleDB(t)
	defer cleanup()

	_, pubKey := initRuleServiceWithKeys(t)

	owner, _, _ := createTestUser(t, "rule-del-owner@test.com")
	other, _, _ := createTestUser(t, "rule-del-other@test.com")

	payload := encryptRulePayload(t, pubKey, &model.RulePayload{
		Type:            "payment",
		Amount:          100.00,
		SourceAccountID: "acct-1",
	})

	req := &model.CreateRuleRequest{
		Name:             "Owner's Rule",
		EncryptedPayload: payload,
		Frequency:        "monthly",
		NextOccurrence:   time.Now().UTC().Add(24 * time.Hour).Format(time.RFC3339),
	}

	rule, err := Rules.CreateRule(context.Background(), owner.ID, req)
	if err != nil {
		t.Fatalf("CreateRule failed: %v", err)
	}

	err = Rules.DeleteRule(context.Background(), rule.ID, other.ID)
	if err == nil {
		t.Fatal("Expected unauthorized error when other user deletes rule")
	}
}

func TestRuleServiceDeleteRule_NotFound(t *testing.T) {
	cleanup := setupRuleDB(t)
	defer cleanup()

	initRuleServiceWithKeys(t)

	user, _, _ := createTestUser(t, "rule-del-notfound@test.com")

	err := Rules.DeleteRule(context.Background(), uuid.New().String(), user.ID)
	if err == nil {
		t.Fatal("Expected error when deleting non-existent rule")
	}
}

func TestRuleServiceProcessDueRules_Payment(t *testing.T) {
	cleanup := setupRuleDB(t)
	defer cleanup()

	_, pubKey := initRuleServiceWithKeys(t)

	ctx := context.Background()

	user, _, _ := createTestUser(t, "rule-process@test.com")

	// Give the user a valid X25519 public key (base64-encoded)
	_, userPubKey, err := crypto.GenerateServerKeypair()
	if err != nil {
		t.Fatalf("Generate user keypair failed: %v", err)
	}
	userPubKeyB64 := base64.StdEncoding.EncodeToString(userPubKey)
	_, err = database.Pool.Exec(ctx, `UPDATE users SET public_key = $1 WHERE id = $2`, userPubKeyB64, user.ID)
	if err != nil {
		t.Fatalf("Update user public key failed: %v", err)
	}

	// Create an account with a sufficient balance
	accountID := uuid.New().String()
	_, err = database.Pool.Exec(ctx, `
		INSERT INTO accounts (id, currency, type, created_by, created_at, updated_at, balance)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`, accountID, "USD", "personal", user.ID, time.Now(), time.Now(), 100000) // $1000.00 in cents
	if err != nil {
		t.Fatalf("Insert account failed: %v", err)
	}

	// Add account_user relationship
	_, err = database.Pool.Exec(ctx, `
		INSERT INTO account_users (account_id, user_id, encrypted_account_key, role, status, joined_at)
		VALUES ($1, $2, $3, $4, $5, $6)
	`, accountID, user.ID, "test-key", "owner", "active", time.Now())
	if err != nil {
		t.Fatalf("Insert account_user failed: %v", err)
	}

	// Create an encrypted rule payload
	paymentAmount := 25.00 // $25.00
	payload := encryptRulePayload(t, pubKey, &model.RulePayload{
		Type:            "payment",
		Amount:          paymentAmount,
		SourceAccountID: accountID,
		CategoryID:      "cat-1",
		Notes:           "Rule-generated payment",
		Counterparty:    "Auto Vendor",
	})

	// Insert the rule with a past next_occurrence so it's due
	ruleID := uuid.New().String()
	pastTime := time.Now().UTC().Add(-1 * time.Hour)
	now := time.Now().UTC()
	_, err = database.Pool.Exec(ctx, `
		INSERT INTO rules (id, created_by, name, encrypted_payload, frequency, next_occurrence, occurrences_so_far, is_active, status, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, 0, true, 'active', $7, $7)
	`, ruleID, user.ID, "Auto Payment", payload, "monthly", pastTime, now)
	if err != nil {
		t.Fatalf("Insert rule failed: %v", err)
	}

	// Process due rules
	Rules.ProcessDueRules(ctx)

	// Verify transaction was created
	var txCount int
	err = database.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM transactions WHERE account_id = $1 AND created_by = $2`,
		accountID, user.ID).Scan(&txCount)
	if err != nil {
		t.Fatalf("Count transactions failed: %v", err)
	}
	if txCount != 1 {
		t.Fatalf("Expected 1 transaction, got %d", txCount)
	}

	// Verify balance was decreased
	var newBalance int64
	err = database.Pool.QueryRow(ctx,
		`SELECT balance FROM accounts WHERE id = $1`, accountID).Scan(&newBalance)
	if err != nil {
		t.Fatalf("Get balance failed: %v", err)
	}
	expectedBalance := int64(100000 - int64(paymentAmount*100)) // $1000 - $25 = $975 in cents
	if newBalance != expectedBalance {
		t.Fatalf("Expected balance %d, got %d", expectedBalance, newBalance)
	}

	// Verify next_occurrence was updated
	ruleRepo := &repository.RuleRepository{}
	rule, err := ruleRepo.FindByID(ctx, ruleID)
	if err != nil {
		t.Fatalf("FindByID rule failed: %v", err)
	}
	if rule.NextOccurrence.Before(pastTime) || !rule.NextOccurrence.After(pastTime) {
		t.Fatal("NextOccurrence should have advanced")
	}
	if rule.OccurrencesSoFar != 1 {
		t.Fatalf("Expected occurrences_so_far=1, got %d", rule.OccurrencesSoFar)
	}
}

func TestRuleServiceProcessDueRules_LowStoredBalanceProceeds(t *testing.T) {
	cleanup := setupRuleDB(t)
	defer cleanup()

	_, pubKey := initRuleServiceWithKeys(t)

	ctx := context.Background()

	user, _, _ := createTestUser(t, "rule-lowbalance@test.com")

	// Give the user a public key
	_, userPubKey, err := crypto.GenerateServerKeypair()
	if err != nil {
		t.Fatalf("Generate user keypair failed: %v", err)
	}
	userPubKeyB64 := base64.StdEncoding.EncodeToString(userPubKey)
	_, err = database.Pool.Exec(ctx, `UPDATE users SET public_key = $1 WHERE id = $2`, userPubKeyB64, user.ID)
	if err != nil {
		t.Fatalf("Update user public key failed: %v", err)
	}

	// Create an account with very low stored balance (the real balance may
	// be in encrypted transactions the server can't see).
	accountID := uuid.New().String()
	_, err = database.Pool.Exec(ctx, `
		INSERT INTO accounts (id, currency, type, created_by, created_at, updated_at, balance)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`, accountID, "USD", "personal", user.ID, time.Now(), time.Now(), 100) // $1.00 in cents
	if err != nil {
		t.Fatalf("Insert account failed: %v", err)
	}
	_, err = database.Pool.Exec(ctx, `
		INSERT INTO account_users (account_id, user_id, encrypted_account_key, role, status, joined_at)
		VALUES ($1, $2, $3, $4, $5, $6)
	`, accountID, user.ID, "test-key", "owner", "active", time.Now())
	if err != nil {
		t.Fatalf("Insert account_user failed: %v", err)
	}

	// Create rule with amount higher than stored balance
	payload := encryptRulePayload(t, pubKey, &model.RulePayload{
		Type:            "payment",
		Amount:          50.00, // $50, but stored balance is only $1
		SourceAccountID: accountID,
	})

	pastTime := time.Now().UTC().Add(-1 * time.Hour)
	now := time.Now().UTC()
	_, err = database.Pool.Exec(ctx, `
		INSERT INTO rules (id, created_by, name, encrypted_payload, frequency, next_occurrence, occurrences_so_far, is_active, status, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, 0, true, 'active', $7, $7)
	`, uuid.New().String(), user.ID, "LowStoredBalance", payload, "monthly", pastTime, now)
	if err != nil {
		t.Fatalf("Insert rule failed: %v", err)
	}

	// ProcessDueRules should warn about low stored balance but still proceed
	Rules.ProcessDueRules(ctx)

	// Verify a transaction WAS created (the rule proceeds despite low stored
	// balance because the real balance may be in encrypted transactions).
	var txCount int
	err = database.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM transactions WHERE account_id = $1`, accountID).Scan(&txCount)
	if err != nil {
		t.Fatalf("Count transactions failed: %v", err)
	}
	if txCount != 1 {
		t.Fatalf("Expected 1 transaction despite low stored balance, got %d", txCount)
	}
}

func TestRuleServiceProcessDueRules_NoMatchingRules(t *testing.T) {
	cleanup := setupRuleDB(t)
	defer cleanup()

	initRuleServiceWithKeys(t)

	// Process due rules with nothing in the database should not error
	Rules.ProcessDueRules(context.Background())
	// If we get here without a panic, the test passes
}

func TestRuleServiceCreateRule_InvalidPayload(t *testing.T) {
	cleanup := setupRuleDB(t)
	defer cleanup()

	initRuleServiceWithKeys(t)

	user, _, _ := createTestUser(t, "rule-inv-payload@test.com")

	// Create a payload that will fail at the crypto level (invalid format)
	req := &model.CreateRuleRequest{
		Name:             "Bad Payload",
		EncryptedPayload: "not-valid-ecies-format",
		Frequency:        "monthly",
		NextOccurrence:   time.Now().UTC().Add(24 * time.Hour).Format(time.RFC3339),
	}

	// CreateRule should succeed at the service level (the payload is just stored as-is)
	// because CreateRule doesn't validate the encrypted payload format
	rule, err := Rules.CreateRule(context.Background(), user.ID, req)
	if err != nil {
		t.Fatalf("CreateRule with invalid payload should succeed (stored as-is): %v", err)
	}
	if rule.EncryptedPayload != "not-valid-ecies-format" {
		t.Fatal("Payload should be stored as-is")
	}
}

func TestRuleServiceCreateRule_InvalidNextOccurrence(t *testing.T) {
	cleanup := setupRuleDB(t)
	defer cleanup()

	_, pubKey := initRuleServiceWithKeys(t)

	user, _, _ := createTestUser(t, "rule-inv-occ@test.com")

	payload := encryptRulePayload(t, pubKey, &model.RulePayload{
		Type:            "payment",
		Amount:          100.00,
		SourceAccountID: "acct-1",
	})

	req := &model.CreateRuleRequest{
		Name:             "Bad Occurrence",
		EncryptedPayload: payload,
		Frequency:        "monthly",
		NextOccurrence:   "not-a-valid-time",
	}

	_, err := Rules.CreateRule(context.Background(), user.ID, req)
	if err == nil {
		t.Fatal("Expected error for invalid next_occurrence")
	}
}

func TestRuleServiceUpdateRule_Unauthorized(t *testing.T) {
	cleanup := setupRuleDB(t)
	defer cleanup()

	_, pubKey := initRuleServiceWithKeys(t)

	owner, _, _ := createTestUser(t, "rule-upd-owner@test.com")
	other, _, _ := createTestUser(t, "rule-upd-other@test.com")

	payload := encryptRulePayload(t, pubKey, &model.RulePayload{
		Type:            "payment",
		Amount:          100.00,
		SourceAccountID: "acct-1",
	})

	req := &model.CreateRuleRequest{
		Name:             "Owner's Rule",
		EncryptedPayload: payload,
		Frequency:        "monthly",
		NextOccurrence:   time.Now().UTC().Add(24 * time.Hour).Format(time.RFC3339),
	}

	rule, err := Rules.CreateRule(context.Background(), owner.ID, req)
	if err != nil {
		t.Fatalf("CreateRule failed: %v", err)
	}

	name := "Should Not Work"
	_, err = Rules.UpdateRule(context.Background(), rule.ID, other.ID, &model.UpdateRuleRequest{
		Name: &name,
	})
	if err == nil {
		t.Fatal("Expected unauthorized error when other user updates rule")
	}
}

func TestRuleServiceServerPublicKeyString(t *testing.T) {
	cleanup := setupRuleDB(t)
	defer cleanup()

	_, pubKey := initRuleServiceWithKeys(t)

	pubKeyStr := Rules.ServerPublicKeyString()
	expected := base64.StdEncoding.EncodeToString(pubKey)
	if pubKeyStr != expected {
		t.Fatalf("ServerPublicKeyString mismatch: got %s, want %s", pubKeyStr, expected)
	}
}

func TestRuleServiceProcessDueRules_MaxOccurrences(t *testing.T) {
	cleanup := setupRuleDB(t)
	defer cleanup()

	_, pubKey := initRuleServiceWithKeys(t)

	ctx := context.Background()

	user, _, _ := createTestUser(t, "rule-max-occ@test.com")

	// Give the user a public key
	_, userPubKey, err := crypto.GenerateServerKeypair()
	if err != nil {
		t.Fatalf("Generate user keypair failed: %v", err)
	}
	userPubKeyB64 := base64.StdEncoding.EncodeToString(userPubKey)
	_, err = database.Pool.Exec(ctx, `UPDATE users SET public_key = $1 WHERE id = $2`, userPubKeyB64, user.ID)
	if err != nil {
		t.Fatalf("Update user public key failed: %v", err)
	}

	// Create an account with sufficient balance
	accountID := uuid.New().String()
	_, err = database.Pool.Exec(ctx, `
		INSERT INTO accounts (id, currency, type, created_by, created_at, updated_at, balance)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`, accountID, "USD", "personal", user.ID, time.Now(), time.Now(), 50000) // $500
	if err != nil {
		t.Fatalf("Insert account failed: %v", err)
	}
	_, err = database.Pool.Exec(ctx, `
		INSERT INTO account_users (account_id, user_id, encrypted_account_key, role, status, joined_at)
		VALUES ($1, $2, $3, $4, $5, $6)
	`, accountID, user.ID, "test-key", "owner", "active", time.Now())
	if err != nil {
		t.Fatalf("Insert account_user failed: %v", err)
	}

	// Set max_occurrences to 1, and set occurrences_so_far to 0
	maxOcc := 1
	payload := encryptRulePayload(t, pubKey, &model.RulePayload{
		Type:            "payment",
		Amount:          10.00,
		SourceAccountID: accountID,
	})

	ruleID := uuid.New().String()
	pastTime := time.Now().UTC().Add(-1 * time.Hour)
	now := time.Now().UTC()
	_, err = database.Pool.Exec(ctx, `
		INSERT INTO rules (id, created_by, name, encrypted_payload, frequency, next_occurrence, max_occurrences, occurrences_so_far, is_active, status, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, 0, true, 'active', $8, $8)
	`, ruleID, user.ID, "Max Occ Rule", payload, "monthly", pastTime, maxOcc, now)
	if err != nil {
		t.Fatalf("Insert rule failed: %v", err)
	}

	// Process due rules
	Rules.ProcessDueRules(ctx)

	// Verify rule is now inactive
	ruleRepo := &repository.RuleRepository{}
	rule, err := ruleRepo.FindByID(ctx, ruleID)
	if err != nil {
		t.Fatalf("FindByID failed: %v", err)
	}
	if rule.IsActive {
		t.Fatal("Expected rule to be deactivated after reaching max_occurrences")
	}
}
