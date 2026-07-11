package service

import (
	"context"
	"log"

	"budgeteer-backend/internal/repository"
)

func InitServices() {
	InitAuthService()
	InitUserService()
	InitAccountService()
	InitTransactionService()
	InitTransactionDocumentService()
	InitSyncService()
	InitRuleService()
	InitNotificationService()
	InitBudgetService()

	// Seed default admin user if the admin_users table is empty
	adminRepo := &repository.AdminRepository{}
	if err := adminRepo.SeedDefaultAdmin(context.Background()); err != nil {
		log.Printf("Warning: failed to seed default admin: %v", err)
	}

	// Initialize invitation service with the server's X25519 keypair
	// (needed for decrypting/re-encrypting account keys).
	if Rules != nil && Rules.ServerPrivateKey != nil {
		InitInvitationServiceWithKeys(Rules.ServerPrivateKey, Rules.ServerPublicKey)
	} else {
		InitInvitationService()
	}
}
