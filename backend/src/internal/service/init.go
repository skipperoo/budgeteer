package service

func InitServices() {
	InitAuthService()
	InitUserService()
	InitAccountService()
	InitTransactionService()
	InitSyncService()
}
