package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"budgeteer-backend/internal/config"
	"budgeteer-backend/internal/database"
	"budgeteer-backend/internal/handler"
	"budgeteer-backend/internal/logger"
	"budgeteer-backend/internal/middleware"
	"budgeteer-backend/internal/service"
	"budgeteer-backend/internal/worker"
	"github.com/skipperoo/routy"
)

func main() {
	logger.InitLogger()
	defer logger.CloseLogger()

	fmt.Println(service.Art)
	config.LoadConfig()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	dbDSN := fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
		config.Cfg.DBHost, config.Cfg.DBPort, config.Cfg.DBUser,
		config.Cfg.DBPassword, config.Cfg.DBName,
	)

	if err := database.Connect(ctx, dbDSN); err != nil {
		logger.Error("Failed to connect to database: %v", err)
		log.Fatalf("Database connection failed: %v", err)
	}
	defer database.Close()
	logger.Info("Connected to PostgreSQL/TimescaleDB")

	if err := database.ConnectRedis(ctx, config.Cfg.RedisHost, config.Cfg.RedisPort, config.Cfg.RedisPassword); err != nil {
		logger.Error("Failed to connect to Redis: %v", err)
		log.Fatalf("Redis connection failed: %v", err)
	}
	defer database.CloseRedis()
	logger.Info("Connected to Redis")

	service.InitServices()

	recoverMw := routy.NewRecoverMiddleware(nil)
	loggingMw := routy.NewLoggingMiddleware(middleware.StructuredLogger)

	// --- Public routes (no auth) ---
	router := routy.NewRouter()
	router.
		AddMiddleware(recoverMw.GetMiddleware()).
		AddMiddleware(loggingMw.GetMiddleware()).
		AddHandler("POST /api/v1/auth/register",   handler.Register).
		AddHandler("POST /api/v1/auth/verify-otp", handler.VerifyOTP).
		AddHandler("POST /api/v1/auth/login",             handler.Login).
		AddHandler("POST /api/v1/auth/login-verify-otp", handler.LoginVerifyOTP).
		AddHandler("GET  /api/v1/health",                 handler.HealthCheck)

	// --- Protected routes (JWT + Redis blocklist) ---
	protected := routy.NewRouter()
	protected.
		AddMiddleware(middleware.JWTAuth).
		AddHandler("POST   /v1/auth/logout",               handler.Logout).
		AddHandler("GET    /v1/auth/keys",                 handler.GetKeys).
		AddHandler("GET    /v1/auth/me",                   handler.Me).
		AddHandler("PUT    /v1/auth/password",             handler.ChangePassword).
		AddHandler("GET    /v1/auth/preferences",           handler.GetPreferences).
		AddHandler("PUT    /v1/auth/preferences",           handler.UpdatePreferences).
		AddHandler("GET    /v1/users/lookup",              handler.LookupUser).
		AddHandler("GET    /v1/sync/pull",                 handler.SyncPull).
		AddHandler("POST   /v1/sync/push",                 handler.SyncPush).
		AddHandler("GET    /v1/accounts",                  handler.ListAccounts).
		AddHandler("POST   /v1/accounts",                  handler.CreateAccount).
		AddHandler("PUT    /v1/accounts/{id}",             handler.UpdateAccount).
		AddHandler("DELETE /v1/accounts/{id}",             handler.DeleteAccount).
		AddHandler("POST   /v1/accounts/{id}/invite",        handler.InviteToAccount).
		AddHandler("PUT    /v1/accounts/{id}/key",           handler.UpdateMyAccountKey).
		AddHandler("GET    /v1/accounts/{id}/users",         handler.ListAccountUsers).
		AddHandler("DELETE /v1/accounts/{id}/users/{uid}",   handler.RemoveAccountUser).
		AddHandler("GET    /v1/accounts/{id}/transactions",  handler.ListTransactions).
		AddHandler("POST   /v1/accounts/{id}/transactions",  handler.CreateTransaction).
		AddHandler("PUT    /v1/transactions/{id}",           handler.UpdateTransaction).
		AddHandler("DELETE /v1/transactions/{id}",           handler.DeleteTransaction)

	router.AddSubroute("/api/", protected.Finalize())
	final := router.Finalize()

	// --- Background workers ---
	emailDispatcher := worker.NewEmailDispatcher()
	go emailDispatcher.Run(ctx)

	savingsCron := worker.NewSavingsCron()
	go savingsCron.Run(ctx)

	syncCleanup := worker.NewSyncCleanup()
	go syncCleanup.Run(ctx)

	server := &http.Server{
		Addr:         ":8080",
		Handler:      final,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
		<-sigChan
		logger.Info("Shutting down server...")
		cancel()
		shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer shutdownCancel()
		if err := server.Shutdown(shutdownCtx); err != nil {
			logger.Error("Server shutdown error: %v", err)
		}
	}()

	logger.Info("Budgeteer listening on :8080")
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		logger.Error("Server error: %v", err)
		log.Fatalf("Server failed: %v", err)
	}
}
