package service

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"time"

	"budgeteer-backend/internal/config"
	"budgeteer-backend/internal/crypto"
	"budgeteer-backend/internal/database"
	"budgeteer-backend/internal/logger"
	"budgeteer-backend/internal/model"
	"budgeteer-backend/internal/repository"

	"github.com/google/uuid"
)

type RuleService struct {
	RuleRepo         *repository.RuleRepository
	ServerPrivateKey []byte // raw X25519 private key (exported for invitation service)
	ServerPublicKey  []byte // raw X25519 public key (exported for invitation service)
}

var Rules *RuleService

func InitRuleService() {
	if config.Cfg == nil {
		logger.Warning("Config not loaded — rules service not available")
		Rules = &RuleService{
			RuleRepo: &repository.RuleRepository{},
		}
		return
	}
	privKeyB64 := config.Cfg.ServerEncryptionKey
	if privKeyB64 == "" {
		logger.Warning("Server encryption key not configured — rules will not work")
		Rules = &RuleService{
			RuleRepo: &repository.RuleRepository{},
		}
		return
	}

	privKey, err := base64.StdEncoding.DecodeString(privKeyB64)
	if err != nil {
		logger.Error("Failed to decode server encryption key: %v", err)
		Rules = &RuleService{
			RuleRepo: &repository.RuleRepository{},
		}
		return
	}

	pubKey, err := crypto.PublicKeyFromPrivate(privKey)
	if err != nil {
		logger.Error("Failed to derive server public key: %v", err)
		Rules = &RuleService{
			RuleRepo: &repository.RuleRepository{},
		}
		return
	}

	Rules = &RuleService{
		RuleRepo:         &repository.RuleRepository{},
		ServerPrivateKey: privKey,
		ServerPublicKey:  pubKey,
	}
	logger.Info("Rule service initialized with server encryption key")
}

// ServerPublicKeyString returns the server's X25519 public key as base64.
func (s *RuleService) ServerPublicKeyString() string {
	if s.ServerPublicKey == nil {
		return ""
	}
	return base64.StdEncoding.EncodeToString(s.ServerPublicKey)
}

// CreateRule creates a new rule.
func (s *RuleService) CreateRule(ctx context.Context, userID string, req *model.CreateRuleRequest) (*model.Rule, error) {
	now := time.Now().UTC()

	nextOccurrence, err := time.Parse(time.RFC3339, req.NextOccurrence)
	if err != nil {
		return nil, fmt.Errorf("invalid next_occurrence: %w", err)
	}

	var endDate *time.Time
	if req.EndDate != "" {
		t, err := time.Parse(time.RFC3339, req.EndDate)
		if err != nil {
			return nil, fmt.Errorf("invalid end_date: %w", err)
		}
		endDate = &t
	}

	// Determine rule type by decrypting the payload
	ruleType := "payment" // default
	var targetEmail *string
	status := "active"

	if s.ServerPrivateKey != nil && req.TargetEmail != "" {
		// Decrypt the payload to check if it's a user_transfer
		payloadJSON, err := crypto.DecryptWithPrivateKey(req.EncryptedPayload, s.ServerPrivateKey)
		if err == nil {
			var payload model.RulePayload
			if err := json.Unmarshal(payloadJSON, &payload); err == nil {
				ruleType = payload.Type
				if payload.Type == "user_transfer" {
					targetEmail = &req.TargetEmail
					status = "pending_accepted"
				}
			}
		}
	}

	if req.TargetEmail != "" && ruleType != "user_transfer" {
		return nil, fmt.Errorf("target_email is only valid for user_transfer rules")
	}

	rule := &model.Rule{
		ID:               uuid.New().String(),
		CreatedBy:        userID,
		Name:             req.Name,
		EncryptedPayload: req.EncryptedPayload,
		Frequency:        req.Frequency,
		NextOccurrence:   nextOccurrence,
		EndDate:          endDate,
		MaxOccurrences:   req.MaxOccurrences,
		OccurrencesSoFar: 0,
		IsActive:         true,
		Status:           status,
		TargetEmail:      targetEmail,
		AlertOffset:      req.AlertOffset,
		CreatedAt:        now,
		UpdatedAt:        now,
	}

	if err := s.RuleRepo.Create(ctx, rule); err != nil {
		return nil, fmt.Errorf("create rule: %w", err)
	}

	// If this is a user_transfer rule with a target email, create the invitation
	if targetEmail != nil && Invitations != nil {
		if err := Invitations.CreateRuleInvitation(ctx, rule.ID, userID, *targetEmail); err != nil {
			logger.Error("Failed to create rule invitation: %v", err)
			// Don't fail the rule creation — the rule is created as pending_accepted
			// and can be retried later
		}
	}

	return rule, nil
}

