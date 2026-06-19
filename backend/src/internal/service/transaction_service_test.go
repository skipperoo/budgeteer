package service

import (
	"context"
	"testing"
	"time"

	"budgeteer-backend/internal/database"
	"budgeteer-backend/internal/model"
	"budgeteer-backend/internal/repository"

	"github.com/google/uuid"
)

func setupTransactionTestDB(t *testing.T) context.CancelFunc {
	t.Helper()
	cleanup := setupTestDB(t)

	ctx := context.Background()

	// Migration 0002: name column
	database.Pool.Exec(ctx, `ALTER TABLE accounts ADD COLUMN IF NOT EXISTS name VARCHAR(255) NOT NULL DEFAULT ''`)

	// Migration 0007: balance on accounts
	database.Pool.Exec(ctx, `ALTER TABLE accounts ADD COLUMN IF NOT EXISTS balance BIGINT NOT NULL DEFAULT 0`)

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

	// Invitations table (with transaction entity_type)
	database.Pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS invitations (
			id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
			entity_type     VARCHAR(20) NOT NULL,
			entity_id       UUID NOT NULL,
			invited_by      UUID NOT NULL REFERENCES users(id),
			invited_email   VARCHAR(255) NOT NULL,
			invited_user_id UUID REFERENCES users(id),
			encrypted_data  TEXT,
			status          VARCHAR(20) NOT NULL DEFAULT 'pending',
			created_at      TIMESTAMPTZ DEFAULT NOW(),
			expires_at      TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 days'
		)
	`)
	database.Pool.Exec(ctx, `ALTER TABLE invitations DROP CONSTRAINT IF EXISTS invitations_entity_type_check`)
	database.Pool.Exec(ctx, `ALTER TABLE invitations ADD CONSTRAINT invitations_entity_type_check CHECK (entity_type IN ('rule', 'account', 'transaction'))`)
	database.Pool.Exec(ctx, `ALTER TABLE invitations DROP CONSTRAINT IF EXISTS invitations_status_check`)
	database.Pool.Exec(ctx, `ALTER TABLE invitations ADD CONSTRAINT invitations_status_check CHECK (status IN ('pending', 'accepted', 'declined', 'expired'))`)

	return cleanup
}

func TestCreateTransaction_SendToUser_Success(t *testing.T) {
	cleanup := setupTransactionTestDB(t)
	defer cleanup()

	InitAuthService()
	InitTransactionService()
	InitInvitationService()
	InitNotificationService()

	ctx := context.Background()

	// Create sender and recipient users
	sender, _, _ := createTestUser(t, "sender-send-to@test.com")
	recipient, _, _ := createTestUser(t, "recipient-send-to@test.com")

	// Create an account for the sender
	acctRepo := &repository.AccountRepository{}
	account := &model.Account{
		ID:        uuid.New().String(),
		Currency:  "USD",
		Type:      "personal",
		CreatedBy: sender.ID,
	}
	err := acctRepo.Create(ctx, account)
	if err != nil {
		t.Fatalf("Failed to create account: %v", err)
	}

	// Create account_user for the sender
	auRepo := &repository.AccountUserRepository{}
	err = auRepo.Create(ctx, &model.AccountUser{
		AccountID: account.ID,
		UserID:    sender.ID,
		Role:      "owner",
		Status:    "active",
	})
	if err != nil {
		t.Fatalf("Failed to create account_user: %v", err)
	}

	// Create a transaction with target_email
	req := &model.CreateTransactionRequest{
		AccountID:              account.ID,
		Time:                   time.Now().UTC(),
		EncryptedPayload:       "sender-encrypted-payload",
		TargetEmail:            recipient.Email,
		ServerEncryptedPayload: "server-encrypted-payload-data",
	}

	tx, err := Transactions.Create(ctx, req, sender.ID)
	if err != nil {
		t.Fatalf("Create transaction with target_email failed: %v", err)
	}
	if tx == nil {
		t.Fatal("Expected non-nil transaction")
	}

	// Verify the transaction was created
	created, err := (&repository.TransactionRepository{}).FindByID(ctx, tx.ID)
	if err != nil {
		t.Fatalf("FindByID failed: %v", err)
	}
	if created == nil {
		t.Fatal("Transaction should exist")
	}

	// Verify an invitation was created for the recipient
	invRepo := &repository.InvitationRepository{}
	invs, err := invRepo.FindPendingByUserID(ctx, recipient.ID)
	if err != nil {
		t.Fatalf("FindPendingByUserID failed: %v", err)
	}
	if len(invs) != 1 {
		t.Fatalf("Expected 1 pending invitation, got %d", len(invs))
	}
	inv := invs[0]
	if inv.EntityType != "transaction" {
		t.Fatalf("Expected entity_type=transaction, got %s", inv.EntityType)
	}
	if inv.EntityID != tx.ID {
		t.Fatalf("Expected entity_id=%s, got %s", tx.ID, inv.EntityID)
	}
	if inv.Status != "pending" {
		t.Fatalf("Expected status=pending, got %s", inv.Status)
	}
	if inv.EncryptedData == nil || *inv.EncryptedData != "server-encrypted-payload-data" {
		t.Fatal("EncryptedData should contain the server_encrypted_payload")
	}

	// Verify notification was created for recipient
	notifRepo := &repository.NotificationRepository{}
	notifs, err := notifRepo.ListByUserID(ctx, recipient.ID, 10, 0)
	if err != nil {
		t.Fatalf("ListByUserID failed: %v", err)
	}
	if len(notifs) < 1 {
		t.Fatal("Expected at least 1 notification for recipient")
	}
	if notifs[0].Type != "transaction_invitation" {
		t.Fatalf("Expected notification type=transaction_invitation, got %s", notifs[0].Type)
	}

	// Verify email was queued for the recipient
	var emailCount int
	err = database.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM email_outbox WHERE to_address = $1`, recipient.Email).Scan(&emailCount)
	if err != nil {
		t.Fatalf("Count email_outbox failed: %v", err)
	}
	if emailCount < 1 {
		t.Fatal("Expected at least 1 email queued for recipient")
	}
}

