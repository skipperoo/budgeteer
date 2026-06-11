package service

import (
	"context"
	"fmt"
	"time"

	"budgeteer-backend/internal/model"
	"budgeteer-backend/internal/repository"

	"github.com/google/uuid"
)

type TransactionService struct {
	TransactionRepo *repository.TransactionRepository
	AccountRepo     *repository.AccountRepository
	AccountUserRepo *repository.AccountUserRepository
}

var Transactions *TransactionService

func InitTransactionService() {
	Transactions = &TransactionService{
		TransactionRepo: &repository.TransactionRepository{},
		AccountRepo:     &repository.AccountRepository{},
		AccountUserRepo: &repository.AccountUserRepository{},
	}
}

// Create stores a new encrypted transaction.
func (s *TransactionService) Create(ctx context.Context, req *model.CreateTransactionRequest, userID string) (*model.Transaction, error) {
	// Verify the user has access to the account
	au, err := s.AccountUserRepo.FindByAccountAndUser(ctx, req.AccountID, userID)
	if err != nil {
		return nil, fmt.Errorf("database error: %w", err)
	}
	if au == nil {
		return nil, fmt.Errorf("account not found or access denied")
	}

	now := time.Now()
	t := &model.Transaction{
		ID:               uuid.New().String(),
		Time:             req.Time,
		AccountID:        req.AccountID,
		CreatedBy:        userID,
		EncryptedPayload: req.EncryptedPayload,
		Version:          1,
		CreatedAt:        now,
		UpdatedAt:        now,
	}

	if err := s.TransactionRepo.Create(ctx, t); err != nil {
		return nil, fmt.Errorf("failed to create transaction: %w", err)
	}

	return t, nil
}

// ListByAccount returns all non-deleted transactions for an account.
func (s *TransactionService) ListByAccount(ctx context.Context, accountID, userID string, limit, offset int) ([]*model.Transaction, error) {
	// Verify access
	au, err := s.AccountUserRepo.FindByAccountAndUser(ctx, accountID, userID)
	if err != nil {
		return nil, fmt.Errorf("database error: %w", err)
	}
	if au == nil {
		return nil, fmt.Errorf("account not found or access denied")
	}

	return s.TransactionRepo.ListByAccountID(ctx, accountID, limit, offset)
}

// SoftDelete marks a transaction as deleted.
func (s *TransactionService) SoftDelete(ctx context.Context, transactionID, userID string) error {
	t, err := s.TransactionRepo.FindByID(ctx, transactionID)
	if err != nil {
		return fmt.Errorf("database error: %w", err)
	}
	if t == nil {
		return fmt.Errorf("transaction not found")
	}

	// Verify the user has access to the account
	au, err := s.AccountUserRepo.FindByAccountAndUser(ctx, t.AccountID, userID)
	if err != nil {
		return fmt.Errorf("database error: %w", err)
	}
	if au == nil {
		return fmt.Errorf("access denied")
	}

	return s.TransactionRepo.SoftDelete(ctx, transactionID)
}
