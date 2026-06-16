package worker

import (
	"context"
	"time"

	"budgeteer-backend/internal/logger"
	"budgeteer-backend/internal/service"
)

// InvitationExpiryWorker periodically checks for expired invitations
// and processes them (deletes rules, marks invitations as expired,
// notifies the inviter).
type InvitationExpiryWorker struct {
	interval time.Duration
}

func NewInvitationExpiryWorker() *InvitationExpiryWorker {
	return &InvitationExpiryWorker{
		interval: 6 * time.Hour, // check every 6 hours
	}
}

func (w *InvitationExpiryWorker) Run(ctx context.Context) {
	logger.Info("Invitation expiry worker started (interval: %v)", w.interval)

	// Run once immediately on startup
	w.processExpired(ctx)

	ticker := time.NewTicker(w.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			logger.Info("Invitation expiry worker stopped")
			return
		case <-ticker.C:
			w.processExpired(ctx)
		}
	}
}

func (w *InvitationExpiryWorker) processExpired(ctx context.Context) {
	if service.Invitations == nil {
		logger.Warning("Invitation expiry: invitation service not initialized — skipping")
		return
	}

	logger.Info("Invitation expiry: checking for expired invitations...")
	service.Invitations.ProcessExpiredInvitations(ctx)
}