// ListRules returns all rules for a user.
func (s *RuleService) ListRules(ctx context.Context, userID string) ([]*model.Rule, error) {
	return s.RuleRepo.ListByUserID(ctx, userID)
}

// UpdateRule updates a rule.
func (s *RuleService) UpdateRule(ctx context.Context, ruleID, userID string, req *model.UpdateRuleRequest) (*model.Rule, error) {
	rule, err := s.RuleRepo.FindByID(ctx, ruleID)
	if err != nil {
		return nil, fmt.Errorf("find rule: %w", err)
	}
	if rule == nil {
		return nil, errors.New("rule not found")
	}
	if rule.CreatedBy != userID {
		return nil, errors.New("unauthorized")
	}

	if req.Name != nil {
		rule.Name = *req.Name
	}
	if req.EncryptedPayload != nil {
		rule.EncryptedPayload = *req.EncryptedPayload
	}
	if req.Frequency != nil {
		rule.Frequency = *req.Frequency
	}
	if req.NextOccurrence != nil {
		t, err := time.Parse(time.RFC3339, *req.NextOccurrence)
		if err != nil {
			return nil, fmt.Errorf("invalid next_occurrence: %w", err)
		}
		rule.NextOccurrence = t
	}
	if req.EndDate != nil {
		if *req.EndDate == "" {
			rule.EndDate = nil
		} else {
			t, err := time.Parse(time.RFC3339, *req.EndDate)
			if err != nil {
				return nil, fmt.Errorf("invalid end_date: %w", err)
			}
			rule.EndDate = &t
		}
	}
	if req.MaxOccurrences != nil {
		rule.MaxOccurrences = req.MaxOccurrences
	}
	if req.IsActive != nil {
		rule.IsActive = *req.IsActive
	}
	if req.AlertOffset != nil {
		if *req.AlertOffset == "" {
			rule.AlertOffset = nil
		} else {
			rule.AlertOffset = req.AlertOffset
		}
	}
	rule.UpdatedAt = time.Now().UTC()

	if err := s.RuleRepo.Update(ctx, rule); err != nil {
		return nil, fmt.Errorf("update rule: %w", err)
	}
	return rule, nil
}

// DeleteRule deletes a rule.
func (s *RuleService) DeleteRule(ctx context.Context, ruleID, userID string) error {
	rule, err := s.RuleRepo.FindByID(ctx, ruleID)
	if err != nil {
		return fmt.Errorf("find rule: %w", err)
	}
	if rule == nil {
		return errors.New("rule not found")
	}
	if rule.CreatedBy != userID {
		return errors.New("unauthorized")
	}
	return s.RuleRepo.Delete(ctx, ruleID)
}

// ProcessDueRules is called by the scheduler. It finds all due rules and
// executes them atomically.
func (s *RuleService) ProcessDueRules(ctx context.Context) {
	if s.ServerPrivateKey == nil {
		logger.Warning("Rule service not initialized — skipping rule processing")
		return
	}

	now := time.Now().UTC()
	rules, err := s.RuleRepo.FindDueRules(ctx, now)
	if err != nil {
		logger.Error("Failed to find due rules: %v", err)
		return
	}

	for _, rule := range rules {
		if err := s.executeRule(ctx, rule, now); err != nil {
			logger.Error("Failed to execute rule %s (%s): %v", rule.ID, rule.Name, err)
			// Continue with next rule
		}
	}
}

func (s *RuleService) executeRule(ctx context.Context, rule *model.Rule, now time.Time) error {
	// Decrypt rule payload
	payloadJSON, err := crypto.DecryptWithPrivateKey(rule.EncryptedPayload, s.ServerPrivateKey)
	if err != nil {
		return fmt.Errorf("decrypt rule payload: %w", err)
	}

	var payload model.RulePayload
	if err := json.Unmarshal(payloadJSON, &payload); err != nil {
		return fmt.Errorf("unmarshal rule payload: %w", err)
	}

	// Validate payload
	if payload.SourceAccountID == "" {
		return errors.New("invalid rule payload: missing source_account_id")
	}
	if payload.Type != "mortgage" && payload.Amount <= 0 {
		return errors.New("invalid rule payload: amount must be positive")
	}
	// For mortgages, validate mortgage-specific fields
	if payload.Type == "mortgage" {
		if payload.MortgageTotalAmount <= 0 || payload.MortgageInterestRate < 0 ||
			payload.MortgageTermMonths <= 0 || payload.MortgagePaymentDay < 1 || payload.MortgagePaymentDay > 28 ||
			(payload.MortgageAmortizationType != "french" && payload.MortgageAmortizationType != "italian") {
			return errors.New("invalid mortgage payload: missing or invalid mortgage fields")
		}
		// Initialize remaining_balance if first execution
		if payload.MortgageRemainingBalance <= 0 {
			payload.MortgageRemainingBalance = payload.MortgageTotalAmount
		}
	}

	switch payload.Type {
	case "payment":
		return s.executePayment(ctx, rule, &payload, now)
	case "income":
		return s.executeIncome(ctx, rule, &payload, now)
	case "transfer":
		return s.executeTransfer(ctx, rule, &payload, now)
	case "user_transfer":
		return s.executeUserTransfer(ctx, rule, &payload, now)
	case "mortgage":
		return s.executeMortgage(ctx, rule, &payload, now)
	default:
		return fmt.Errorf("unknown rule type: %s", payload.Type)
	}
}

