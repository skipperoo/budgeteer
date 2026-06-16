package service

import (
	"context"
	"fmt"
	"time"

	"budgeteer-backend/internal/model"
	"budgeteer-backend/internal/repository"

	"github.com/google/uuid"
)

type AccountService struct {
	AccountRepo     *repository.AccountRepository
	AccountUserRepo *repository.AccountUserRepository
	UserRepo        *repository.UserRepository
}

var Accounts *AccountService

func InitAccountService() {
	Accounts = &AccountService{
		AccountRepo:     &repository.AccountRepository{},
		AccountUserRepo: &repository.AccountUserRepository{},
		UserRepo:        &repository.UserRepository{},
	}
}

// List returns all active accounts the user has access to.
func (s *AccountService) List(ctx context.Context, userID string) ([]*model.Account, error) {
	return s.AccountRepo.ListByUserID(ctx, userID)
}

func (s *AccountService) Create(ctx context.Context, userID string, req *model.CreateAccountRequest) (*model.Account, error) {
	now := time.Now()
	account := &model.Account{
		ID:        uuid.New().String(),
		Name:      req.Name,
		Currency:  req.Currency,
		Type:      req.Type,
		CreatedBy: userID,
		CreatedAt: now,
		UpdatedAt: now,
	}

	if err := s.AccountRepo.Create(ctx, account); err != nil {
		return nil, fmt.Errorf("failed to create account: %w", err)
	}

	au := &model.AccountUser{
		AccountID:           account.ID,
		UserID:              userID,
		EncryptedAccountKey: req.EncryptedAccountKey,
		Role:                "owner",
		Status:              "active",
		JoinedAt:            now,
	}
	if err := s.AccountUserRepo.Create(ctx, au); err != nil {
		return nil, fmt.Errorf("failed to add owner: %w", err)
	}

	return account, nil
}

func (s *AccountService) SoftDelete(ctx context.Context, accountID, userID string) error {
	account, err := s.AccountRepo.FindByID(ctx, accountID)
	if err != nil {
		return fmt.Errorf("database error: %w", err)
	}
	if account == nil || account.DeletedAt != nil {
		return fmt.Errorf("account not found")
	}

	au, err := s.AccountUserRepo.FindByAccountAndUser(ctx, accountID, userID)
	if err != nil {
		return fmt.Errorf("database error: %w", err)
	}
	if au == nil || au.Role != "owner" {
		return fmt.Errorf("only the account owner can delete the account")
	}

	return s.AccountRepo.SoftDelete(ctx, accountID)
}

func (s *AccountService) Update(ctx context.Context, accountID, userID, name, currency, accountType string) (*model.Account, error) {
	account, err := s.AccountRepo.FindByID(ctx, accountID)
	if err != nil {
		return nil, fmt.Errorf("database error: %w", err)
	}
	if account == nil || account.DeletedAt != nil {
		return nil, fmt.Errorf("account not found")
	}

	au, err := s.AccountUserRepo.FindByAccountAndUser(ctx, accountID, userID)
	if err != nil {
		return nil, fmt.Errorf("database error: %w", err)
	}
	if au == nil || (au.Role != "owner" && au.Role != "admin") {
		return nil, fmt.Errorf("only the owner can edit the account")
	}

	account.Name = name
	account.Currency = currency
	account.Type = accountType
	if err := s.AccountRepo.Update(ctx, account); err != nil {
		return nil, fmt.Errorf("failed to update account: %w", err)
	}

	return account, nil
}

func (s *AccountService) InviteUser(ctx context.Context, accountID, inviterID, userEmail, encryptedAccountKey string) error {
	account, err := s.AccountRepo.FindByID(ctx, accountID)
	if err != nil {
		return fmt.Errorf("database error: %w", err)
	}
	if account == nil || account.DeletedAt != nil {
		return fmt.Errorf("account not found")
	}

	au, err := s.AccountUserRepo.FindByAccountAndUser(ctx, accountID, inviterID)
	if err != nil {
		return fmt.Errorf("database error: %w", err)
	}
	if au == nil || (au.Role != "owner" && au.Role != "admin") {
		return fmt.Errorf("only owners and admins can invite users")
	}

	// Check if the user is already a member or has a pending invitation
	if targetUser, _ := s.UserRepo.FindByEmail(ctx, userEmail); targetUser != nil {
		existing, _ := s.AccountUserRepo.FindByAccountAndUser(ctx, accountID, targetUser.ID)
		if existing != nil {
			return fmt.Errorf("user is already a member of this account")
		}
		// Also check for pending invitations
		if Invitations != nil {
			inv, _ := Invitations.FindInvitationByEntity(ctx, "account", accountID)
			if inv != nil && inv.InvitedUserID != nil && *inv.InvitedUserID == targetUser.ID && inv.Status == "pending" {
				return fmt.Errorf("user already has a pending invitation for this account")
			}
		}
	}

	// Use the invitation service to create a pending invitation
	if Invitations == nil {
		return fmt.Errorf("invitation service not available")
	}

	if err := Invitations.CreateAccountInvitation(ctx, accountID, inviterID, userEmail, encryptedAccountKey); err != nil {
		return fmt.Errorf("create invitation: %w", err)
	}

	return nil
}

func (s *AccountService) ListUsers(ctx context.Context, accountID string) ([]*model.AccountUser, error) {
	account, err := s.AccountRepo.FindByID(ctx, accountID)
	if err != nil {
		return nil, fmt.Errorf("database error: %w", err)
	}
	if account == nil || account.DeletedAt != nil {
		return nil, fmt.Errorf("account not found")
	}

	return s.AccountUserRepo.ListByAccount(ctx, accountID)
}

func (s *AccountService) UpdateMyKey(ctx context.Context, accountID, userID, encryptedKey string) error {
	return s.AccountUserRepo.UpdateKey(ctx, accountID, userID, encryptedKey)
}

func (s *AccountService) RemoveUser(ctx context.Context, accountID, requesterID, targetUserID string) error {
	au, err := s.AccountUserRepo.FindByAccountAndUser(ctx, accountID, requesterID)
	if err != nil {
		return fmt.Errorf("database error: %w", err)
	}
	if au == nil || (au.Role != "owner" && au.Role != "admin") {
		return fmt.Errorf("only owners and admins can remove users")
	}

	if requesterID == targetUserID {
		return fmt.Errorf("cannot remove yourself")
	}

	return s.AccountUserRepo.Delete(ctx, accountID, targetUserID)
}
