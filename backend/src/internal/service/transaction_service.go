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
	UserRepo        *repository.UserRepository
}

var Transactions *TransactionService

func InitTransactionService() {
	Transactions = &TransactionService{
		TransactionRepo: &repository.TransactionRepository{},
		AccountRepo:     &repository.AccountRepository{},
		AccountUserRepo: &repository.AccountUserRepository{},
		UserRepo:        &repository.UserRepository{},
	}
}

// Create stores a new encrypted transaction.
// If req.TargetEmail is set, it also creates an invitation for the
// recipient to accept and receive the money in their chosen account.
func (s *TransactionService) Create(ctx context.Context, req *model.CreateTransactionRequest, userID string) (*model.Transaction, error) {
	// Verify the user has access to the account
	au, err := s.AccountUserRepo.FindByAccountAndUser(ctx, req.AccountID, userID)
	if err != nil {
		return nil, fmt.Errorf("database error: %w", err)
	}
	if au == nil {
		return nil, fmt.Errorf("account not found or access denied")
	}

	// Pre-validate send-to-user fields before creating the transaction
	if req.TargetEmail != "" {
		if req.ServerEncryptedPayload == "" {
			return nil, fmt.Errorf("server_encrypted_payload is required when target_email is set")
		}
		if Invitations == nil {
			return nil, fmt.Errorf("invitation service not available")
		}
		// Prevent sending to yourself
		sender, err := s.UserRepo.FindByID(ctx, userID)
		if err != nil {
			return nil, fmt.Errorf("lookup sender: %w", err)
		}
		if sender != nil && sender.Email == req.TargetEmail {
			return nil, fmt.Errorf("cannot send a transaction to yourself")
		}
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

	// If this is a "send to user" transaction, create an invitation
	if req.TargetEmail != "" {
		if err := Invitations.CreateTransactionInvitation(ctx, t.ID, userID, req.TargetEmail, req.ServerEncryptedPayload); err != nil {
			return nil, fmt.Errorf("failed to create invitation: %w", err)
		}
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

// Update modifies an existing encrypted transaction (time, encrypted_payload).
func (s *TransactionService) Update(ctx context.Context, transactionID, userID string, req *model.CreateTransactionRequest) (*model.Transaction, error) {
	t, err := s.TransactionRepo.FindByID(ctx, transactionID)
	if err != nil {
		return nil, fmt.Errorf("database error: %w", err)
	}
	if t == nil {
		return nil, fmt.Errorf("transaction not found")
	}

	// Verify the user has access to the account
	au, err := s.AccountUserRepo.FindByAccountAndUser(ctx, t.AccountID, userID)
	if err != nil {
		return nil, fmt.Errorf("database error: %w", err)
	}
	if au == nil {
		return nil, fmt.Errorf("access denied")
	}

	now := time.Now()
	t.Time = req.Time
	t.EncryptedPayload = req.EncryptedPayload
	t.Version++
	t.UpdatedAt = now

	if err := s.TransactionRepo.Update(ctx, t); err != nil {
		return nil, fmt.Errorf("failed to update transaction: %w", err)
	}

	return t, nil
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
