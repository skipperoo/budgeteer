package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"budgeteer-backend/internal/model"
	"budgeteer-backend/internal/repository"

	"github.com/google/uuid"
)

type BudgetService struct {
	Repo *repository.BudgetRepository
}

var Budgets *BudgetService

func InitBudgetService() {
	Budgets = &BudgetService{
		Repo: &repository.BudgetRepository{},
	}
}

func (s *BudgetService) ListBudgets(ctx context.Context, userID string) ([]*model.Budget, error) {
	return s.Repo.ListByUserID(ctx, userID)
}

func (s *BudgetService) CreateBudget(ctx context.Context, userID string, req *model.CreateBudgetRequest) (*model.Budget, error) {
	if req.EncryptedPayload == "" {
		return nil, errors.New("encrypted_payload is required")
	}
	if req.Period != "monthly" && req.Period != "yearly" {
		return nil, errors.New("period must be monthly or yearly")
	}
	if req.StartDate == "" {
		return nil, errors.New("start_date is required")
	}
	if _, err := time.Parse("2006-01-02", req.StartDate); err != nil {
		return nil, fmt.Errorf("invalid start_date: %w", err)
	}
	if req.EndDate != nil && *req.EndDate != "" {
		if _, err := time.Parse("2006-01-02", *req.EndDate); err != nil {
			return nil, fmt.Errorf("invalid end_date: %w", err)
		}
	}

	now := time.Now().UTC()
	budget := &model.Budget{
		ID:               uuid.New().String(),
		UserID:           userID,
		AccountID:        req.AccountID,
		EncryptedPayload: req.EncryptedPayload,
		Period:           req.Period,
		StartDate:        req.StartDate,
		EndDate:          req.EndDate,
		CreatedAt:        now,
		UpdatedAt:        now,
	}

	if err := s.Repo.Create(ctx, budget); err != nil {
		return nil, fmt.Errorf("create budget: %w", err)
	}
	return budget, nil
}

func (s *BudgetService) UpdateBudget(ctx context.Context, budgetID, userID string, req *model.UpdateBudgetRequest) (*model.Budget, error) {
	budget, err := s.Repo.FindByID(ctx, budgetID)
	if err != nil {
		return nil, fmt.Errorf("find budget: %w", err)
	}
	if budget == nil {
		return nil, errors.New("budget not found")
	}
	if budget.UserID != userID {
		return nil, errors.New("unauthorized")
	}

	if req.AccountID != nil {
		budget.AccountID = req.AccountID
	}
	if req.EncryptedPayload != nil {
		budget.EncryptedPayload = *req.EncryptedPayload
	}
	if req.Period != nil {
		if *req.Period != "monthly" && *req.Period != "yearly" {
			return nil, errors.New("period must be monthly or yearly")
		}
		budget.Period = *req.Period
	}
	if req.StartDate != nil {
		if _, err := time.Parse("2006-01-02", *req.StartDate); err != nil {
			return nil, fmt.Errorf("invalid start_date: %w", err)
		}
		budget.StartDate = *req.StartDate
	}
	if req.EndDate != nil {
		budget.EndDate = req.EndDate
	}
	budget.UpdatedAt = time.Now().UTC()

	if err := s.Repo.Update(ctx, budget); err != nil {
		return nil, fmt.Errorf("update budget: %w", err)
	}
	return budget, nil
}

func (s *BudgetService) DeleteBudget(ctx context.Context, budgetID, userID string) error {
	budget, err := s.Repo.FindByID(ctx, budgetID)
	if err != nil {
		return fmt.Errorf("find budget: %w", err)
	}
	if budget == nil {
		return errors.New("budget not found")
	}
	if budget.UserID != userID {
		return errors.New("unauthorized")
	}
	return s.Repo.Delete(ctx, budgetID)
}

// NotifyBudgetThreshold creates a notification when a budget threshold is crossed.
// The frontend detects thresholds client-side and calls this endpoint.
func (s *BudgetService) NotifyBudgetThreshold(ctx context.Context, budgetID, userID string, threshold int) error {
	if threshold != 50 && threshold != 80 && threshold != 100 {
		return errors.New("threshold must be 50, 80, or 100")
	}

	budget, err := s.Repo.FindByID(ctx, budgetID)
	if err != nil {
		return fmt.Errorf("find budget: %w", err)
	}
	if budget == nil {
		return errors.New("budget not found")
	}
	if budget.UserID != userID {
		return errors.New("unauthorized")
	}

	// Check if already notified for this threshold
	var already bool
	switch threshold {
	case 50:
		already = budget.LastNotified50
	case 80:
		already = budget.LastNotified80
	case 100:
		already = budget.LastNotified100
	}
	if already {
		return nil
	}

	// Create an in-app notification
	if Notifications != nil {
		title := fmt.Sprintf("Budget %d%% Reached", threshold)
		body := fmt.Sprintf("Your budget '%s' has reached %d%% of the limit.", budget.ID[:8], threshold)
		if err := Notifications.CreateNotification(ctx, userID, "budget_threshold", title, body, map[string]interface{}{
			"budget_id": budgetID,
			"threshold": threshold,
		}); err != nil {
			return fmt.Errorf("create notification: %w", err)
		}
	}

	// Mark the threshold as notified
	thresholdStr := fmt.Sprintf("%d", threshold)
	if err := s.Repo.MarkNotified(ctx, budgetID, thresholdStr); err != nil {
		return fmt.Errorf("mark notified: %w", err)
	}

	return nil
}
