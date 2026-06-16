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
	RuleRepo *repository.RuleRepository
	serverPrivateKey []byte // raw X25519 private key
	serverPublicKey  []byte // raw X25519 public key
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
		serverPrivateKey: privKey,
		serverPublicKey:  pubKey,
	}
	logger.Info("Rule service initialized with server encryption key")
}

// ServerPublicKey returns the server's X25519 public key as base64.
func (s *RuleService) ServerPublicKey() string {
	if s.serverPublicKey == nil {
		return ""
	}
	return base64.StdEncoding.EncodeToString(s.serverPublicKey)
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
		CreatedAt:        now,
		UpdatedAt:        now,
	}

	if err := s.RuleRepo.Create(ctx, rule); err != nil {
		return nil, fmt.Errorf("create rule: %w", err)
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
	if s.serverPrivateKey == nil {
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
	payloadJSON, err := crypto.DecryptWithPrivateKey(rule.EncryptedPayload, s.serverPrivateKey)
	if err != nil {
		return fmt.Errorf("decrypt rule payload: %w", err)
	}

	var payload model.RulePayload
	if err := json.Unmarshal(payloadJSON, &payload); err != nil {
		return fmt.Errorf("unmarshal rule payload: %w", err)
	}

	// Validate payload
	if payload.SourceAccountID == "" || payload.Amount <= 0 {
		return errors.New("invalid rule payload: missing source_account_id or amount")
	}

	switch payload.Type {
	case "payment":
		return s.executePayment(ctx, rule, &payload, now)
	case "transfer":
		return s.executeTransfer(ctx, rule, &payload, now)
	case "user_transfer":
		return s.executeUserTransfer(ctx, rule, &payload, now)
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

	// Check balance
	balance, err := s.RuleRepo.GetAccountBalance(ctx, payload.SourceAccountID)
	if err != nil {
		return fmt.Errorf("get balance: %w", err)
	}
	if float64(balance) < payload.Amount {
		logger.Warning("Rule %s: insufficient balance in account %s (balance=%d, amount=%.2f)",
			rule.ID, payload.SourceAccountID, balance, payload.Amount)
		return errors.New("insufficient balance")
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
		"amount":       -payload.Amount, // expense
		"category":     payload.CategoryID,
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
	amountCents := int64(math.Round(payload.Amount))

	// Use a pool-level transaction for atomicity
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

	// Check balance
	balance, err := s.RuleRepo.GetAccountBalance(ctx, payload.SourceAccountID)
	if err != nil {
		return fmt.Errorf("get balance: %w", err)
	}
	if float64(balance) < payload.Amount {
		logger.Warning("Rule %s: insufficient balance in account %s (balance=%d, amount=%.2f)",
			rule.ID, payload.SourceAccountID, balance, payload.Amount)
		return errors.New("insufficient balance")
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

	// Build transaction payloads
	expensePayload := map[string]interface{}{
		"amount":       -payload.Amount,
		"notes":        payload.Notes,
		"counterparty": payload.TargetAccountID,
		"rule_id":      rule.ID,
	}
	incomePayload := map[string]interface{}{
		"amount":       payload.Amount,
		"notes":        payload.Notes,
		"counterparty": payload.SourceAccountID,
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

	amountCents := int64(math.Round(payload.Amount))

	txErr := database.WithTx(ctx, func(txCtx context.Context) error {
		if err := s.RuleRepo.InsertRuleTransaction(txCtx, expenseTx); err != nil {
			return fmt.Errorf("insert expense tx: %w", err)
		}
		if err := s.RuleRepo.InsertRuleTransaction(txCtx, incomeTx); err != nil {
			return fmt.Errorf("insert income tx: %w", err)
		}

		if err := s.RuleRepo.UpdateAccountBalances(txCtx, []repository.BalanceUpdate{
			{AccountID: payload.SourceAccountID, Change: -amountCents},
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
	if payload.TargetAccountID == "" || payload.TargetUserID == "" {
		return errors.New("user_transfer rule missing target_account_id or target_user_id")
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

	// Check balance
	balance, err := s.RuleRepo.GetAccountBalance(ctx, payload.SourceAccountID)
	if err != nil {
		return fmt.Errorf("get balance: %w", err)
	}
	if float64(balance) < payload.Amount {
		logger.Warning("Rule %s: insufficient balance in account %s (balance=%d, amount=%.2f)",
			rule.ID, payload.SourceAccountID, balance, payload.Amount)
		return errors.New("insufficient balance")
	}

	// Get both users' public keys
	senderPubKey, err := s.RuleRepo.GetUserPublicKey(ctx, rule.CreatedBy)
	if err != nil {
		return fmt.Errorf("get sender public key: %w", err)
	}
	receiverPubKey, err := s.RuleRepo.GetUserPublicKey(ctx, payload.TargetUserID)
	if err != nil {
		return fmt.Errorf("get receiver public key: %w", err)
	}
	if senderPubKey == "" || receiverPubKey == "" {
		return errors.New("user not found")
	}

	senderPubKeyBytes, err := base64.StdEncoding.DecodeString(senderPubKey)
	if err != nil {
		return fmt.Errorf("decode sender public key: %w", err)
	}
	receiverPubKeyBytes, err := base64.StdEncoding.DecodeString(receiverPubKey)
	if err != nil {
		return fmt.Errorf("decode receiver public key: %w", err)
	}

	// Build transaction payloads
	expensePayload := map[string]interface{}{
		"amount":       -payload.Amount,
		"notes":        payload.Notes,
		"counterparty": payload.TargetUserID,
		"rule_id":      rule.ID,
	}
	incomePayload := map[string]interface{}{
		"amount":       payload.Amount,
		"notes":        payload.Notes,
		"counterparty": rule.CreatedBy,
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
		AccountID:        payload.TargetAccountID,
		CreatedBy:        rule.CreatedBy,
		EncryptedPayload: encryptedIncome,
		Version:          1,
		CreatedAt:        now,
		UpdatedAt:        now,
	}

	amountCents := int64(math.Round(payload.Amount))

	txErr := database.WithTx(ctx, func(txCtx context.Context) error {
		if err := s.RuleRepo.InsertRuleTransaction(txCtx, expenseTx); err != nil {
			return fmt.Errorf("insert expense tx: %w", err)
		}
		if err := s.RuleRepo.InsertRuleTransaction(txCtx, incomeTx); err != nil {
			return fmt.Errorf("insert income tx: %w", err)
		}

		if err := s.RuleRepo.UpdateAccountBalances(txCtx, []repository.BalanceUpdate{
			{AccountID: payload.SourceAccountID, Change: -amountCents},
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

	logger.Info("Rule %s (%s) executed: user transfer of %.2f from %s (user %s) to %s (user %s)",
		rule.ID, rule.Name, payload.Amount,
		payload.SourceAccountID, rule.CreatedBy,
		payload.TargetAccountID, payload.TargetUserID)
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
