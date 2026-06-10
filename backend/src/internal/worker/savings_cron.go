package worker

import (
	"context"
	"time"

	"budgeteer-backend/internal/logger"
	"budgeteer-backend/internal/repository"
)

type SavingsCron struct {
	SavingsRepo *repository.SavingsPlanRepository
	EmailRepo   *repository.EmailRepository
	interval    time.Duration
}

func NewSavingsCron() *SavingsCron {
	return &SavingsCron{
		SavingsRepo: &repository.SavingsPlanRepository{},
		EmailRepo:   &repository.EmailRepository{},
		interval:    24 * time.Hour,
	}
}

func (w *SavingsCron) Run(ctx context.Context) {
	logger.Info("Savings plan cron worker started")
	ticker := time.NewTicker(w.interval)
	defer ticker.Stop()

	w.checkPlans(ctx)

	for {
		select {
		case <-ctx.Done():
			logger.Info("Savings plan cron worker stopped")
			return
		case <-ticker.C:
			w.checkPlans(ctx)
		}
	}
}

func (w *SavingsCron) checkPlans(ctx context.Context) {
	plans, err := w.SavingsRepo.FindStale(ctx)
	if err != nil {
		logger.Error("Savings cron: failed to find stale plans: %v", err)
		return
	}

	for _, plan := range plans {
		logger.Info("Savings cron: plan %s needs attention (tracking_end passed or no activity > 30 days)", plan.ID)
	}
}
