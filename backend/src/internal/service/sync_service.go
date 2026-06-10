package service

import (
	"context"
	"fmt"
	"time"

	"budgeteer-backend/internal/model"
	"budgeteer-backend/internal/repository"

	"github.com/google/uuid"
)

type SyncService struct {
	SyncRepo           *repository.SyncRepository
	AccountUserRepo    *repository.AccountUserRepository
	TransactionRepo    *repository.TransactionRepository
}

var Sync *SyncService

func InitSyncService() {
	Sync = &SyncService{
		SyncRepo:           &repository.SyncRepository{},
		AccountUserRepo:    &repository.AccountUserRepository{},
		TransactionRepo:    &repository.TransactionRepository{},
	}
}

const maxPullItems = 500

func (s *SyncService) Pull(ctx context.Context, userID string, cursor *string) ([]*model.SyncQueueItem, *string, error) {
	items, nextCursor, err := s.SyncRepo.ListPendingByUserID(ctx, userID, cursor, maxPullItems)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to fetch sync items: %w", err)
	}

	var ids []string
	for _, item := range items {
		ids = append(ids, item.ID)
	}

	if len(ids) > 0 {
		if err := s.SyncRepo.MarkConsumed(ctx, ids); err != nil {
			return nil, nil, fmt.Errorf("failed to mark items consumed: %w", err)
		}
	}

	hasMore := nextCursor != nil
	if !hasMore {
		nextCursor = nil
	}

	return items, nextCursor, nil
}

func (s *SyncService) Push(ctx context.Context, userID string, operations []model.SyncOperation) error {
	for _, op := range operations {
		if op.Action == "INSERT" && op.EntityType == "transaction" {
			t, err := parseTime(op.Timestamp)
			if err != nil {
				return fmt.Errorf("invalid timestamp: %w", err)
			}
			tx := &model.Transaction{
				ID:               op.EntityID,
				Time:             t,
				CreatedBy:        userID,
				EncryptedPayload: op.EncryptedPayload,
				Version:          1,
				CreatedAt:        time.Now(),
				UpdatedAt:        time.Now(),
			}
			if err := s.TransactionRepo.Create(ctx, tx); err != nil {
				return fmt.Errorf("failed to create transaction: %w", err)
			}
		}

		accountUsers, err := s.AccountUserRepo.ListByAccount(ctx, op.EntityType)
		if err != nil {
			continue
		}

		for _, au := range accountUsers {
			if au.UserID == userID {
				continue
			}
			payload := op.EncryptedPayload
			item := &model.SyncQueueItem{
				ID:               uuid.New().String(),
				TargetUserID:     au.UserID,
				Action:           op.Action,
				EntityType:       op.EntityType,
				EncryptedPayload: &payload,
				CreatedAt:        time.Now(),
			}
			if op.Action == "DELETE" {
				item.EncryptedPayload = nil
			}
			if err := s.SyncRepo.Create(ctx, item); err != nil {
				return fmt.Errorf("failed to create sync item: %w", err)
			}
		}
	}
	return nil
}

func parseTime(ts string) (time.Time, error) {
	formats := []string{
		time.RFC3339,
		time.RFC3339Nano,
		"2006-01-02T15:04:05Z",
		"2006-01-02T15:04:05.999Z",
	}
	for _, f := range formats {
		if t, err := time.Parse(f, ts); err == nil {
			return t, nil
		}
	}
	return time.Parse(time.RFC3339, ts)
}