func (s *RuleService) executePayment(ctx context.Context, rule *model.Rule, payload *model.RulePayload, now time.Time) error {
	sourceCurrency, err := s.RuleRepo.GetAccountCurrency(ctx, payload.SourceAccountID)
	if err != nil {
		return fmt.Errorf("get source currency: %w", err)
	}
	if sourceCurrency == "" {
		return errors.New("source account not found")
	}

	amountCents := int64(math.Round(payload.Amount * 100))
	commissionCents := int64(math.Round(payload.Commission * 100))
	totalCents := amountCents + commissionCents

	// Get user's public key
	userPubKey, err := s.RuleRepo.GetUserPublicKey(ctx, rule.CreatedBy)
	if err != nil {
		return fmt.Errorf("get user public key: %w", err)
	}
	if userPubKey == "" {
		return errors.New("user not found")
	}
	userPubKeyBytes, err := base64.StdEncoding.DecodeString(userPubKey)
	if err != nil {
		return fmt.Errorf("decode user public key: %w", err)
	}

	// Build transaction payload
	txPayload := map[string]interface{}{
		"amount":       -payload.Amount, // expense
		"category":     payload.CategoryID,
		"commission":   payload.Commission,
		"notes":        payload.Notes,
		"counterparty": payload.Counterparty,
		"rule_id":      rule.ID,
	}
	txPayloadJSON, _ := json.Marshal(txPayload)

	// Encrypt with user's public key
	encryptedPayload, err := crypto.EncryptWithPublicKey(txPayloadJSON, userPubKeyBytes)
	if err != nil {
		return fmt.Errorf("encrypt transaction payload: %w", err)
	}

	txTime := rule.NextOccurrence

	tx := &model.Transaction{
		ID:               uuid.New().String(),
		Time:             txTime,
		AccountID:        payload.SourceAccountID,
		CreatedBy:        rule.CreatedBy,
		EncryptedPayload: encryptedPayload,
		Version:          1,
		CreatedAt:        now,
		UpdatedAt:        now,
	}

	// All database operations in a transaction

	// Use a pool-level transaction for atomicity
	txErr := database.WithTx(ctx, func(txCtx context.Context) error {
		// Insert the transaction
		if err := s.RuleRepo.InsertRuleTransaction(txCtx, tx); err != nil {
			return fmt.Errorf("insert transaction: %w", err)
		}

		// Update balance (negative for expense, includes commission)
		if err := s.RuleRepo.UpdateAccountBalances(txCtx, []repository.BalanceUpdate{
			{AccountID: payload.SourceAccountID, Change: -totalCents},
		}); err != nil {
			return fmt.Errorf("update balance: %w", err)
		}

		// Update rule's next occurrence
		next := computeNextOccurrence(rule.Frequency, rule.NextOccurrence)
		if _, err := s.RuleRepo.UpdateNextOccurrence(txCtx, rule.ID, next, now); err != nil {
			return fmt.Errorf("update next occurrence: %w", err)
		}

		// Deactivate if max_occurrences or end_date reached
		if rule.MaxOccurrences != nil && rule.OccurrencesSoFar+1 >= *rule.MaxOccurrences {
			if err := s.RuleRepo.DeactivateRule(txCtx, rule.ID); err != nil {
				return fmt.Errorf("deactivate rule: %w", err)
			}
		}
		if rule.EndDate != nil && next.After(*rule.EndDate) {
			if err := s.RuleRepo.DeactivateRule(txCtx, rule.ID); err != nil {
				return fmt.Errorf("deactivate rule: %w", err)
			}
		}

		return nil
	})

	if txErr != nil {
		return txErr
	}

	logger.Info("Rule %s (%s) executed: payment of %.2f from account %s",
		rule.ID, rule.Name, payload.Amount, payload.SourceAccountID)
	return nil
}

