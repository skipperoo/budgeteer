package service

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"budgeteer-backend/internal/config"
	"budgeteer-backend/internal/crypto"
	"budgeteer-backend/internal/database"
	"budgeteer-backend/internal/logger"
	"budgeteer-backend/internal/model"
	"budgeteer-backend/internal/repository"

	"github.com/google/uuid"
)

type InvitationService struct {
	InvitationRepo    *repository.InvitationRepository
	RuleRepo          *repository.RuleRepository
	AccountUserRepo   *repository.AccountUserRepository
	UserRepo          *repository.UserRepository
	EmailRepo         *repository.EmailRepository
	NotificationRepo  *repository.NotificationRepository
	serverPrivateKey  []byte
	serverPublicKey   []byte
	BaseURL           string
}

var Invitations *InvitationService

func InitInvitationService() {
	if Rules == nil {
		logger.Warning("Rules service not initialized — invitation service may be limited")
	}

	Invitations = &InvitationService{
		InvitationRepo:   &repository.InvitationRepository{},
		RuleRepo:         &repository.RuleRepository{},
		AccountUserRepo:  &repository.AccountUserRepository{},
		UserRepo:         &repository.UserRepository{},
		EmailRepo:        &repository.EmailRepository{},
		NotificationRepo: &repository.NotificationRepository{},
		BaseURL:          getBaseURL(),
	}
}

func getBaseURL() string {
	if config.Cfg != nil && config.Cfg.BaseURL != "" {
		return config.Cfg.BaseURL
	}
	return "http://localhost:8080"
}

// InitInvitationServiceWithKeys is called after rule service is initialized
// so we can share the server keypair.
func InitInvitationServiceWithKeys(privKey, pubKey []byte) {
	InitInvitationService()
	Invitations.serverPrivateKey = privKey
	Invitations.serverPublicKey = pubKey
}

// CreateRuleInvitation creates a pending invitation for a user_transfer rule.
func (s *InvitationService) CreateRuleInvitation(ctx context.Context, ruleID, inviterID, targetEmail string) error {
	now := time.Now().UTC()

	inv := &model.Invitation{
		ID:           uuid.New().String(),
		EntityType:   "rule",
		EntityID:     ruleID,
		InvitedBy:    inviterID,
		InvitedEmail: targetEmail,
		Status:       "pending",
		CreatedAt:    now,
		ExpiresAt:    now.Add(30 * 24 * time.Hour),
	}

	// Look up user by email
	targetUser, err := s.UserRepo.FindByEmail(ctx, targetEmail)
	if err != nil {
		return fmt.Errorf("lookup target user: %w", err)
	}

	if targetUser != nil {
		inv.InvitedUserID = &targetUser.ID

		// Create notification for target user
		data, _ := json.Marshal(model.NotificationData{
			InvitationID: inv.ID,
			RuleID:       ruleID,
			InvitedBy:    inviterID,
		})
		dataStr := string(data)
		if err := s.NotificationRepo.CreateNotification(ctx, targetUser.ID,
			"rule_invitation",
			"Rule Invitation",
			fmt.Sprintf("You have been invited to receive recurring transfers. A rule wants to send you money periodically."),
			&dataStr); err != nil {
			logger.Error("Failed to create notification: %v", err)
		}

		// Send email
		s.sendInvitationEmail(ctx, targetEmail, "rule", ruleID, targetUser.IsVerified)
	} else {
		// User doesn't exist — send subscription invitation
		s.sendSubscriptionEmail(ctx, targetEmail, "rule", ruleID)
	}

	if err := s.InvitationRepo.Create(ctx, inv); err != nil {
		return fmt.Errorf("create invitation: %w", err)
	}

	return nil
}

