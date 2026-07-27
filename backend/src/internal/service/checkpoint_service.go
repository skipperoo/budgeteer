package service

import (
	"context"
	"fmt"

	"budgeteer-backend/internal/model"
	"budgeteer-backend/internal/repository"
)

type CheckpointService struct {
	CheckpointRepo   *repository.CheckpointRepository
	AccountUserRepo  *repository.AccountUserRepository
}

var Checkpoints *CheckpointService

func InitCheckpointService() {
	Checkpoints = &CheckpointService{
		CheckpointRepo:  &repository.CheckpointRepository{},
		AccountUserRepo: &repository.AccountUserRepository{},
	}
}

// verifyAccountAccess returns an error if the user has no access to the account.
func (s *CheckpointService) verifyAccountAccess(ctx context.Context, accountID, userID string) error {
	au, err := s.AccountUserRepo.FindByAccountAndUser(ctx, accountID, userID)
	if err != nil {
		return fmt.Errorf("database error: %w", err)
	}
	if au == nil {
		return fmt.Errorf("account not found or access denied")
	}
	return nil
}

// List returns checkpoints for an account within [from, to] (both optional).
func (s *CheckpointService) List(ctx context.Context, accountID, userID, from, to string) ([]*model.Checkpoint, error) {
	if err := s.verifyAccountAccess(ctx, accountID, userID); err != nil {
		return nil, err
	}
	return s.CheckpointRepo.ListByAccount(ctx, accountID, from, to)
}

// UpsertMany bulk-upserts checkpoints for an account. Max 400 rows per call.
func (s *CheckpointService) UpsertMany(ctx context.Context, accountID, userID string, items []model.CheckpointInput) error {
	if err := s.verifyAccountAccess(ctx, accountID, userID); err != nil {
		return err
	}
	if len(items) > 400 {
		return fmt.Errorf("max 400 checkpoints per request")
	}
	return s.CheckpointRepo.UpsertMany(ctx, accountID, items)
}

// Verify returns the plaintext tx_count for each requested checkpoint month.
func (s *CheckpointService) Verify(ctx context.Context, accountID, userID string, months []string) (*model.VerifyCheckpointsResponse, error) {
	if err := s.verifyAccountAccess(ctx, accountID, userID); err != nil {
		return nil, err
	}
	counts := make([]model.CheckpointCount, 0, len(months))
	for _, m := range months {
		c, err := s.CheckpointRepo.CountTransactionsThroughMonth(ctx, accountID, m)
		if err != nil {
			return nil, fmt.Errorf("count for %s: %w", m, err)
		}
		counts = append(counts, model.CheckpointCount{CheckpointMonth: m, TxCount: c})
	}
	return &model.VerifyCheckpointsResponse{Counts: counts}, nil
}