func (s *RuleService) executeIncome(ctx context.Context, rule *model.Rule, payload *model.RulePayload, now time.Time) error {
	sourceCurrency, err := s.RuleRepo.GetAccountCurrency(ctx, payload.SourceAccountID)
	if err != nil {
		return fmt.Errorf("get source currency: %w", err)
	}
	if sourceCurrency == "" {
		return errors.New("account not found")
	}

	amountCents := int64(math.Round(payload.Amount * 100))
	commissionCents := int64(math.Round(payload.Commission * 100))
	// For income, commission reduces the amount received
	totalCents := amountCents - commissionCents
	if totalCents < 0 {
		totalCents = 0
	}

	// Get user's public key
	userPubKey, err := s.RuleRepo.GetUserPublicKey(ctx, rule.CreatedBy)
	if err != nil {
		return fmt.Errorf("get user public key: %w", err)
	}
	if userPubKey == "" {
		return errors.New("user not found")
	}
	userPubKeyBytes, err := base64.StdEncoding.DecodeString(userPubKey)
	if err != nil {
		return fmt.Errorf("decode user public key: %w", err)
	}

	// Build transaction payload
	txPayload := map[string]interface{}{
		"amount":       payload.Amount, // income (positive)
		"category":     payload.CategoryID,
		"commission":   payload.Commission,
		"notes":        payload.Notes,
		"counterparty": payload.Counterparty,
		"rule_id":      rule.ID,
	}
	txPayloadJSON, _ := json.Marshal(txPayload)

	// Encrypt with user's public key
	encryptedPayload, err := crypto.EncryptWithPublicKey(txPayloadJSON, userPubKeyBytes)
	if err != nil {
		return fmt.Errorf("encrypt transaction payload: %w", err)
	}

	txTime := rule.NextOccurrence

	tx := &model.Transaction{
		ID:               uuid.New().String(),
		Time:             txTime,
		AccountID:        payload.SourceAccountID,
		CreatedBy:        rule.CreatedBy,
		EncryptedPayload: encryptedPayload,
		Version:          1,
		CreatedAt:        now,
		UpdatedAt:        now,
	}

	txErr := database.WithTx(ctx, func(txCtx context.Context) error {
		if err := s.RuleRepo.InsertRuleTransaction(txCtx, tx); err != nil {
			return fmt.Errorf("insert transaction: %w", err)
		}

		// Update balance (positive for income, net of commission)
		if err := s.RuleRepo.UpdateAccountBalances(txCtx, []repository.BalanceUpdate{
			{AccountID: payload.SourceAccountID, Change: totalCents},
		}); err != nil {
			return fmt.Errorf("update balance: %w", err)
		}

		next := computeNextOccurrence(rule.Frequency, rule.NextOccurrence)
		if _, err := s.RuleRepo.UpdateNextOccurrence(txCtx, rule.ID, next, now); err != nil {
			return fmt.Errorf("update next occurrence: %w", err)
		}

		if rule.MaxOccurrences != nil && rule.OccurrencesSoFar+1 >= *rule.MaxOccurrences {
			if err := s.RuleRepo.DeactivateRule(txCtx, rule.ID); err != nil {
				return fmt.Errorf("deactivate rule: %w", err)
			}
		}
		if rule.EndDate != nil && next.After(*rule.EndDate) {
			if err := s.RuleRepo.DeactivateRule(txCtx, rule.ID); err != nil {
				return fmt.Errorf("deactivate rule: %w", err)
			}
		}

		return nil
	})

	if txErr != nil {
		return txErr
	}

	logger.Info("Rule %s (%s) executed: income of %.2f to account %s",
		rule.ID, rule.Name, payload.Amount, payload.SourceAccountID)
	return nil
}

