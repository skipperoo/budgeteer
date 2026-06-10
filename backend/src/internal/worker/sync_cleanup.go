package worker

import (
	"context"
	"time"

	"budgeteer-backend/internal/logger"
	"budgeteer-backend/internal/repository"
)

type SyncCleanup struct {
	SyncRepo *repository.SyncRepository
	interval time.Duration
}

func NewSyncCleanup() *SyncCleanup {
	return &SyncCleanup{
		SyncRepo: &repository.SyncRepository{},
		interval: 24 * time.Hour,
	}
}

func (w *SyncCleanup) Run(ctx context.Context) {
	logger.Info("Sync queue cleanup worker started")
	ticker := time.NewTicker(w.interval)
	defer ticker.Stop()

	w.cleanup(ctx)

	for {
		select {
		case <-ctx.Done():
			logger.Info("Sync queue cleanup worker stopped")
			return
		case <-ticker.C:
			w.cleanup(ctx)
		}
	}
}

func (w *SyncCleanup) cleanup(ctx context.Context) {
	cutoff := time.Now().Add(-30 * 24 * time.Hour)
	err := w.SyncRepo.DeleteConsumedBefore(ctx, cutoff)
	if err != nil {
		logger.Error("Sync cleanup: failed to delete old entries: %v", err)
		return
	}
	logger.Info("Sync cleanup: deleted consumed entries older than 30 days")
}