// CreateAccountInvitation creates a pending invitation for a joint account.
func (s *InvitationService) CreateAccountInvitation(ctx context.Context, accountID, inviterID, targetEmail, encryptedAccountKey string) error {
	now := time.Now().UTC()

	inv := &model.Invitation{
		ID:            uuid.New().String(),
		EntityType:    "account",
		EntityID:      accountID,
		InvitedBy:     inviterID,
		InvitedEmail:  targetEmail,
		EncryptedData: &encryptedAccountKey,
		Status:        "pending",
		CreatedAt:     now,
		ExpiresAt:     now.Add(30 * 24 * time.Hour),
	}

	// Look up user by email
	targetUser, err := s.UserRepo.FindByEmail(ctx, targetEmail)
	if err != nil {
		return fmt.Errorf("lookup target user: %w", err)
	}

	if targetUser != nil {
		inv.InvitedUserID = &targetUser.ID

		// Create notification for target user
		data, _ := json.Marshal(model.NotificationData{
			InvitationID: inv.ID,
			AccountID:    accountID,
			InvitedBy:    inviterID,
		})
		dataStr := string(data)
		if err := s.NotificationRepo.CreateNotification(ctx, targetUser.ID,
			"account_invitation",
			"Account Invitation",
			fmt.Sprintf("You have been invited to join a joint account."),
			&dataStr); err != nil {
			logger.Error("Failed to create notification: %v", err)
		}

		// Send email
		s.sendInvitationEmail(ctx, targetEmail, "account", accountID, targetUser.IsVerified)
	} else {
		// User doesn't exist — send subscription invitation
		s.sendSubscriptionEmail(ctx, targetEmail, "account", accountID)
	}

	if err := s.InvitationRepo.Create(ctx, inv); err != nil {
		return fmt.Errorf("create invitation: %w", err)
	}

	return nil
}

// AcceptRuleInvitation handles accepting a rule invitation.
// The receiver provides their chosen account_id encrypted with the server's public key.
func (s *InvitationService) AcceptRuleInvitation(ctx context.Context, invitationID, userID, encryptedAccount string) error {
	inv, err := s.InvitationRepo.FindByID(ctx, invitationID)
	if err != nil {
		return fmt.Errorf("find invitation: %w", err)
	}
	if inv == nil {
		return fmt.Errorf("invitation not found")
	}
	if inv.Status != "pending" {
		return fmt.Errorf("invitation is not pending")
	}
	if !s.invitationBelongsToUser(ctx, inv, userID) {
		return fmt.Errorf("this invitation is not for you")
	}

	// Update rule: store receiver's chosen account and set status to active
	if err := s.RuleRepo.UpdateTargetAccountEncrypted(ctx, inv.EntityID, encryptedAccount); err != nil {
		return fmt.Errorf("update rule target account: %w", err)
	}
	if err := s.RuleRepo.UpdateStatus(ctx, inv.EntityID, "active"); err != nil {
		return fmt.Errorf("update rule status: %w", err)
	}

	// Mark invitation as accepted
	if err := s.InvitationRepo.UpdateStatus(ctx, invitationID, "accepted"); err != nil {
		return fmt.Errorf("update invitation status: %w", err)
	}

	// Notify the inviter
	s.notifyInviter(ctx, inv.InvitedBy, "invitation_accepted",
		"Rule Accepted",
		fmt.Sprintf("Your rule invitation has been accepted."),
		inv.ID, inv.EntityID, "")

	return nil
}