func (s *RuleService) executeTransfer(ctx context.Context, rule *model.Rule, payload *model.RulePayload, now time.Time) error {
	if payload.TargetAccountID == "" {
		return errors.New("transfer rule missing target_account_id")
	}

	// Check currencies match
	srcCurrency, err := s.RuleRepo.GetAccountCurrency(ctx, payload.SourceAccountID)
	if err != nil {
		return fmt.Errorf("get source currency: %w", err)
	}
	tgtCurrency, err := s.RuleRepo.GetAccountCurrency(ctx, payload.TargetAccountID)
	if err != nil {
		return fmt.Errorf("get target currency: %w", err)
	}
	if srcCurrency == "" || tgtCurrency == "" {
		return errors.New("account not found")
	}
	if srcCurrency != tgtCurrency {
		return errors.New("currency mismatch between accounts")
	}

	amountCents := int64(math.Round(payload.Amount * 100))
	commissionCents := int64(math.Round(payload.Commission * 100))
	totalCents := amountCents + commissionCents

	// Get user's public key
	userPubKey, err := s.RuleRepo.GetUserPublicKey(ctx, rule.CreatedBy)
	if err != nil {
		return fmt.Errorf("get user public key: %w", err)
	}
	if userPubKey == "" {
		return errors.New("user not found")
	}
	userPubKeyBytes, err := base64.StdEncoding.DecodeString(userPubKey)
	if err != nil {
		return fmt.Errorf("decode user public key: %w", err)
	}

	// Build transaction payloads with human-readable counterparty (rule name)
	expensePayload := map[string]interface{}{
		"amount":       -payload.Amount,
		"category":     payload.CategoryID,
		"commission":   payload.Commission,
		"notes":        payload.Notes,
		"counterparty": rule.Name,
		"rule_id":      rule.ID,
	}
	incomePayload := map[string]interface{}{
		"amount":       payload.Amount,
		"category":     payload.CategoryID,
		"commission":   payload.Commission,
		"notes":        payload.Notes,
		"counterparty": rule.Name,
		"rule_id":      rule.ID,
	}

	expenseJSON, _ := json.Marshal(expensePayload)
	incomeJSON, _ := json.Marshal(incomePayload)

	encryptedExpense, err := crypto.EncryptWithPublicKey(expenseJSON, userPubKeyBytes)
	if err != nil {
		return fmt.Errorf("encrypt expense: %w", err)
	}
	encryptedIncome, err := crypto.EncryptWithPublicKey(incomeJSON, userPubKeyBytes)
	if err != nil {
		return fmt.Errorf("encrypt income: %w", err)
	}

	txTime := rule.NextOccurrence

	expenseTx := &model.Transaction{
		ID:               uuid.New().String(),
		Time:             txTime,
		AccountID:        payload.SourceAccountID,
		CreatedBy:        rule.CreatedBy,
		EncryptedPayload: encryptedExpense,
		Version:          1,
		CreatedAt:        now,
		UpdatedAt:        now,
	}
	incomeTx := &model.Transaction{
		ID:               uuid.New().String(),
		Time:             txTime,
		AccountID:        payload.TargetAccountID,
		CreatedBy:        rule.CreatedBy,
		EncryptedPayload: encryptedIncome,
		Version:          1,
		CreatedAt:        now,
		UpdatedAt:        now,
	}

	txErr := database.WithTx(ctx, func(txCtx context.Context) error {
		if err := s.RuleRepo.InsertRuleTransaction(txCtx, expenseTx); err != nil {
			return fmt.Errorf("insert expense tx: %w", err)
		}
		if err := s.RuleRepo.InsertRuleTransaction(txCtx, incomeTx); err != nil {
			return fmt.Errorf("insert income tx: %w", err)
		}

		if err := s.RuleRepo.UpdateAccountBalances(txCtx, []repository.BalanceUpdate{
			{AccountID: payload.SourceAccountID, Change: -totalCents},
			{AccountID: payload.TargetAccountID, Change: amountCents},
		}); err != nil {
			return fmt.Errorf("update balances: %w", err)
		}

		next := computeNextOccurrence(rule.Frequency, rule.NextOccurrence)
		if _, err := s.RuleRepo.UpdateNextOccurrence(txCtx, rule.ID, next, now); err != nil {
			return fmt.Errorf("update next occurrence: %w", err)
		}

		if rule.MaxOccurrences != nil && rule.OccurrencesSoFar+1 >= *rule.MaxOccurrences {
			if err := s.RuleRepo.DeactivateRule(txCtx, rule.ID); err != nil {
				return fmt.Errorf("deactivate rule: %w", err)
			}
		}
		if rule.EndDate != nil && next.After(*rule.EndDate) {
			if err := s.RuleRepo.DeactivateRule(txCtx, rule.ID); err != nil {
				return fmt.Errorf("deactivate rule: %w", err)
			}
		}

		return nil
	})

	if txErr != nil {
		return txErr
	}

	logger.Info("Rule %s (%s) executed: transfer of %.2f from %s to %s",
		rule.ID, rule.Name, payload.Amount, payload.SourceAccountID, payload.TargetAccountID)
	return nil
}

