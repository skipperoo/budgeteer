package worker

import (
	"context"
	"testing"
	"time"

	"budgeteer-backend/internal/config"
	"budgeteer-backend/internal/logger"
)

func init() {
	// Ensure config is initialized before any test runs
	config.LoadConfig()
}

func TestRuleScheduler_New(t *testing.T) {
	w := NewRuleScheduler()
	if w == nil {
		t.Fatal("NewRuleScheduler returned nil")
	}
	if w.interval == 0 {
		t.Fatal("NewRuleScheduler created with zero interval")
	}
}

func TestRuleScheduler_DefaultInterval(t *testing.T) {
	// Save original and restore
	orig := config.Cfg.RulesCheckInterval
	config.Cfg.RulesCheckInterval = 0
	defer func() { config.Cfg.RulesCheckInterval = orig }()

	w := NewRuleScheduler()
	if w.interval != 300*time.Second {
		t.Fatalf("expected default interval 300s, got %v", w.interval)
	}
}

func TestRuleScheduler_CustomInterval(t *testing.T) {
	// Save original and restore
	orig := config.Cfg.RulesCheckInterval
	config.Cfg.RulesCheckInterval = 600
	defer func() { config.Cfg.RulesCheckInterval = orig }()

	w := NewRuleScheduler()
	if w.interval != 600*time.Second {
		t.Fatalf("expected custom interval 600s, got %v", w.interval)
	}
}

func TestRuleScheduler_ProcessRules_ServiceNotInitialized(t *testing.T) {
	logger.InitLogger()

	// Verify processRules does not panic when service.Rules is nil.
	w := NewRuleScheduler()
	ctx := context.Background()

	// Should not panic — just log a warning and return
	w.processRules(ctx)
}