// CreateTransactionInvitation creates a pending invitation for a
// "send to user" one-time transaction. The server_encrypted_payload
// is the transaction payload encrypted with the server's X25519
// public key, so the server can re-encrypt it for the receiver later.
func (s *InvitationService) CreateTransactionInvitation(ctx context.Context, transactionID, inviterID, targetEmail, serverEncryptedPayload string) error {
	now := time.Now().UTC()

	inv := &model.Invitation{
		ID:            uuid.New().String(),
		EntityType:    "transaction",
		EntityID:      transactionID,
		InvitedBy:     inviterID,
		InvitedEmail:  targetEmail,
		EncryptedData: &serverEncryptedPayload,
		Status:        "pending",
		CreatedAt:     now,
		ExpiresAt:     now.Add(30 * 24 * time.Hour),
	}

	// Look up target user by email
	targetUser, err := s.UserRepo.FindByEmail(ctx, targetEmail)
	if err != nil {
		return fmt.Errorf("lookup target user: %w", err)
	}

	if targetUser != nil {
		inv.InvitedUserID = &targetUser.ID

		// Get inviter's email for the notification message
		inviter, err := s.UserRepo.FindByID(ctx, inviterID)
		inviterEmail := "Someone"
		if err == nil && inviter != nil {
			inviterEmail = inviter.Email
		}

		// Create notification for target user
		data, _ := json.Marshal(model.NotificationData{
			InvitationID: inv.ID,
			TransactionID: transactionID,
			InvitedBy:    inviterID,
		})
		dataStr := string(data)
		if err := s.NotificationRepo.CreateNotification(ctx, targetUser.ID,
			"transaction_invitation",
			"Money Transfer",
			fmt.Sprintf("%s sent you money. Accept the transfer to receive it in your account.", inviterEmail),
			&dataStr); err != nil {
			logger.Error("Failed to create notification: %v", err)
		}

		// Send email
		s.sendInvitationEmail(ctx, targetEmail, "transaction", transactionID, targetUser.IsVerified)
	} else {
		// User doesn't exist — send subscription invitation
		s.sendSubscriptionEmail(ctx, targetEmail, "transaction", transactionID)
	}

	if err := s.InvitationRepo.Create(ctx, inv); err != nil {
		return fmt.Errorf("create invitation: %w", err)
	}

	return nil
}