func (s *RuleService) executeUserTransfer(ctx context.Context, rule *model.Rule, payload *model.RulePayload, now time.Time) error {
	// For user_transfer rules, the target_account_id may be in the encrypted payload
	// (legacy format) or in the rule's target_account_encrypted field (receiver-chosen).
	targetAccountID := payload.TargetAccountID

	if targetAccountID == "" && rule.TargetAccountEncrypted != nil && *rule.TargetAccountEncrypted != "" {
		// Decrypt the receiver's chosen account using the server's private key.
		// The encrypted data is JSON: {"account_id": "..."} stored by the frontend.
		decrypted, err := crypto.DecryptWithPrivateKey(*rule.TargetAccountEncrypted, s.ServerPrivateKey)
		if err != nil {
			return fmt.Errorf("decrypt target account: %w", err)
		}
		// Try to parse as JSON first (modern format)
		var targetAcct struct {
			AccountID string `json:"account_id"`
		}
		if err := json.Unmarshal(decrypted, &targetAcct); err == nil && targetAcct.AccountID != "" {
			targetAccountID = targetAcct.AccountID
		} else {
			// Fallback: assume raw decrypted data IS the account ID (legacy format)
			targetAccountID = string(decrypted)
		}
	}

	// For user_transfer rules created via invitation, the target_user_id
	// may not be in the encrypted payload. Look it up from the invitation.
	targetUserID := payload.TargetUserID
	if targetUserID == "" && Invitations != nil {
		inv, err := Invitations.FindInvitationByEntity(ctx, "rule", rule.ID)
		if err == nil && inv != nil && inv.InvitedUserID != nil {
			targetUserID = *inv.InvitedUserID
		}
	}

	if targetAccountID == "" || targetUserID == "" {
		return errors.New("user_transfer rule missing target_account_id or target_user_id")
	}

	// Check currencies match
	srcCurrency, err := s.RuleRepo.GetAccountCurrency(ctx, payload.SourceAccountID)
	if err != nil {
		return fmt.Errorf("get source currency: %w", err)
	}
	tgtCurrency, err := s.RuleRepo.GetAccountCurrency(ctx, targetAccountID)
	if err != nil {
		return fmt.Errorf("get target currency: %w", err)
	}
	if srcCurrency == "" || tgtCurrency == "" {
		return errors.New("account not found")
	}
	if srcCurrency != tgtCurrency {
		return errors.New("currency mismatch between accounts")
	}

	amountCents := int64(math.Round(payload.Amount * 100))
	commissionCents := int64(math.Round(payload.Commission * 100))
	totalCents := amountCents + commissionCents

	// Get both users' public keys and emails
	senderPubKey, err := s.RuleRepo.GetUserPublicKey(ctx, rule.CreatedBy)
	if err != nil {
		return fmt.Errorf("get sender public key: %w", err)
	}
	receiverPubKey, err := s.RuleRepo.GetUserPublicKey(ctx, targetUserID)
	if err != nil {
		return fmt.Errorf("get receiver public key: %w", err)
	}
	if senderPubKey == "" || receiverPubKey == "" {
		return errors.New("user not found")
	}

	senderEmail, err := s.RuleRepo.GetUserEmail(ctx, rule.CreatedBy)
	if err != nil {
		return fmt.Errorf("get sender email: %w", err)
	}
	receiverEmail, err := s.RuleRepo.GetUserEmail(ctx, targetUserID)
	if err != nil {
		return fmt.Errorf("get receiver email: %w", err)
	}

	senderPubKeyBytes, err := base64.StdEncoding.DecodeString(senderPubKey)
	if err != nil {
		return fmt.Errorf("decode sender public key: %w", err)
	}
	receiverPubKeyBytes, err := base64.StdEncoding.DecodeString(receiverPubKey)
	if err != nil {
		return fmt.Errorf("decode receiver public key: %w", err)
	}

	// Build transaction payloads with human-readable counterparty (email).
	// The expense side gets the rule creator's category and commission; the
	// income side has no category so the receiving user can categorize it.
	expensePayload := map[string]interface{}{
		"amount":       -payload.Amount,
		"category":     payload.CategoryID,
		"commission":   payload.Commission,
		"notes":        payload.Notes,
		"counterparty": receiverEmail,
		"rule_id":      rule.ID,
	}
	incomePayload := map[string]interface{}{
		"amount":       payload.Amount,
		"notes":        payload.Notes,
		"counterparty": senderEmail,
		"rule_id":      rule.ID,
	}

	expenseJSON, _ := json.Marshal(expensePayload)
	incomeJSON, _ := json.Marshal(incomePayload)

	encryptedExpense, err := crypto.EncryptWithPublicKey(expenseJSON, senderPubKeyBytes)
	if err != nil {
		return fmt.Errorf("encrypt expense: %w", err)
	}
	encryptedIncome, err := crypto.EncryptWithPublicKey(incomeJSON, receiverPubKeyBytes)
	if err != nil {
		return fmt.Errorf("encrypt income: %w", err)
	}

	txTime := rule.NextOccurrence

	expenseTx := &model.Transaction{
		ID:               uuid.New().String(),
		Time:             txTime,
		AccountID:        payload.SourceAccountID,
		CreatedBy:        rule.CreatedBy,
		EncryptedPayload: encryptedExpense,
		Version:          1,
		CreatedAt:        now,
		UpdatedAt:        now,
	}
	incomeTx := &model.Transaction{
		ID:               uuid.New().String(),
		Time:             txTime,
		AccountID:        targetAccountID,
		CreatedBy:        rule.CreatedBy,
		EncryptedPayload: encryptedIncome,
		Version:          1,
		CreatedAt:        now,
		UpdatedAt:        now,
	}

	txErr := database.WithTx(ctx, func(txCtx context.Context) error {
		if err := s.RuleRepo.InsertRuleTransaction(txCtx, expenseTx); err != nil {
			return fmt.Errorf("insert expense tx: %w", err)
		}
		if err := s.RuleRepo.InsertRuleTransaction(txCtx, incomeTx); err != nil {
			return fmt.Errorf("insert income tx: %w", err)
		}

		if err := s.RuleRepo.UpdateAccountBalances(txCtx, []repository.BalanceUpdate{
			{AccountID: payload.SourceAccountID, Change: -totalCents},
			{AccountID: targetAccountID, Change: amountCents},
		}); err != nil {
			return fmt.Errorf("update balances: %w", err)
		}

		next := computeNextOccurrence(rule.Frequency, rule.NextOccurrence)
		if _, err := s.RuleRepo.UpdateNextOccurrence(txCtx, rule.ID, next, now); err != nil {
			return fmt.Errorf("update next occurrence: %w", err)
		}

		if rule.MaxOccurrences != nil && rule.OccurrencesSoFar+1 >= *rule.MaxOccurrences {
			if err := s.RuleRepo.DeactivateRule(txCtx, rule.ID); err != nil {
				return fmt.Errorf("deactivate rule: %w", err)
			}
		}
		if rule.EndDate != nil && next.After(*rule.EndDate) {
			if err := s.RuleRepo.DeactivateRule(txCtx, rule.ID); err != nil {
				return fmt.Errorf("deactivate rule: %w", err)
			}
		}

		return nil
	})

	if txErr != nil {
		return txErr
	}

	logger.Info("Rule %s (%s) executed: user transfer of %.2f from %s (user %s) to %s (user %s)",
		rule.ID, rule.Name, payload.Amount,
		payload.SourceAccountID, rule.CreatedBy,
		targetAccountID, targetUserID)
	return nil
}

