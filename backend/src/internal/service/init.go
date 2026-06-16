package service

func InitServices() {
	InitAuthService()
	InitUserService()
	InitAccountService()
	InitTransactionService()
	InitTransactionDocumentService()
	InitSyncService()
	InitRuleService()
}
