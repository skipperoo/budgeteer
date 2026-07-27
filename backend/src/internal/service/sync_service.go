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

		// Determine the owning account for the fan-out.
		//  - For legacy "transaction" ops the account id is carried in
		//    op.EntityType (existing quirk).
		//  - For checkpoint/account_metadata ops the account id is the
		//    explicit op.AccountID field.
		accountID := op.EntityType
		if op.EntityType == "checkpoint" || op.EntityType == "account_metadata" {
			accountID = op.AccountID
		}

		accountUsers, err := s.AccountUserRepo.ListByAccount(ctx, accountID)
		if err != nil {
			continue
		}

		for _, au := range accountUsers {
			if au.UserID == userID {
				continue
			}
			payload := op.EncryptedPayload
			accountIDCopy := accountID
			item := &model.SyncQueueItem{
				ID:               uuid.New().String(),
				TargetUserID:     au.UserID,
				AccountID:        &accountIDCopy,
				Action:           op.Action,
				EntityType:       op.EntityType,
				EncryptedPayload: &payload,
				CreatedAt:        time.Now(),
			}
			if op.Action == "DELETE" {
				item.EncryptedPayload = nil
			}
			// Carry the month for checkpoint ops.
			if op.EntityType == "checkpoint" && op.CheckpointMonth != "" {
				m := op.CheckpointMonth
				item.CheckpointMonth = &m
			}
			// Carry a source updated_at for LWW on checkpoint/account_metadata.
			if (op.EntityType == "checkpoint" || op.EntityType == "account_metadata") && op.Timestamp != "" {
				if t, err := time.Parse(time.RFC3339, op.Timestamp); err == nil {
					item.SourceUpdatedAt = &t
				}
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
