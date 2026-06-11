package service

import (
	"context"
	"testing"

	"budgeteer-backend/internal/database"
	"budgeteer-backend/internal/model"
	"budgeteer-backend/internal/repository"
	"budgeteer-backend/internal/testhelpers"
)

func setupTestDB(t *testing.T) context.CancelFunc {
	t.Helper()

	ctx := context.Background()

	pg, err := testhelpers.SetupPostgresOnce(ctx)
	if err != nil {
		t.Skipf("Skipping integration test: postgres not available: %v", err)
	}

	rd, err := testhelpers.SetupRedis(ctx)
	if err != nil {
		t.Skipf("Skipping integration test: redis not available: %v", err)
	}

	if err := database.Connect(ctx, pg.DSN); err != nil {
		t.Skipf("Skipping integration test: database connect failed: %v", err)
	}

	if err := database.ConnectRedis(ctx, rd.Host, rd.Port, rd.Password); err != nil {
		database.Close()
		t.Skipf("Skipping integration test: redis connect failed: %v", err)
	}

	cleanup := func() {
		database.Pool.Exec(ctx, "DELETE FROM email_outbox")
		database.Pool.Exec(ctx, "DELETE FROM otps")
		database.Pool.Exec(ctx, "DELETE FROM sync_queue")
		database.Pool.Exec(ctx, "DELETE FROM account_users")
		database.Pool.Exec(ctx, "DELETE FROM accounts")
		database.Pool.Exec(ctx, "DELETE FROM transactions")
		database.Pool.Exec(ctx, "DELETE FROM users")
		database.Close()
		database.CloseRedis()
	}

	return cleanup
}

func TestAuthServiceRegisterIntegration(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	InitAuthService()

	req := &model.RegisterRequest{
		Email:               "test@example.com",
		Password:            "SecureP@ss123",
		PublicKey:           "test-public-key",
		EncryptedPrivateKey: "test-encrypted-key",
	}

	user, err := Auth.Register(context.Background(), req)
	if err != nil {
		t.Fatalf("Register failed: %v", err)
	}

	if user.ID == "" {
		t.Fatal("Register returned user with empty ID")
	}
	if user.Email != req.Email {
		t.Fatalf("Register returned email %q, want %q", user.Email, req.Email)
	}
	if user.IsVerified {
		t.Fatal("New user should not be verified")
	}

	if !CheckPasswordHash(req.Password, user.PasswordHash) {
		t.Fatal("Stored password hash should match the original password")
	}

	otpRepo := &repository.OTPRepository{}
	otp, err := otpRepo.FindValidByUserID(context.Background(), user.ID)
	if err != nil {
		t.Fatalf("Failed to find OTP for user: %v", err)
	}
	if otp == nil {
		t.Fatal("No OTP created for registered user")
	}

	emailRepo := &repository.EmailRepository{}
	_ = emailRepo
}

func TestAuthServiceRegisterDuplicateEmail(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	InitAuthService()

	req := &model.RegisterRequest{
		Email:               "duplicate@example.com",
		Password:            "SecureP@ss123",
		PublicKey:           "test-public-key",
		EncryptedPrivateKey: "test-encrypted-key",
	}

	_, err := Auth.Register(context.Background(), req)
	if err != nil {
		t.Fatalf("First register failed: %v", err)
	}

	_, err = Auth.Register(context.Background(), req)
	if err == nil {
		t.Fatal("Second register with same email should fail")
	}
}

func TestAuthServiceLoginHappyPath(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	InitAuthService()

	email := "login-test@example.com"
	password := "MyP@ssword!"
	userRepo := &repository.UserRepository{}

	hashedPW, _ := HashPassword(password)
	user := &model.User{
		ID:                  "00000000-0000-0000-0000-000000000001",
		Email:               email,
		PasswordHash:        hashedPW,
		PublicKey:           "pk",
		EncryptedPrivateKey: "ek",
		IsVerified:          true,
	}
	if err := userRepo.Create(context.Background(), user); err != nil {
		t.Fatalf("Failed to create test user: %v", err)
	}

	_, token, err := Auth.Login(context.Background(), email, password)
	if err != nil {
		t.Fatalf("Login failed: %v", err)
	}
	if token == "" {
		t.Fatal("Login returned empty token")
	}
}

func TestAuthServiceLoginWrongPassword(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	InitAuthService()

	email := "wrong-pw@example.com"
	userRepo := &repository.UserRepository{}
	hashedPW, _ := HashPassword("correct-password")
	user := &model.User{
		ID:                  "00000000-0000-0000-0000-000000000002",
		Email:               email,
		PasswordHash:        hashedPW,
		PublicKey:           "pk",
		EncryptedPrivateKey: "ek",
		IsVerified:          true,
	}
	userRepo.Create(context.Background(), user)

	_, _, err := Auth.Login(context.Background(), email, "wrong-password")
	if err == nil {
		t.Fatal("Login with wrong password should fail")
	}
}

func TestAuthServiceLoginNotVerified(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	InitAuthService()

	email := "unverified@example.com"
	userRepo := &repository.UserRepository{}
	hashedPW, _ := HashPassword("password")
	user := &model.User{
		ID:                  "00000000-0000-0000-0000-000000000003",
		Email:               email,
		PasswordHash:        hashedPW,
		PublicKey:           "pk",
		EncryptedPrivateKey: "ek",
		IsVerified:          false,
	}
	userRepo.Create(context.Background(), user)

	_, _, err := Auth.Login(context.Background(), email, "password")
	if err == nil {
		t.Fatal("Login for unverified user should fail")
	}
}