// AcceptTransactionInvitation handles accepting a "send to user"
// transaction invitation. The receiver provides their chosen account_id
// encrypted with the server's public key. The server decrypts the
// transaction payload from the invitation, creates an income transaction
// in the receiver's account, and updates both balances.
func (s *InvitationService) AcceptTransactionInvitation(ctx context.Context, invitationID, userID, encryptedAccount string) error {
	if s.serverPrivateKey == nil {
		return fmt.Errorf("server encryption key not configured")
	}

	inv, err := s.InvitationRepo.FindByID(ctx, invitationID)
	if err != nil {
		return fmt.Errorf("find invitation: %w", err)
	}
	if inv == nil {
		return fmt.Errorf("invitation not found")
	}
	if inv.Status != "pending" {
		return fmt.Errorf("invitation is not pending")
	}
	if !s.invitationBelongsToUser(ctx, inv, userID) {
		return fmt.Errorf("this invitation is not for you")
	}

	if inv.EncryptedData == nil {
		return fmt.Errorf("invitation has no encrypted transaction data")
	}

	// Decrypt the receiver's chosen account
	decryptedAccount, err := crypto.DecryptWithPrivateKey(encryptedAccount, s.serverPrivateKey)
	if err != nil {
		return fmt.Errorf("decrypt chosen account: %w", err)
	}
	// Try JSON format {"account_id":"..."} first, then raw string
	var acctData struct {
		AccountID string `json:"account_id"`
	}
	targetAccountID := ""
	if err := json.Unmarshal(decryptedAccount, &acctData); err == nil && acctData.AccountID != "" {
		targetAccountID = acctData.AccountID
	} else {
		targetAccountID = string(decryptedAccount)
	}
	if targetAccountID == "" {
		return fmt.Errorf("decrypted account ID is empty")
	}

	// Decrypt the stored transaction payload (server_encrypted_payload)
	payloadJSON, err := crypto.DecryptWithPrivateKey(*inv.EncryptedData, s.serverPrivateKey)
	if err != nil {
		return fmt.Errorf("decrypt transaction payload: %w", err)
	}

	// Parse the payload to get amount and details
	var txPayload struct {
		Amount     float64 `json:"amount"`
		Category   string  `json:"category,omitempty"`
		Notes      string  `json:"notes,omitempty"`
		Commission float64 `json:"commission,omitempty"`
	}
	if err := json.Unmarshal(payloadJSON, &txPayload); err != nil {
		return fmt.Errorf("parse transaction payload: %w", err)
	}

	amount := txPayload.Amount
	if amount < 0 {
		amount = -amount // Ensure positive amount for the income side
	}

	// Look up the sender's info
	senderUser, err := s.UserRepo.FindByID(ctx, inv.InvitedBy)
	if err != nil {
		return fmt.Errorf("lookup sender: %w", err)
	}
	if senderUser == nil {
		return fmt.Errorf("sender not found")
	}

	// Get receiver's public key
	receiverPubKey, err := s.UserRepo.PublicKeyByEmail(ctx, inv.InvitedEmail)
	if err != nil || receiverPubKey == "" {
		return fmt.Errorf("get receiver public key: %w", err)
	}
	receiverPubKeyBytes, err := base64.StdEncoding.DecodeString(receiverPubKey)
	if err != nil {
		return fmt.Errorf("decode receiver public key: %w", err)
	}

	// Build income payload for the receiver (no category — they categorize it)
	incomePayload := map[string]interface{}{
		"amount":       amount,
		"notes":        txPayload.Notes,
		"counterparty": senderUser.Email,
		"received_from": inv.InvitedBy,
	}
	incomeJSON, _ := json.Marshal(incomePayload)

	encryptedIncome, err := crypto.EncryptWithPublicKey(incomeJSON, receiverPubKeyBytes)
	if err != nil {
		return fmt.Errorf("encrypt income transaction: %w", err)
	}

	// Look up the original expense transaction to get the time
	originalTx, err := (&repository.TransactionRepository{}).FindByID(ctx, inv.EntityID)
	if err != nil {
		return fmt.Errorf("find original transaction: %w", err)
	}
	txTime := time.Now().UTC()
	if originalTx != nil {
		txTime = originalTx.Time
	}

	now := time.Now().UTC()
	incomeTx := &model.Transaction{
		ID:               uuid.New().String(),
		Time:             txTime,
		AccountID:        targetAccountID,
		CreatedBy:        userID,
		EncryptedPayload: encryptedIncome,
		Version:          1,
		CreatedAt:        now,
		UpdatedAt:        now,
	}

	// Create the income transaction and update balances atomically
	if err := database.WithTx(ctx, func(txCtx context.Context) error {
		if err := (&repository.TransactionRepository{}).Create(txCtx, incomeTx); err != nil {
			return fmt.Errorf("create income transaction: %w", err)
		}

		// Update receiver's account balance with the amount received
		amountCents := int64(amount * 100)

		if err := (&repository.RuleRepository{}).UpdateAccountBalances(txCtx, []repository.BalanceUpdate{
			{AccountID: targetAccountID, Change: amountCents},
		}); err != nil {
			return fmt.Errorf("update balances: %w", err)
		}

		return nil
	}); err != nil {
		return fmt.Errorf("database transaction: %w", err)
	}

	// Mark invitation as accepted
	if err := s.InvitationRepo.UpdateStatus(ctx, invitationID, "accepted"); err != nil {
		return fmt.Errorf("update invitation status: %w", err)
	}

	// Notify the sender
	s.notifyInviter(ctx, inv.InvitedBy, "transfer_completed",
		"Transfer Completed",
		fmt.Sprintf("Your transfer of %.2f has been accepted by the recipient.", amount),
		inv.ID, inv.EntityID, targetAccountID)

	return nil
}