func TestCreateTransaction_SendToUser_SelfSend(t *testing.T) {
	cleanup := setupTransactionTestDB(t)
	defer cleanup()

	InitAuthService()
	InitTransactionService()
	InitInvitationService()

	ctx := context.Background()

	user, _, _ := createTestUser(t, "self-send@test.com")

	acctRepo := &repository.AccountRepository{}
	account := &model.Account{
		ID:        uuid.New().String(),
		Currency:  "USD",
		Type:      "personal",
		CreatedBy: user.ID,
	}
	err := acctRepo.Create(ctx, account)
	if err != nil {
		t.Fatalf("Failed to create account: %v", err)
	}

	auRepo := &repository.AccountUserRepository{}
	auRepo.Create(ctx, &model.AccountUser{
		AccountID: account.ID,
		UserID:    user.ID,
		Role:      "owner",
		Status:    "active",
	})

	req := &model.CreateTransactionRequest{
		AccountID:              account.ID,
		Time:                   time.Now().UTC(),
		EncryptedPayload:       "payload",
		TargetEmail:            user.Email, // Same as sender!
		ServerEncryptedPayload: "server-payload",
	}

	_, err = Transactions.Create(ctx, req, user.ID)
	if err == nil {
		t.Fatal("Expected error when sending transaction to yourself")
	}
}

func TestCreateTransaction_SendToUser_MissingServerPayload(t *testing.T) {
	cleanup := setupTransactionTestDB(t)
	defer cleanup()

	InitAuthService()
	InitTransactionService()

	ctx := context.Background()

	user, _, _ := createTestUser(t, "missing-sp@test.com")
	recipient, _, _ := createTestUser(t, "missing-sp-recipient@test.com")

	acctRepo := &repository.AccountRepository{}
	account := &model.Account{
		ID:        uuid.New().String(),
		Currency:  "USD",
		Type:      "personal",
		CreatedBy: user.ID,
	}
	acctRepo.Create(ctx, account)

	auRepo := &repository.AccountUserRepository{}
	auRepo.Create(ctx, &model.AccountUser{
		AccountID: account.ID,
		UserID:    user.ID,
		Role:      "owner",
		Status:    "active",
	})

	req := &model.CreateTransactionRequest{
		AccountID:        account.ID,
		Time:             time.Now().UTC(),
		EncryptedPayload: "payload",
		TargetEmail:      recipient.Email,
		// No ServerEncryptedPayload
	}

	_, err := Transactions.Create(ctx, req, user.ID)
	if err == nil {
		t.Fatal("Expected error when target_email is set without server_encrypted_payload")
	}
}
