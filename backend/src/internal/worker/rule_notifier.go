package worker

import (
	"context"
	"fmt"
	"time"

	"budgeteer-backend/internal/config"
	"budgeteer-backend/internal/logger"
	"budgeteer-backend/internal/model"
	"budgeteer-backend/internal/repository"
	"budgeteer-backend/internal/service"
)

// RuleNotifier periodically checks for rules that need pre-firing alerts.
type RuleNotifier struct {
	interval  time.Duration
	ruleRepo  *repository.RuleRepository
	emailRepo *repository.EmailRepository
	userRepo  *repository.UserRepository
}

func NewRuleNotifier() *RuleNotifier {
	intervalSec := config.Cfg.RulesCheckInterval
	if intervalSec <= 0 {
		intervalSec = 300
	}
	return &RuleNotifier{
		interval:  time.Duration(intervalSec) * time.Second,
		ruleRepo:  &repository.RuleRepository{},
		emailRepo: &repository.EmailRepository{},
		userRepo:  &repository.UserRepository{},
	}
}

func (w *RuleNotifier) Run(ctx context.Context) {
	logger.Info("Rule notifier started (interval: %v)", w.interval)

	w.checkAlerts(ctx)

	ticker := time.NewTicker(w.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			logger.Info("Rule notifier stopped")
			return
		case <-ticker.C:
			w.checkAlerts(ctx)
		}
	}
}

func (w *RuleNotifier) checkAlerts(ctx context.Context) {
	rules, err := w.ruleRepo.FindRulesNeedingAlerts(ctx, time.Now().UTC())
	if err != nil {
		logger.Error("Rule notifier: failed to query rules needing alerts: %v", err)
		return
	}

	for _, rule := range rules {
		w.sendAlert(ctx, rule)
	}
}

func (w *RuleNotifier) sendAlert(ctx context.Context, rule *model.Rule) {
	if rule.AlertOffset == nil {
		return
	}

	now := time.Now().UTC()

	// Send in-app notification
	if service.Notifications != nil {
		title := fmt.Sprintf("Rule due: %s", rule.Name)
		body := fmt.Sprintf(
			"Your rule '%s' (%s) is scheduled to fire at %s (%s from now).",
			rule.Name, *rule.AlertOffset,
			rule.NextOccurrence.Format("Jan 2, 2006 15:04 UTC"),
			*rule.AlertOffset,
		)

		if err := service.Notifications.NotificationRepo.CreateNotification(
			ctx, rule.CreatedBy, "rule_alert", title, body, nil,
		); err != nil {
			logger.Error("Rule notifier: failed to create notification for rule %s: %v", rule.ID, err)
		}
	}

	// Send email notification
	user, err := w.userRepo.FindByID(ctx, rule.CreatedBy)
	if err != nil || user == nil {
		logger.Error("Rule notifier: failed to find user %s for rule %s: %v", rule.CreatedBy, rule.ID, err)
	} else {
		email := &model.EmailOutbox{
			ID:           fmt.Sprintf("%x", time.Now().UnixNano()),
			ToAddress:    user.Email,
			Subject:      fmt.Sprintf("Budgeteer: Rule '%s' due soon", rule.Name),
			Body:         fmt.Sprintf("Your rule '%s' is about to fire at %s.\n\nAlert offset: %s\nDue time: %s\n\nYou can view and manage your rules in the Budgeteer app.", rule.Name, rule.NextOccurrence.Format("Jan 2, 2006 15:04 UTC"), *rule.AlertOffset, rule.NextOccurrence.Format("Jan 2, 2006 15:04 UTC")),
			Status:       "pending",
			ScheduledFor: now,
			CreatedAt:    now,
		}

		if err := w.emailRepo.Create(ctx, email); err != nil {
			logger.Error("Rule notifier: failed to queue email for rule %s: %v", rule.ID, err)
		}
	}

	// Mark as alerted to avoid duplicate notifications
	if err := w.ruleRepo.MarkRuleAlerted(ctx, rule.ID, now); err != nil {
		logger.Error("Rule notifier: failed to mark rule %s as alerted: %v", rule.ID, err)
	} else {
		logger.Info("Rule notifier: alert sent for rule %s (%s) — fires at %s", rule.ID, rule.Name, rule.NextOccurrence.Format(time.RFC3339))
	}
}