// AcceptAccountInvitation handles accepting an account invitation.
func (s *InvitationService) AcceptAccountInvitation(ctx context.Context, invitationID, userID string) error {
	inv, err := s.InvitationRepo.FindByID(ctx, invitationID)
	if err != nil {
		return fmt.Errorf("find invitation: %w", err)
	}
	if inv == nil {
		return fmt.Errorf("invitation not found")
	}
	if inv.Status != "pending" {
		return fmt.Errorf("invitation is not pending")
	}
	if !s.invitationBelongsToUser(ctx, inv, userID) {
		return fmt.Errorf("this invitation is not for you")
	}

	if inv.EncryptedData == nil {
		return fmt.Errorf("invitation has no encrypted account key")
	}

	// Get invitee's public key
	inviteePubKey, err := s.UserRepo.PublicKeyByEmail(ctx, inv.InvitedEmail)
	if err != nil {
		return fmt.Errorf("get invitee public key: %w", err)
	}
	if inviteePubKey == "" {
		return fmt.Errorf("invitee has no public key")
	}

	// Decrypt the account key using server's private key
	decrypted, err := crypto.DecryptWithPrivateKey(*inv.EncryptedData, s.serverPrivateKey)
	if err != nil {
		return fmt.Errorf("decrypt account key: %w", err)
	}

	// The encrypted data was JSON: {"account_key": "base64..."}
	var accountKeyData struct {
		AccountKey string `json:"account_key"`
	}
	if err := json.Unmarshal(decrypted, &accountKeyData); err != nil {
		// Fallback: assume the raw decrypted data IS the account key
		accountKeyData.AccountKey = string(decrypted)
	}

	if accountKeyData.AccountKey == "" {
		return fmt.Errorf("decrypted account key is empty")
	}

	// Re-encrypt with invitee's public key using ECIES.
	// Store in the format expected by the client's decryptAccountKeyForRecipient,
	// which is: base64(ephemeralPub) + ":" + base64(iv(12) || ciphertext)
	inviteePubKeyBytes, err := base64.StdEncoding.DecodeString(inviteePubKey)
	if err != nil {
		return fmt.Errorf("decode invitee public key: %w", err)
	}

	// Use the ECIES encrypt function and convert to legacy format
	eciesResult, err := crypto.EncryptWithPublicKey([]byte(accountKeyData.AccountKey), inviteePubKeyBytes)
	if err != nil {
		return fmt.Errorf("re-encrypt account key: %w", err)
	}

	// Convert ECIES "1|base64(all)" format to legacy "ephemeralPub:ciphertext" format
	rawPart := strings.TrimPrefix(eciesResult, crypto.ECIESPrefixV1)
	decoded, err := base64.StdEncoding.DecodeString(rawPart)
	if err != nil {
		return fmt.Errorf("decode ecies result: %w", err)
	}
	// Format: ephemeralPub(32) || iv(12) || ciphertext
	ephemeralPub := decoded[:32]
	ivAndCiphertext := decoded[32:]
	encryptedForKey := base64.StdEncoding.EncodeToString(ephemeralPub) + ":" + base64.StdEncoding.EncodeToString(ivAndCiphertext)

	// Create the account user record
	now := time.Now().UTC()
	au := &model.AccountUser{
		AccountID:           inv.EntityID,
		UserID:              userID,
		EncryptedAccountKey: encryptedForKey,
		Role:                "member",
		Status:              "active",
		JoinedAt:            now,
	}
	if err := s.AccountUserRepo.Create(ctx, au); err != nil {
		return fmt.Errorf("create account user: %w", err)
	}

	// Mark invitation as accepted
	if err := s.InvitationRepo.UpdateStatus(ctx, invitationID, "accepted"); err != nil {
		return fmt.Errorf("update invitation status: %w", err)
	}

	// Notify the inviter
	s.notifyInviter(ctx, inv.InvitedBy, "invitation_accepted",
		"Account Invitation Accepted",
		fmt.Sprintf("Your account invitation has been accepted."),
		inv.ID, inv.EntityID, "")

	return nil
}

// DeclineInvitation handles declining any invitation.
func (s *InvitationService) DeclineInvitation(ctx context.Context, invitationID, userID string) error {
	inv, err := s.InvitationRepo.FindByID(ctx, invitationID)
	if err != nil {
		return fmt.Errorf("find invitation: %w", err)
	}
	if inv == nil {
		return fmt.Errorf("invitation not found")
	}
	if inv.Status != "pending" {
		return fmt.Errorf("invitation is not pending")
	}
	if !s.invitationBelongsToUser(ctx, inv, userID) {
		return fmt.Errorf("this invitation is not for you")
	}

	// If it's a rule invitation, delete the rule
	if inv.EntityType == "rule" {
		if err := s.RuleRepo.Delete(ctx, inv.EntityID); err != nil {
			return fmt.Errorf("delete rule: %w", err)
		}
	}

	// Mark invitation as declined
	if err := s.InvitationRepo.UpdateStatus(ctx, invitationID, "declined"); err != nil {
		return fmt.Errorf("update invitation status: %w", err)
	}

	// Notify the inviter
	s.notifyInviter(ctx, inv.InvitedBy, "invitation_declined",
		"Invitation Declined",
		fmt.Sprintf("Your invitation has been declined."),
		inv.ID, inv.EntityID, "")

	return nil
}

