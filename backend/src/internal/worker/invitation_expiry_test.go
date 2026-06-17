package worker

import (
	"context"
	"testing"

	"budgeteer-backend/internal/logger"
)

func TestInvitationExpiryWorker_New(t *testing.T) {
	w := NewInvitationExpiryWorker()
	if w == nil {
		t.Fatal("NewInvitationExpiryWorker returned nil")
	}
}

func TestInvitationExpiryWorker_ProcessExpired_ServiceNotInitialized(t *testing.T) {
	logger.InitLogger()

	// We test that processExpired does not panic when service.Invitations is nil.
	w := NewInvitationExpiryWorker()
	ctx := context.Background()

	// Should not panic — just log a warning and return
	w.processExpired(ctx)
}
