package service

import (
	"context"
	"encoding/base64"
	"testing"
	"time"

	"budgeteer-backend/internal/crypto"
	"budgeteer-backend/internal/database"
	"budgeteer-backend/internal/model"
	"budgeteer-backend/internal/repository"

	"github.com/google/uuid"
)

func setupInvitationDB(t *testing.T) context.CancelFunc {
	t.Helper()
	cleanup := setupTestDB(t)

	ctx := context.Background()

	// Migration 0002: name column (IF NOT EXISTS makes it safe even if already present)
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
	database.Pool.Exec(ctx, `CREATE INDEX IF NOT EXISTS idx_rules_owner ON rules (created_by)`)
	database.Pool.Exec(ctx, `CREATE INDEX IF NOT EXISTS idx_rules_due ON rules (next_occurrence) WHERE is_active = TRUE`)

	// Migration 0008: invitation system
	// Rules columns
	database.Pool.Exec(ctx, `ALTER TABLE rules ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active'`)
	database.Pool.Exec(ctx, `ALTER TABLE rules ADD COLUMN IF NOT EXISTS target_email VARCHAR(255)`)
	database.Pool.Exec(ctx, `ALTER TABLE rules ADD COLUMN IF NOT EXISTS target_account_encrypted TEXT`)

	// Account users status column
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

func TestInvitationServiceCreateRuleInvitation(t *testing.T) {
	cleanup := setupInvitationDB(t)
	defer cleanup()
	InitInvitationService()

	ctx := context.Background()

	inviter, _, _ := createTestUser(t, "inv-rule-inviter@test.com")
	target, _, _ := createTestUser(t, "inv-rule-target@test.com")
	ruleID := uuid.New().String()

	err := Invitations.CreateRuleInvitation(ctx, ruleID, inviter.ID, target.Email)
	if err != nil {
		t.Fatalf("CreateRuleInvitation failed: %v", err)
	}

	// Verify invitation exists in DB
	invRepo := &repository.InvitationRepository{}
	invs, err := invRepo.FindPendingByUserID(ctx, target.ID)
	if err != nil {
		t.Fatalf("FindPendingByUserID failed: %v", err)
	}
	if len(invs) != 1 {
		t.Fatalf("Expected 1 pending invitation, got %d", len(invs))
	}
	if invs[0].EntityType != "rule" {
		t.Fatalf("Expected entity_type=rule, got %s", invs[0].EntityType)
	}
	if invs[0].EntityID != ruleID {
		t.Fatalf("Expected entity_id=%s, got %s", ruleID, invs[0].EntityID)
	}
	if invs[0].Status != "pending" {
		t.Fatalf("Expected status=pending, got %s", invs[0].Status)
	}

	// Verify notification was created
	notifRepo := &repository.NotificationRepository{}
	notifs, err := notifRepo.ListByUserID(ctx, target.ID, 10, 0)
	if err != nil {
		t.Fatalf("ListByUserID failed: %v", err)
	}
	if len(notifs) < 1 {
		t.Fatal("Expected at least 1 notification for target user")
	}
	if notifs[0].Type != "rule_invitation" {
		t.Fatalf("Expected notification type=rule_invitation, got %s", notifs[0].Type)
	}

	// Verify email was queued
	var emailCount int
	err = database.Pool.QueryRow(ctx, `SELECT COUNT(*) FROM email_outbox WHERE to_address = $1`, target.Email).Scan(&emailCount)
	if err != nil {
		t.Fatalf("Count email_outbox failed: %v", err)
	}
	if emailCount < 1 {
		t.Fatal("Expected at least 1 email queued for target user")
	}
}

func TestInvitationServiceCreateRuleInvitation_UnknownUser(t *testing.T) {
	cleanup := setupInvitationDB(t)
	defer cleanup()
	InitInvitationService()

	ctx := context.Background()

	inviter, _, _ := createTestUser(t, "inv-rule-unknown@test.com")
	unknownEmail := "nonexistent@test.com"
	ruleID := uuid.New().String()

	err := Invitations.CreateRuleInvitation(ctx, ruleID, inviter.ID, unknownEmail)
	if err != nil {
		t.Fatalf("CreateRuleInvitation for unknown user should succeed (subscription email): %v", err)
	}

	// Verify invitation was created
	invRepo := &repository.InvitationRepository{}
	invs, err := invRepo.FindPendingByEmail(ctx, unknownEmail)
	if err != nil {
		t.Fatalf("FindPendingByEmail failed: %v", err)
	}
	if len(invs) != 1 {
		t.Fatalf("Expected 1 pending invitation by email, got %d", len(invs))
	}

	// Verify subscription email was queued (NOT the invitation email)
	var emailCount int
	err = database.Pool.QueryRow(ctx, `SELECT COUNT(*) FROM email_outbox WHERE to_address = $1`, unknownEmail).Scan(&emailCount)
	if err != nil {
		t.Fatalf("Count email_outbox failed: %v", err)
	}
	if emailCount < 1 {
		t.Fatal("Expected at least 1 subscription email queued for unknown user")
	}

	// Verify no user_id was linked (invited_user_id should be NULL)
	if invs[0].InvitedUserID != nil {
		t.Fatal("Expected invited_user_id to be nil for unknown user")
	}
}

func TestInvitationServiceCreateAccountInvitation(t *testing.T) {
	cleanup := setupInvitationDB(t)
	defer cleanup()
	InitInvitationService()

	ctx := context.Background()

	inviter, _, _ := createTestUser(t, "inv-acct-inviter@test.com")
	target, _, _ := createTestUser(t, "inv-acct-target@test.com")
	accountID := uuid.New().String()
	encryptedKey := "server-encrypted-account-key"

	err := Invitations.CreateAccountInvitation(ctx, accountID, inviter.ID, target.Email, encryptedKey)
	if err != nil {
		t.Fatalf("CreateAccountInvitation failed: %v", err)
	}

	// Verify invitation exists
	invRepo := &repository.InvitationRepository{}
	invs, err := invRepo.FindPendingByUserID(ctx, target.ID)
	if err != nil {
		t.Fatalf("FindPendingByUserID failed: %v", err)
	}
	if len(invs) != 1 {
		t.Fatalf("Expected 1 pending invitation, got %d", len(invs))
	}
	if invs[0].EntityType != "account" {
		t.Fatalf("Expected entity_type=account, got %s", invs[0].EntityType)
	}
	if invs[0].EntityID != accountID {
		t.Fatalf("Expected entity_id=%s, got %s", accountID, invs[0].EntityID)
	}
	if invs[0].EncryptedData == nil || *invs[0].EncryptedData != encryptedKey {
		t.Fatalf("EncryptedData mismatch")
	}

	// Verify notification created
	notifRepo := &repository.NotificationRepository{}
	notifs, err := notifRepo.ListByUserID(ctx, target.ID, 10, 0)
	if err != nil {
		t.Fatalf("ListByUserID failed: %v", err)
	}
	if len(notifs) < 1 {
		t.Fatal("Expected at least 1 notification for account invitation")
	}
	if notifs[0].Type != "account_invitation" {
		t.Fatalf("Expected type=account_invitation, got %s", notifs[0].Type)
	}

	// Verify email queued
	var emailCount int
	database.Pool.QueryRow(ctx, `SELECT COUNT(*) FROM email_outbox WHERE to_address = $1`, target.Email).Scan(&emailCount)
	if emailCount < 1 {
		t.Fatal("Expected email queued for account invitation target")
	}
}

func TestInvitationServiceAcceptRuleInvitation(t *testing.T) {
	cleanup := setupInvitationDB(t)
	defer cleanup()

	// Generate server keypair for the invitation service
	privKey, pubKey, err := crypto.GenerateServerKeypair()
	if err != nil {
		t.Fatalf("GenerateServerKeypair failed: %v", err)
	}

	InitInvitationServiceWithKeys(privKey, pubKey)
	InitNotificationService()

	ctx := context.Background()

	inviter, _, _ := createTestUser(t, "inv-accept-rule-owner@test.com")
	receiver, _, _ := createTestUser(t, "inv-accept-rule-rec@test.com")

	// Create a rule (insert directly, simulating a user_transfer rule in pending_accepted status)
	ruleID := uuid.New().String()
	encryptedPayload := "test-encrypted-payload"
	now := time.Now().UTC()
	_, err = database.Pool.Exec(ctx, `
		INSERT INTO rules (id, created_by, name, encrypted_payload, frequency, next_occurrence, occurrences_so_far, is_active, status, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, 0, true, 'pending_accepted', $7, $7)
	`, ruleID, inviter.ID, "Test Transfer", encryptedPayload, "monthly", now.Add(24*time.Hour), now)
	if err != nil {
		t.Fatalf("Insert rule failed: %v", err)
	}

	// Create the invitation with the receiver linked
	invRepo := &repository.InvitationRepository{}
	inv := &model.Invitation{
		ID:            uuid.New().String(),
		EntityType:    "rule",
		EntityID:      ruleID,
		InvitedBy:     inviter.ID,
		InvitedEmail:  receiver.Email,
		InvitedUserID: &receiver.ID,
		Status:        "pending",
		CreatedAt:     now,
		ExpiresAt:     now.Add(30 * 24 * time.Hour),
	}
	if err := invRepo.Create(ctx, inv); err != nil {
		t.Fatalf("Create invitation failed: %v", err)
	}

	// Accept the rule invitation with an encrypted account (receiver's chosen account)
	encryptedAccount, err := crypto.EncryptWithPublicKey([]byte("receiver-account-id"), pubKey)
	if err != nil {
		t.Fatalf("EncryptWithPublicKey failed: %v", err)
	}

	err = Invitations.AcceptRuleInvitation(ctx, inv.ID, receiver.ID, encryptedAccount)
	if err != nil {
		t.Fatalf("AcceptRuleInvitation failed: %v", err)
	}

	// Verify invitation status changed
	updatedInv, err := invRepo.FindByID(ctx, inv.ID)
	if err != nil {
		t.Fatalf("FindByID failed: %v", err)
	}
	if updatedInv.Status != "accepted" {
		t.Fatalf("Expected invitation status=accepted, got %s", updatedInv.Status)
	}

	// Verify rule status changed to active
	ruleRepo := &repository.RuleRepository{}
	rule, err := ruleRepo.FindByID(ctx, ruleID)
	if err != nil {
		t.Fatalf("FindByID rule failed: %v", err)
	}
	if rule.Status != "active" {
		t.Fatalf("Expected rule status=active, got %s", rule.Status)
	}
	if rule.TargetAccountEncrypted == nil || *rule.TargetAccountEncrypted != encryptedAccount {
		t.Fatal("TargetAccountEncrypted not set on rule")
	}

	// Verify notification sent to inviter
	notifRepo := &repository.NotificationRepository{}
	notifs, err := notifRepo.ListByUserID(ctx, inviter.ID, 10, 0)
	if err != nil {
		t.Fatalf("ListByUserID failed: %v", err)
	}
	// We expect at least the acceptance notification for the inviter
	found := false
	for _, n := range notifs {
		if n.Type == "invitation_accepted" {
			found = true
			break
		}
	}
	if !found {
		t.Fatal("Expected invitation_accepted notification for inviter")
	}
}

func TestInvitationServiceAcceptAccountInvitation(t *testing.T) {
	cleanup := setupInvitationDB(t)
	defer cleanup()

	// Generate server keypair
	privKey, pubKey, err := crypto.GenerateServerKeypair()
	if err != nil {
		t.Fatalf("GenerateServerKeypair failed: %v", err)
	}

	InitInvitationServiceWithKeys(privKey, pubKey)
	InitAccountService()

	ctx := context.Background()

	inviter, _, _ := createTestUser(t, "inv-acct-owner@test.com")
	invitee, _, _ := createTestUser(t, "inv-acct-invitee@test.com")

	// The invitee needs a valid X25519 public key (base64-encoded) for re-encryption
	// Generate a keypair for the invitee
	_, inviteePubKey, err := crypto.GenerateServerKeypair()
	if err != nil {
		t.Fatalf("Generate invitee keypair failed: %v", err)
	}
	inviteePubKeyB64 := base64.StdEncoding.EncodeToString(inviteePubKey)

	// Update the invitee's public key in the DB
	_, err = database.Pool.Exec(ctx, `UPDATE users SET public_key = $1 WHERE id = $2`, inviteePubKeyB64, invitee.ID)
	if err != nil {
		t.Fatalf("Update invitee public key failed: %v", err)
	}

	// Create an account
	account, err := Accounts.Create(ctx, inviter.ID, &model.CreateAccountRequest{
		Currency: "USD",
		Type:     "joint",
	})
	if err != nil {
		t.Fatalf("Create account failed: %v", err)
	}

	// Create an invitation with encrypted_data (the account key encrypted with the server's public key)
	// The service expects encrypted_data = {"account_key": "base64..."} encrypted with server's pub key
	encryptedData, err := crypto.EncryptWithPublicKey(
		[]byte(`{"account_key":"test-account-key-value"}`),
		pubKey,
	)
	if err != nil {
		t.Fatalf("Encrypt account key with server pub key failed: %v", err)
	}

	now := time.Now().UTC()
	invRepo := &repository.InvitationRepository{}
	inv := &model.Invitation{
		ID:            uuid.New().String(),
		EntityType:    "account",
		EntityID:      account.ID,
		InvitedBy:     inviter.ID,
		InvitedEmail:  invitee.Email,
		InvitedUserID: &invitee.ID,
		EncryptedData: &encryptedData,
		Status:        "pending",
		CreatedAt:     now,
		ExpiresAt:     now.Add(30 * 24 * time.Hour),
	}
	if err := invRepo.Create(ctx, inv); err != nil {
		t.Fatalf("Create invitation failed: %v", err)
	}

	// Accept the invitation
	err = Invitations.AcceptAccountInvitation(ctx, inv.ID, invitee.ID)
	if err != nil {
		t.Fatalf("AcceptAccountInvitation failed: %v", err)
	}

	// Verify invitation status changed
	updatedInv, err := invRepo.FindByID(ctx, inv.ID)
	if err != nil {
		t.Fatalf("FindByID failed: %v", err)
	}
	if updatedInv.Status != "accepted" {
		t.Fatalf("Expected invitation status=accepted, got %s", updatedInv.Status)
	}

	// Verify account user was created
	auRepo := &repository.AccountUserRepository{}
	au, err := auRepo.FindByAccountAndUser(ctx, account.ID, invitee.ID)
	if err != nil {
		t.Fatalf("FindByAccountAndUser failed: %v", err)
	}
	if au == nil {
		t.Fatal("AccountUser not created for invitee")
	}
	if au.Role != "member" {
		t.Fatalf("Expected role=member, got %s", au.Role)
	}
	if au.Status != "active" {
		t.Fatalf("Expected status=active, got %s", au.Status)
	}
	if au.EncryptedAccountKey == "" {
		t.Fatal("EncryptedAccountKey should not be empty")
	}
}

func TestInvitationServiceDeclineInvitation_Rule(t *testing.T) {
	cleanup := setupInvitationDB(t)
	defer cleanup()
	InitInvitationService()
	InitNotificationService()

	ctx := context.Background()

	inviter, _, _ := createTestUser(t, "inv-decline-owner@test.com")
	receiver, _, _ := createTestUser(t, "inv-decline-rec@test.com")

	// Create a rule
	ruleID := uuid.New().String()
	now := time.Now().UTC()
	_, err := database.Pool.Exec(ctx, `
		INSERT INTO rules (id, created_by, name, encrypted_payload, frequency, next_occurrence, occurrences_so_far, is_active, status, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, 0, true, 'pending_accepted', $7, $7)
	`, ruleID, inviter.ID, "Test Rule", "payload", "monthly", now.Add(24*time.Hour), now)
	if err != nil {
		t.Fatalf("Insert rule failed: %v", err)
	}

	// Create invitation
	invRepo := &repository.InvitationRepository{}
	inv := &model.Invitation{
		ID:            uuid.New().String(),
		EntityType:    "rule",
		EntityID:      ruleID,
		InvitedBy:     inviter.ID,
		InvitedEmail:  receiver.Email,
		InvitedUserID: &receiver.ID,
		Status:        "pending",
		CreatedAt:     now,
		ExpiresAt:     now.Add(30 * 24 * time.Hour),
	}
	if err := invRepo.Create(ctx, inv); err != nil {
		t.Fatalf("Create invitation failed: %v", err)
	}

	// Decline
	err = Invitations.DeclineInvitation(ctx, inv.ID, receiver.ID)
	if err != nil {
		t.Fatalf("DeclineInvitation failed: %v", err)
	}

	// Verify invitation status changed
	updatedInv, _ := invRepo.FindByID(ctx, inv.ID)
	if updatedInv.Status != "declined" {
		t.Fatalf("Expected status=declined, got %s", updatedInv.Status)
	}

	// Verify the rule was deleted (since it's a rule invitation)
	ruleRepo := &repository.RuleRepository{}
	rule, err := ruleRepo.FindByID(ctx, ruleID)
	if err != nil {
		t.Fatalf("FindByID rule failed: %v", err)
	}
	if rule != nil {
		t.Fatal("Rule should have been deleted after declining rule invitation")
	}

	// Verify notification sent to inviter
	notifRepo := &repository.NotificationRepository{}
	notifs, err := notifRepo.ListByUserID(ctx, inviter.ID, 10, 0)
	if err != nil {
		t.Fatalf("ListByUserID failed: %v", err)
	}
	found := false
	for _, n := range notifs {
		if n.Type == "invitation_declined" {
			found = true
			break
		}
	}
	if !found {
		t.Fatal("Expected invitation_declined notification for inviter")
	}
}

func TestInvitationServiceDeclineInvitation_Account(t *testing.T) {
	cleanup := setupInvitationDB(t)
	defer cleanup()
	InitInvitationService()
	InitNotificationService()

	ctx := context.Background()

	inviter, _, _ := createTestUser(t, "inv-decl-acct-owner@test.com")
	receiver, _, _ := createTestUser(t, "inv-decl-acct-rec@test.com")
	accountID := uuid.New().String()
	encKey := "some-encrypted-key"

	now := time.Now().UTC()
	invRepo := &repository.InvitationRepository{}
	inv := &model.Invitation{
		ID:            uuid.New().String(),
		EntityType:    "account",
		EntityID:      accountID,
		InvitedBy:     inviter.ID,
		InvitedEmail:  receiver.Email,
		InvitedUserID: &receiver.ID,
		EncryptedData: &encKey,
		Status:        "pending",
		CreatedAt:     now,
		ExpiresAt:     now.Add(30 * 24 * time.Hour),
	}
	if err := invRepo.Create(ctx, inv); err != nil {
		t.Fatalf("Create invitation failed: %v", err)
	}

	// Decline
	err := Invitations.DeclineInvitation(ctx, inv.ID, receiver.ID)
	if err != nil {
		t.Fatalf("DeclineInvitation failed: %v", err)
	}

	// Verify invitation declined
	updatedInv, _ := invRepo.FindByID(ctx, inv.ID)
	if updatedInv.Status != "declined" {
		t.Fatalf("Expected status=declined, got %s", updatedInv.Status)
	}
}

func TestInvitationServiceGetPendingInvitations(t *testing.T) {
	cleanup := setupInvitationDB(t)
	defer cleanup()
	InitInvitationService()

	ctx := context.Background()

	inviter, _, _ := createTestUser(t, "inv-pending-inviter@test.com")
	user, _, _ := createTestUser(t, "inv-pending-user@test.com")

	now := time.Now().UTC()
	invRepo := &repository.InvitationRepository{}

	// Create 2 pending invitations for the user (by user ID)
	for i := 0; i < 2; i++ {
		inv := &model.Invitation{
			ID:            uuid.New().String(),
			EntityType:    "account",
			EntityID:      uuid.New().String(),
			InvitedBy:     inviter.ID,
			InvitedEmail:  user.Email,
			InvitedUserID: &user.ID,
			Status:        "pending",
			CreatedAt:     now,
			ExpiresAt:     now.Add(30 * 24 * time.Hour),
		}
		if err := invRepo.Create(ctx, inv); err != nil {
			t.Fatalf("Create invitation %d failed: %v", i, err)
		}
	}

	// Also create 1 by email (simulating pre-registration invite)
	emailInv := &model.Invitation{
		ID:           uuid.New().String(),
		EntityType:   "rule",
		EntityID:     uuid.New().String(),
		InvitedBy:    inviter.ID,
		InvitedEmail: user.Email,
		Status:       "pending",
		CreatedAt:    now,
		ExpiresAt:    now.Add(30 * 24 * time.Hour),
	}
	if err := invRepo.Create(ctx, emailInv); err != nil {
		t.Fatalf("Create email invitation failed: %v", err)
	}

	pending, err := Invitations.GetPendingInvitations(ctx, user.ID)
	if err != nil {
		t.Fatalf("GetPendingInvitations failed: %v", err)
	}
	// Should have 3 total (2 by user ID + 1 by email)
	if len(pending) != 3 {
		t.Fatalf("Expected 3 pending invitations, got %d", len(pending))
	}
}

func TestInvitationServiceLinkInvitationsToUser(t *testing.T) {
	cleanup := setupInvitationDB(t)
	defer cleanup()
	InitInvitationService()

	ctx := context.Background()

	inviter, _, _ := createTestUser(t, "inv-link-inviter@test.com")

	// Create a pending invitation by email (user not yet registered)
	now := time.Now().UTC()
	invRepo := &repository.InvitationRepository{}
	inv := &model.Invitation{
		ID:           uuid.New().String(),
		EntityType:   "account",
		EntityID:     uuid.New().String(),
		InvitedBy:    inviter.ID,
		InvitedEmail: "newuser@test.com",
		Status:       "pending",
		CreatedAt:    now,
		ExpiresAt:    now.Add(30 * 24 * time.Hour),
	}
	if err := invRepo.Create(ctx, inv); err != nil {
		t.Fatalf("Create invitation failed: %v", err)
	}

	// Now the user registers
	newUser, _, _ := createTestUser(t, "newuser@test.com")

	// Link
	err := Invitations.LinkInvitationsToUser(ctx, newUser.Email, newUser.ID)
	if err != nil {
		t.Fatalf("LinkInvitationsToUser failed: %v", err)
	}

	// Verify invitation linked
	updated, _ := invRepo.FindByID(ctx, inv.ID)
	if updated.InvitedUserID == nil || *updated.InvitedUserID != newUser.ID {
		t.Fatal("Invitation should be linked to new user")
	}

	// Verify a notification was created for the new user
	notifRepo := &repository.NotificationRepository{}
	notifs, err := notifRepo.ListByUserID(ctx, newUser.ID, 10, 0)
	if err != nil {
		t.Fatalf("ListByUserID failed: %v", err)
	}
	if len(notifs) < 1 {
		t.Fatal("Expected at least 1 notification for linked invitation")
	}
	foundNotif := false
	for _, n := range notifs {
		if n.Type == "account_invitation" {
			foundNotif = true
			break
		}
	}
	if !foundNotif {
		t.Fatal("Expected account_invitation notification type for linked invitation")
	}
}

func TestInvitationServiceProcessExpiredInvitations(t *testing.T) {
	cleanup := setupInvitationDB(t)
	defer cleanup()
	InitInvitationService()
	InitNotificationService()

	ctx := context.Background()

	inviter, _, _ := createTestUser(t, "inv-expire-owner@test.com")

	// Create a rule that will be cleaned up on expiry
	ruleID := uuid.New().String()
	now := time.Now().UTC()
	_, err := database.Pool.Exec(ctx, `
		INSERT INTO rules (id, created_by, name, encrypted_payload, frequency, next_occurrence, occurrences_so_far, is_active, status, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, 0, true, 'pending_accepted', $7, $7)
	`, ruleID, inviter.ID, "Expiring Rule", "payload", "monthly", now.Add(24*time.Hour), now)
	if err != nil {
		t.Fatalf("Insert rule failed: %v", err)
	}

	// Create an expired invitation for the rule (expires_at in the past)
	expiredTime := now.Add(-1 * time.Hour)
	invRepo := &repository.InvitationRepository{}
	ruleInv := &model.Invitation{
		ID:           uuid.New().String(),
		EntityType:   "rule",
		EntityID:     ruleID,
		InvitedBy:    inviter.ID,
		InvitedEmail: "someone@test.com",
		Status:       "pending",
		CreatedAt:    expiredTime.Add(-30 * 24 * time.Hour),
		ExpiresAt:    expiredTime,
	}
	if err := invRepo.Create(ctx, ruleInv); err != nil {
		t.Fatalf("Create expired rule invitation failed: %v", err)
	}

	// Create an expired account invitation (no rule to delete)
	acctInv := &model.Invitation{
		ID:           uuid.New().String(),
		EntityType:   "account",
		EntityID:     uuid.New().String(),
		InvitedBy:    inviter.ID,
		InvitedEmail: "someoneelse@test.com",
		Status:       "pending",
		CreatedAt:    expiredTime.Add(-30 * 24 * time.Hour),
		ExpiresAt:    expiredTime,
	}
	if err := invRepo.Create(ctx, acctInv); err != nil {
		t.Fatalf("Create expired account invitation failed: %v", err)
	}

	// Process expired invitations
	Invitations.ProcessExpiredInvitations(ctx)

	// Verify rule invitation is expired
	updatedRuleInv, _ := invRepo.FindByID(ctx, ruleInv.ID)
	if updatedRuleInv.Status != "expired" {
		t.Fatalf("Expected rule invitation status=expired, got %s", updatedRuleInv.Status)
	}

	// Verify rule was deleted
	ruleRepo := &repository.RuleRepository{}
	rule, _ := ruleRepo.FindByID(ctx, ruleID)
	if rule != nil {
		t.Fatal("Rule should be deleted after invitation expired")
	}

	// Verify account invitation is expired
	updatedAcctInv, _ := invRepo.FindByID(ctx, acctInv.ID)
	if updatedAcctInv.Status != "expired" {
		t.Fatalf("Expected account invitation status=expired, got %s", updatedAcctInv.Status)
	}

	// Verify expiry notification was created for inviter
	notifRepo := &repository.NotificationRepository{}
	notifs, err := notifRepo.ListByUserID(ctx, inviter.ID, 10, 0)
	if err != nil {
		t.Fatalf("ListByUserID failed: %v", err)
	}
	expiredCount := 0
	for _, n := range notifs {
		if n.Type == "invitation_expired" {
			expiredCount++
		}
	}
	if expiredCount < 2 {
		t.Fatalf("Expected at least 2 invitation_expired notifications, got %d", expiredCount)
	}

	// Verify expiry emails were queued for the inviter
	var emailCount int
	err = database.Pool.QueryRow(ctx, `SELECT COUNT(*) FROM email_outbox WHERE to_address = $1`, inviter.Email).Scan(&emailCount)
	if err != nil {
		t.Fatalf("Count email_outbox failed: %v", err)
	}
	if emailCount < 2 {
		t.Fatalf("Expected at least 2 expiry emails for inviter, got %d", emailCount)
	}
}

func TestInvitationServiceFindInvitation(t *testing.T) {
	cleanup := setupInvitationDB(t)
	defer cleanup()
	InitInvitationService()

	ctx := context.Background()

	inviter, _, _ := createTestUser(t, "inv-find-inviter@test.com")
	user, _, _ := createTestUser(t, "inv-find-user@test.com")

	now := time.Now().UTC()
	invRepo := &repository.InvitationRepository{}
	inv := &model.Invitation{
		ID:            uuid.New().String(),
		EntityType:    "account",
		EntityID:      uuid.New().String(),
		InvitedBy:     inviter.ID,
		InvitedEmail:  user.Email,
		InvitedUserID: &user.ID,
		Status:        "pending",
		CreatedAt:     now,
		ExpiresAt:     now.Add(30 * 24 * time.Hour),
	}
	if err := invRepo.Create(ctx, inv); err != nil {
		t.Fatalf("Create invitation failed: %v", err)
	}

	found, err := Invitations.FindInvitation(ctx, inv.ID)
	if err != nil {
		t.Fatalf("FindInvitation failed: %v", err)
	}
	if found == nil {
		t.Fatal("Invitation not found")
	}
	if found.ID != inv.ID {
		t.Fatalf("Expected ID %s, got %s", inv.ID, found.ID)
	}
}

func TestInvitationServiceFindInvitationByEntity(t *testing.T) {
	cleanup := setupInvitationDB(t)
	defer cleanup()
	InitInvitationService()

	ctx := context.Background()

	inviter, _, _ := createTestUser(t, "inv-find-entity-inviter@test.com")
	user, _, _ := createTestUser(t, "inv-find-entity-user@test.com")

	ruleID := uuid.New().String()
	now := time.Now().UTC()
	invRepo := &repository.InvitationRepository{}
	inv := &model.Invitation{
		ID:            uuid.New().String(),
		EntityType:    "rule",
		EntityID:      ruleID,
		InvitedBy:     inviter.ID,
		InvitedEmail:  user.Email,
		InvitedUserID: &user.ID,
		Status:        "pending",
		CreatedAt:     now,
		ExpiresAt:     now.Add(30 * 24 * time.Hour),
	}
	if err := invRepo.Create(ctx, inv); err != nil {
		t.Fatalf("Create invitation failed: %v", err)
	}

	found, err := Invitations.FindInvitationByEntity(ctx, "rule", ruleID)
	if err != nil {
		t.Fatalf("FindInvitationByEntity failed: %v", err)
	}
	if found == nil {
		t.Fatal("Invitation not found by entity")
	}
	if found.ID != inv.ID {
		t.Fatalf("Expected ID %s, got %s", inv.ID, found.ID)
	}
}

func TestInvitationServiceAcceptRuleInvitation_NotPending(t *testing.T) {
	cleanup := setupInvitationDB(t)
	defer cleanup()
	InitInvitationService()

	ctx := context.Background()

	inviter, _, _ := createTestUser(t, "inv-not-pending-owner@test.com")
	receiver, _, _ := createTestUser(t, "inv-not-pending-rec@test.com")

	now := time.Now().UTC()
	invRepo := &repository.InvitationRepository{}
	inv := &model.Invitation{
		ID:            uuid.New().String(),
		EntityType:    "rule",
		EntityID:      uuid.New().String(),
		InvitedBy:     inviter.ID,
		InvitedEmail:  receiver.Email,
		InvitedUserID: &receiver.ID,
		Status:        "accepted", // Already accepted
		CreatedAt:     now,
		ExpiresAt:     now.Add(30 * 24 * time.Hour),
	}
	if err := invRepo.Create(ctx, inv); err != nil {
		t.Fatalf("Create invitation failed: %v", err)
	}

	err := Invitations.AcceptRuleInvitation(ctx, inv.ID, receiver.ID, "encrypted-account")
	if err == nil {
		t.Fatal("Expected error when accepting non-pending invitation")
	}
}

func TestInvitationServiceDeclineInvitation_WrongUser(t *testing.T) {
	cleanup := setupInvitationDB(t)
	defer cleanup()
	InitInvitationService()

	ctx := context.Background()

	inviter, _, _ := createTestUser(t, "inv-wrong-owner@test.com")
	receiver, _, _ := createTestUser(t, "inv-wrong-rec@test.com")
	other, _, _ := createTestUser(t, "inv-wrong-other@test.com")

	now := time.Now().UTC()
	invRepo := &repository.InvitationRepository{}
	inv := &model.Invitation{
		ID:            uuid.New().String(),
		EntityType:    "account",
		EntityID:      uuid.New().String(),
		InvitedBy:     inviter.ID,
		InvitedEmail:  receiver.Email,
		InvitedUserID: &receiver.ID,
		Status:        "pending",
		CreatedAt:     now,
		ExpiresAt:     now.Add(30 * 24 * time.Hour),
	}
	if err := invRepo.Create(ctx, inv); err != nil {
		t.Fatalf("Create invitation failed: %v", err)
	}

	err := Invitations.DeclineInvitation(ctx, inv.ID, other.ID)
	if err == nil {
		t.Fatal("Expected error when wrong user declines invitation")
	}
}