// ProcessExpiredInvitations finds and handles expired pending invitations.
func (s *InvitationService) ProcessExpiredInvitations(ctx context.Context) {
	now := time.Now().UTC()
	expired, err := s.InvitationRepo.FindExpired(ctx, now)
	if err != nil {
		logger.Error("Failed to find expired invitations: %v", err)
		return
	}

	for _, inv := range expired {
		if err := s.handleExpiredInvitation(ctx, inv); err != nil {
			logger.Error("Failed to handle expired invitation %s: %v", inv.ID, err)
		}
	}
}

func (s *InvitationService) handleExpiredInvitation(ctx context.Context, inv *model.Invitation) error {
	// If it's a rule invitation, delete the rule
	if inv.EntityType == "rule" {
		if err := s.RuleRepo.Delete(ctx, inv.EntityID); err != nil {
			return fmt.Errorf("delete expired rule: %w", err)
		}
	}

	// Mark invitation as expired
	if err := s.InvitationRepo.UpdateStatus(ctx, inv.ID, "expired"); err != nil {
		return fmt.Errorf("mark invitation expired: %w", err)
	}

	// Notify the inviter via notification
	s.notifyInviter(ctx, inv.InvitedBy, "invitation_expired",
		"Invitation Expired",
		fmt.Sprintf("Your invitation to %s has expired after 30 days.", inv.InvitedEmail),
		inv.ID, inv.EntityID, "")

	// Send email to inviter
	s.sendExpiryNotificationEmail(ctx, inv.InvitedBy, inv.InvitedEmail)

	return nil
}

// invitationBelongsToUser checks if an invitation belongs to a given user.
// First checks by user ID, then falls back to email match (for users who
// registered after the invitation was created and LinkInvitationsToUser
// hasn't been called yet).
func (s *InvitationService) invitationBelongsToUser(ctx context.Context, inv *model.Invitation, userID string) bool {
	if inv.InvitedUserID != nil && *inv.InvitedUserID == userID {
		return true
	}

	// Fallback: check by email
	user, err := s.UserRepo.FindByID(ctx, userID)
	if err != nil || user == nil {
		return false
	}
	return user.Email == inv.InvitedEmail
}

func (s *InvitationService) notifyInviter(ctx context.Context, inviterID, notifType, title, body, invitationID, entityID, accountID string) {
	data, _ := json.Marshal(model.NotificationData{
		InvitationID: invitationID,
		RuleID:       entityID,
		AccountID:    accountID,
	})
	dataStr := string(data)
	if err := s.NotificationRepo.CreateNotification(ctx, inviterID,
		notifType, title, body, &dataStr); err != nil {
		logger.Error("Failed to create notification for inviter: %v", err)
	}
}

func (s *InvitationService) sendInvitationEmail(ctx context.Context, toEmail, entityType, entityID string, isVerified bool) {
	subject := fmt.Sprintf("Budgeteer: You have a pending %s invitation", entityType)
	body := fmt.Sprintf("You have been invited to a %s on Budgeteer.\n\n", entityType)
	body += fmt.Sprintf("Log in to view and accept your invitation: %s/notifications\n", s.BaseURL)

	email := &model.EmailOutbox{
		ID:           uuid.New().String(),
		ToAddress:    toEmail,
		Subject:      subject,
		Body:         body,
		Status:       "pending",
		RetryCount:   0,
		ScheduledFor: time.Now().UTC(),
		CreatedAt:    time.Now().UTC(),
	}
	if err := s.EmailRepo.Create(ctx, email); err != nil {
		logger.Error("Failed to queue invitation email: %v", err)
	}
}

func (s *InvitationService) sendSubscriptionEmail(ctx context.Context, toEmail, entityType, entityID string) {
	subject := fmt.Sprintf("Budgeteer: You've been invited to join")
	body := fmt.Sprintf("Someone invited you to a %s on Budgeteer.\n\n", entityType)
	body += fmt.Sprintf("Create an account to accept: %s/register\n", s.BaseURL)

	email := &model.EmailOutbox{
		ID:           uuid.New().String(),
		ToAddress:    toEmail,
		Subject:      subject,
		Body:         body,
		Status:       "pending",
		RetryCount:   0,
		ScheduledFor: time.Now().UTC(),
		CreatedAt:    time.Now().UTC(),
	}
	if err := s.EmailRepo.Create(ctx, email); err != nil {
		logger.Error("Failed to queue subscription email: %v", err)
	}
}