func (s *RuleService) executeMortgage(ctx context.Context, rule *model.Rule, payload *model.RulePayload, now time.Time) error {
	sourceCurrency, err := s.RuleRepo.GetAccountCurrency(ctx, payload.SourceAccountID)
	if err != nil {
		return fmt.Errorf("get source currency: %w", err)
	}
	if sourceCurrency == "" {
		return errors.New("source account not found")
	}

	// Calculate monthly interest rate (yearly rate in %, convert to decimal monthly)
	monthlyRate := payload.MortgageInterestRate / 100.0 / 12.0
	remainingBalance := payload.MortgageRemainingBalance

	if remainingBalance <= 0 {
		return errors.New("mortgage already paid off")
	}

	n := float64(payload.MortgageTermMonths)
	var paymentAmount, interestPortion, principalPortion float64

	switch payload.MortgageAmortizationType {
	case "italian":
		// Italian amortization: constant principal, decreasing total payment
		principalPerMonth := payload.MortgageTotalAmount / n
		interestPortion = remainingBalance * monthlyRate
		paymentAmount = principalPerMonth + interestPortion
		principalPortion = principalPerMonth
	default: // "french"
		// French amortization: fixed total payment each month
		if monthlyRate > 0 {
			// Standard amortization formula: P * (r * (1+r)^n) / ((1+r)^n - 1)
			compound := math.Pow(1+monthlyRate, n)
			paymentAmount = payload.MortgageTotalAmount * (monthlyRate * compound) / (compound - 1)
		} else {
			// 0% interest — split evenly
			paymentAmount = payload.MortgageTotalAmount / n
		}
		interestPortion = remainingBalance * monthlyRate
		principalPortion = paymentAmount - interestPortion
	}

	// Clamp principal to remaining balance on the final payment
	if principalPortion > remainingBalance {
		principalPortion = remainingBalance
		paymentAmount = principalPortion + interestPortion
	}

	newRemainingBalance := remainingBalance - principalPortion
	if newRemainingBalance < 0 {
		newRemainingBalance = 0
	}

	amountCents := int64(math.Round(paymentAmount * 100))

	// Get user's public key
	userPubKey, err := s.RuleRepo.GetUserPublicKey(ctx, rule.CreatedBy)
	if err != nil {
		return fmt.Errorf("get user public key: %w", err)
	}
	if userPubKey == "" {
		return errors.New("user not found")
	}
	userPubKeyBytes, err := base64.StdEncoding.DecodeString(userPubKey)
	if err != nil {
		return fmt.Errorf("decode user public key: %w", err)
	}

	// Build transaction payload with interest_amount
	txPayload := map[string]interface{}{
		"amount":          -paymentAmount, // expense
		"category":        payload.CategoryID,
		"commission":      payload.Commission,
		"notes":           payload.Notes,
		"counterparty":    payload.Counterparty,
		"rule_id":         rule.ID,
		"interest_amount": interestPortion,
	}
	txPayloadJSON, _ := json.Marshal(txPayload)

	// Encrypt with user's public key (ECIES 1| prefix)
	encryptedPayload, err := crypto.EncryptWithPublicKey(txPayloadJSON, userPubKeyBytes)
	if err != nil {
		return fmt.Errorf("encrypt transaction payload: %w", err)
	}

	// Schedule the payment on the payment day of the current month
	txTime := time.Date(now.Year(), now.Month(), payload.MortgagePaymentDay, 12, 0, 0, 0, time.UTC)

	tx := &model.Transaction{
		ID:               uuid.New().String(),
		Time:             txTime,
		AccountID:        payload.SourceAccountID,
		CreatedBy:        rule.CreatedBy,
		EncryptedPayload: encryptedPayload,
		Version:          1,
		CreatedAt:        now,
		UpdatedAt:        now,
	}

	// Update remaining_balance and re-encrypt the rule payload
	payload.MortgageRemainingBalance = newRemainingBalance
	newPayloadJSON, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal updated mortgage payload: %w", err)
	}
	newEncryptedPayload, err := crypto.EncryptWithPublicKey(newPayloadJSON, s.ServerPublicKey)
	if err != nil {
		return fmt.Errorf("re-encrypt mortgage payload: %w", err)
	}

	// All database operations in a transaction
	txErr := database.WithTx(ctx, func(txCtx context.Context) error {
		// Insert the transaction
		if err := s.RuleRepo.InsertRuleTransaction(txCtx, tx); err != nil {
			return fmt.Errorf("insert transaction: %w", err)
		}

		// Update balance (negative for expense)
		if err := s.RuleRepo.UpdateAccountBalances(txCtx, []repository.BalanceUpdate{
			{AccountID: payload.SourceAccountID, Change: -amountCents},
		}); err != nil {
			return fmt.Errorf("update balance: %w", err)
		}

		// Update rule's next occurrence (monthly) and occurrences count
		next := computeNextOccurrence(rule.Frequency, rule.NextOccurrence)
		if _, err := s.RuleRepo.UpdateNextOccurrence(txCtx, rule.ID, next, now); err != nil {
			return fmt.Errorf("update next occurrence: %w", err)
		}

		// Update the encrypted payload with new remaining_balance
		if err := s.RuleRepo.UpdateRulePayload(txCtx, rule.ID, newEncryptedPayload); err != nil {
			return fmt.Errorf("update rule payload: %w", err)
		}

		// Deactivate if paid off or max_occurrences reached
		if newRemainingBalance <= 0 {
			if err := s.RuleRepo.DeactivateRule(txCtx, rule.ID); err != nil {
				return fmt.Errorf("deactivate rule (paid off): %w", err)
			}
		}
		if rule.MaxOccurrences != nil && rule.OccurrencesSoFar+1 >= *rule.MaxOccurrences {
			if err := s.RuleRepo.DeactivateRule(txCtx, rule.ID); err != nil {
				return fmt.Errorf("deactivate rule (max occurrences): %w", err)
			}
		}
		if rule.EndDate != nil && next.After(*rule.EndDate) {
			if err := s.RuleRepo.DeactivateRule(txCtx, rule.ID); err != nil {
				return fmt.Errorf("deactivate rule (end date): %w", err)
			}
		}

		return nil
	})

	if txErr != nil {
		return txErr
	}

	logger.Info("Rule %s (%s) executed: mortgage payment of %.2f (interest: %.2f, principal: %.2f) from account %s, remaining: %.2f",
		rule.ID, rule.Name, paymentAmount, interestPortion, principalPortion, payload.SourceAccountID, newRemainingBalance)
	return nil
}

// computeNextOccurrence calculates the next occurrence based on frequency.
func computeNextOccurrence(frequency string, from time.Time) time.Time {
	switch frequency {
	case "daily":
		return from.AddDate(0, 0, 1)
	case "weekly":
		return from.AddDate(0, 0, 7)
	case "monthly":
		return from.AddDate(0, 1, 0)
	case "yearly":
		return from.AddDate(1, 0, 0)
	default:
		return from.AddDate(0, 1, 0) // default to monthly
	}
}
