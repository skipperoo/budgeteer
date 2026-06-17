package service

func InitServices() {
	InitAuthService()
	InitUserService()
	InitAccountService()
	InitTransactionService()
	InitTransactionDocumentService()
	InitSyncService()
	InitRuleService()
	InitNotificationService()

	// Initialize invitation service with the server's X25519 keypair
	// (needed for decrypting/re-encrypting account keys).
	if Rules != nil && Rules.ServerPrivateKey != nil {
		InitInvitationServiceWithKeys(Rules.ServerPrivateKey, Rules.ServerPublicKey)
	} else {
		InitInvitationService()
	}
}