func (s *InvitationService) sendExpiryNotificationEmail(ctx context.Context, inviterID, invitedEmail string) {
	// Get inviter's email
	inviter, err := s.UserRepo.FindByID(ctx, inviterID)
	if err != nil || inviter == nil {
		logger.Error("Failed to find inviter for expiry notification: %v", err)
		return
	}

	subject := "Budgeteer: Invitation expired"
	body := fmt.Sprintf("Your invitation to %s has expired after 30 days.", invitedEmail)

	email := &model.EmailOutbox{
		ID:           uuid.New().String(),
		ToAddress:    inviter.Email,
		Subject:      subject,
		Body:         body,
		Status:       "pending",
		RetryCount:   0,
		ScheduledFor: time.Now().UTC(),
		CreatedAt:    time.Now().UTC(),
	}
	if err := s.EmailRepo.Create(ctx, email); err != nil {
		logger.Error("Failed to queue expiry email: %v", err)
	}
}

// FindInvitation looks up an invitation by ID.
func (s *InvitationService) FindInvitation(ctx context.Context, id string) (*model.Invitation, error) {
	return s.InvitationRepo.FindByID(ctx, id)
}

// FindInvitationByEntity looks up an invitation by entity type and ID.
func (s *InvitationService) FindInvitationByEntity(ctx context.Context, entityType, entityID string) (*model.Invitation, error) {
	return s.InvitationRepo.FindByEntity(ctx, entityType, entityID)
}

// GetPendingInvitations returns all pending invitations for a user (by user ID or email).
func (s *InvitationService) GetPendingInvitations(ctx context.Context, userID string) ([]*model.Invitation, error) {
	inv, err := s.InvitationRepo.FindPendingByUserID(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("find pending invitations: %w", err)
	}

	// Also find invitations by email in case the user was invited before they registered
	user, err := s.UserRepo.FindByID(ctx, userID)
	if err != nil || user == nil {
		return inv, nil
	}

	emailInvs, err := s.InvitationRepo.FindPendingByEmail(ctx, user.Email)
	if err != nil {
		logger.Error("Failed to find pending invitations by email: %v", err)
		return inv, nil
	}

	// Merge, avoiding duplicates
	seen := make(map[string]bool)
	for _, i := range inv {
		seen[i.ID] = true
	}
	for _, i := range emailInvs {
		if !seen[i.ID] {
			inv = append(inv, i)
			seen[i.ID] = true
		}
	}

	return inv, nil
}

// LinkInvitationsToUser links all pending invitations for an email to a newly registered user.
func (s *InvitationService) LinkInvitationsToUser(ctx context.Context, email, userID string) error {
	pending, err := s.InvitationRepo.FindPendingByEmail(ctx, email)
	if err != nil {
		return fmt.Errorf("find pending invitations: %w", err)
	}

	for _, inv := range pending {
		if err := s.InvitationRepo.UpdateInvitedUserID(ctx, inv.ID, userID); err != nil {
			logger.Error("Failed to link invitation %s to user %s: %v", inv.ID, userID, err)
			continue
		}

		// Create notification for the new user
		entityLabel := inv.EntityType
		data, _ := json.Marshal(model.NotificationData{
			InvitationID: inv.ID,
			RuleID:       inv.EntityID,
			AccountID:    inv.EntityID,
		})
		dataStr := string(data)
		if err := s.NotificationRepo.CreateNotification(ctx, userID,
			inv.EntityType+"_invitation",
			fmt.Sprintf("Pending %s Invitation", entityLabel),
			fmt.Sprintf("You have a pending %s invitation waiting for you.", entityLabel),
			&dataStr); err != nil {
			logger.Error("Failed to create notification: %v", err)
		}
	}

	return nil
}
