package worker

import (
	"context"
	"time"

	"budgeteer-backend/internal/config"
	"budgeteer-backend/internal/logger"
	"budgeteer-backend/internal/service"
)

// RuleScheduler periodically checks and executes due rules.
type RuleScheduler struct {
	interval time.Duration
}

func NewRuleScheduler() *RuleScheduler {
	intervalSec := config.Cfg.RulesCheckInterval
	if intervalSec <= 0 {
		intervalSec = 300 // default 5 minutes
	}
	return &RuleScheduler{
		interval: time.Duration(intervalSec) * time.Second,
	}
}

func (w *RuleScheduler) Run(ctx context.Context) {
	logger.Info("Rule scheduler started (interval: %v)", w.interval)

	// Run once immediately on startup
	w.processRules(ctx)

	ticker := time.NewTicker(w.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			logger.Info("Rule scheduler stopped")
			return
		case <-ticker.C:
			w.processRules(ctx)
		}
	}
}

func (w *RuleScheduler) processRules(ctx context.Context) {
	if service.Rules == nil {
		logger.Warning("Rule scheduler: rules service not initialized — skipping")
		return
	}

	logger.Info("Rule scheduler: checking due rules...")
	service.Rules.ProcessDueRules(ctx)
}
