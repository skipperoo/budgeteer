package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"testing"

	"budgeteer-backend/internal/database"
	"budgeteer-backend/internal/logger"
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

	logger.InitLogger()

	cleanup := func() {
		// Clean up Redis pending registrations
		keys, _ := database.Redis.Keys(ctx, "pending_reg:*").Result()
		for _, k := range keys {
			database.Redis.Del(ctx, k)
		}
		database.Pool.Exec(ctx, "DELETE FROM access_secrets")
		database.Pool.Exec(ctx, "DELETE FROM notifications")
		database.Pool.Exec(ctx, "DELETE FROM invitations")
		database.Pool.Exec(ctx, "DELETE FROM email_outbox")
		database.Pool.Exec(ctx, "DELETE FROM otps")
		database.Pool.Exec(ctx, "DELETE FROM sync_queue")
		database.Pool.Exec(ctx, "DELETE FROM rules")
		database.Pool.Exec(ctx, "DELETE FROM account_users")
		database.Pool.Exec(ctx, "DELETE FROM accounts")
		database.Pool.Exec(ctx, "DELETE FROM transactions")
		database.Pool.Exec(ctx, "DELETE FROM users")
		database.Close()
		database.CloseRedis()
	}

	return cleanup
}

func TestAuthServiceRegisterAndVerifyIntegration(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	InitAuthService()

	req := &model.RegisterRequest{
		Email:               "test@example.com",
		Password:            "SecureP@ss123",
		PublicKey:           "test-public-key",
		EncryptedPrivateKey: "test-encrypted-key",
	}

	// Register — should succeed without creating a user in DB
	err := Auth.Register(context.Background(), req)
	if err != nil {
		t.Fatalf("Register failed: %v", err)
	}

	// User should NOT exist in DB yet
	userRepo := &repository.UserRepository{}
	user, err := userRepo.FindByEmail(context.Background(), req.Email)
	if err != nil {
		t.Fatalf("FindByEmail failed: %v", err)
	}
	if user != nil {
		t.Fatal("User should not exist in DB before OTP verification")
	}

	// Retrieve OTP code from email_outbox (it's in the body)
	emailRepo := &repository.EmailRepository{}
	emails, _ := emailRepo.ListPending(context.Background(), 10)
	var otpCode string
	for _, e := range emails {
		if e.ToAddress == req.Email {
			// Body format: "Your verification code is: XXXXXX\n\n..."
			_, _ = fmt.Sscanf(e.Body, "Your verification code is: %s", &otpCode)
			break
		}
	}
	if otpCode == "" {
		t.Fatal("Could not extract OTP code from email outbox")
	}

	// Verify OTP — this should create the user
	createdUser, err := Auth.VerifyOTP(context.Background(), req.Email, otpCode)
	if err != nil {
		t.Fatalf("VerifyOTP failed: %v", err)
	}
	if createdUser == nil {
		t.Fatal("VerifyOTP returned nil user")
	}
	if createdUser.Email != req.Email {
		t.Fatalf("VerifyOTP returned email %q, want %q", createdUser.Email, req.Email)
	}
	if !createdUser.IsVerified {
		t.Fatal("Verified user should have IsVerified=true")
	}
	if !CheckPasswordHash(req.Password, createdUser.PasswordHash) {
		t.Fatal("Stored password hash should match the original password")
	}

	// User should now exist in DB
	user, err = userRepo.FindByEmail(context.Background(), req.Email)
	if err != nil {
		t.Fatalf("FindByEmail after verify failed: %v", err)
	}
	if user == nil {
		t.Fatal("User should exist in DB after OTP verification")
	}
	if !user.IsVerified {
		t.Fatal("User in DB should be verified")
	}
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

	// First register — pending in Redis
	err := Auth.Register(context.Background(), req)
	if err != nil {
		t.Fatalf("First register failed: %v", err)
	}

	// Second register with same email should fail (pending already exists)
	err = Auth.Register(context.Background(), req)
	if err == nil {
		t.Fatal("Second register with same email should fail (pending exists)")
	}

	// Complete the registration
	emailRepo := &repository.EmailRepository{}
	emails, _ := emailRepo.ListPending(context.Background(), 10)
	var otpCode string
	for _, e := range emails {
		if e.ToAddress == req.Email {
			_, _ = fmt.Sscanf(e.Body, "Your verification code is: %s", &otpCode)
			break
		}
	}
	if otpCode == "" {
		t.Fatal("Could not extract OTP code")
	}

	_, err = Auth.VerifyOTP(context.Background(), req.Email, otpCode)
	if err != nil {
		t.Fatalf("VerifyOTP failed: %v", err)
	}

	// Register again with same email — should fail because user now exists
	err = Auth.Register(context.Background(), req)
	if err == nil {
		t.Fatal("Register after verification should fail (email already registered)")
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

func TestAuthServiceStoreAndVerifyAccessSecret(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	InitAuthService()

	email := "device-test@example.com"
	password := "SecureP@ss123"

	// Create a verified user
	userRepo := &repository.UserRepository{}
	hashedPW, _ := HashPassword(password)
	user := &model.User{
		ID:                  "00000000-0000-0000-0000-000000000010",
		Email:               email,
		PasswordHash:        hashedPW,
		PublicKey:           "pk",
		EncryptedPrivateKey: "ek",
		IsVerified:          true,
	}
	if err := userRepo.Create(context.Background(), user); err != nil {
		t.Fatalf("Failed to create test user: %v", err)
	}

	fingerprintHash := "abc123def456"
	deviceToken := "random-device-token-12345"

	// Compute SHA-256 hash of (device_token + fingerprint + password)
	payload := deviceToken + fingerprintHash + password
	hash := sha256.Sum256([]byte(payload))
	secretHash := hex.EncodeToString(hash[:])

	// Store the access secret
	err := Auth.StoreAccessSecret(context.Background(), user.ID, &model.StoreAccessSecretRequest{
		FingerprintHash: fingerprintHash,
		SecretHash:      secretHash,
		DeviceName:      "Test Device",
	})
	if err != nil {
		t.Fatalf("StoreAccessSecret failed: %v", err)
	}

	// List devices
	secrets, err := Auth.ListAccessSecrets(context.Background(), user.ID)
	if err != nil {
		t.Fatalf("ListAccessSecrets failed: %v", err)
	}
	if len(secrets) != 1 {
		t.Fatalf("Expected 1 device, got %d", len(secrets))
	}
	if secrets[0].DeviceName != "Test Device" {
		t.Fatalf("Expected device name 'Test Device', got %q", secrets[0].DeviceName)
	}
	if secrets[0].SecretHash == "" {
		t.Fatal("Secret hash should not be empty")
	}

	// LoginWithDevice with correct credentials
	_, token, err := Auth.LoginWithDevice(context.Background(), &model.LoginWithDeviceRequest{
		Email:           email,
		Password:        password,
		FingerprintHash: fingerprintHash,
		DeviceToken:     deviceToken,
	})
	if err != nil {
		t.Fatalf("LoginWithDevice failed: %v", err)
	}
	if token == "" {
		t.Fatal("LoginWithDevice returned empty token")
	}
}

func TestAuthServiceLoginWithDevice_WrongToken(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	InitAuthService()

	email := "device-wrong-token@example.com"
	password := "SecureP@ss123"

	userRepo := &repository.UserRepository{}
	hashedPW, _ := HashPassword(password)
	user := &model.User{
		ID:                  "00000000-0000-0000-0000-000000000011",
		Email:               email,
		PasswordHash:        hashedPW,
		PublicKey:           "pk",
		EncryptedPrivateKey: "ek",
		IsVerified:          true,
	}
	userRepo.Create(context.Background(), user)

	fingerprintHash := "wrong-token-fingerprint"
	deviceToken := "correct-device-token"
	payload := deviceToken + fingerprintHash + password
	secretHash, _ := HashPassword(payload)
	Auth.StoreAccessSecret(context.Background(), user.ID, &model.StoreAccessSecretRequest{
		FingerprintHash: fingerprintHash,
		SecretHash:      secretHash,
		DeviceName:      "Device",
	})

	// Try with wrong device token
	_, _, err := Auth.LoginWithDevice(context.Background(), &model.LoginWithDeviceRequest{
		Email:           email,
		Password:        password,
		FingerprintHash: fingerprintHash,
		DeviceToken:     "wrong-device-token",
	})
	if err == nil {
		t.Fatal("LoginWithDevice with wrong token should fail")
	}
}

func TestAuthServiceLoginWithDevice_UnrecognizedFingerprint(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	InitAuthService()

	email := "device-no-match@example.com"
	password := "SecureP@ss123"

	userRepo := &repository.UserRepository{}
	hashedPW, _ := HashPassword(password)
	user := &model.User{
		ID:                  "00000000-0000-0000-0000-000000000012",
		Email:               email,
		PasswordHash:        hashedPW,
		PublicKey:           "pk",
		EncryptedPrivateKey: "ek",
		IsVerified:          true,
	}
	userRepo.Create(context.Background(), user)

	// Try with a fingerprint that was never stored
	_, _, err := Auth.LoginWithDevice(context.Background(), &model.LoginWithDeviceRequest{
		Email:           email,
		Password:        password,
		FingerprintHash: "unknown-fingerprint",
		DeviceToken:     "some-token",
	})
	if err == nil {
		t.Fatal("LoginWithDevice with unknown fingerprint should fail")
	}
}

func TestAuthServiceRemoveAccessSecret(t *testing.T) {
	cleanup := setupTestDB(t)
	defer cleanup()

	InitAuthService()

	email := "device-remove@example.com"
	password := "SecureP@ss123"

	userRepo := &repository.UserRepository{}
	hashedPW, _ := HashPassword(password)
	user := &model.User{
		ID:                  "00000000-0000-0000-0000-000000000013",
		Email:               email,
		PasswordHash:        hashedPW,
		PublicKey:           "pk",
		EncryptedPrivateKey: "ek",
		IsVerified:          true,
	}
	userRepo.Create(context.Background(), user)

	// Store a device
	fingerprintHash := "remove-me-fingerprint"
	payload := "token" + fingerprintHash + password
	hash := sha256.Sum256([]byte(payload))
	secretHash := hex.EncodeToString(hash[:])
	err := Auth.StoreAccessSecret(context.Background(), user.ID, &model.StoreAccessSecretRequest{
		FingerprintHash: fingerprintHash,
		SecretHash:      secretHash,
		DeviceName:      "To Remove",
	})
	if err != nil {
		t.Fatalf("StoreAccessSecret failed: %v", err)
	}

	// List to get the ID
	secrets, _ := Auth.ListAccessSecrets(context.Background(), user.ID)
	if len(secrets) != 1 {
		t.Fatalf("Expected 1 device, got %d", len(secrets))
	}

	// Remove it
	err = Auth.RemoveAccessSecret(context.Background(), user.ID, secrets[0].ID)
	if err != nil {
		t.Fatalf("RemoveAccessSecret failed: %v", err)
	}

	// List should be empty now
	secrets, _ = Auth.ListAccessSecrets(context.Background(), user.ID)
	if len(secrets) != 0 {
		t.Fatalf("Expected 0 devices after removal, got %d", len(secrets))
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
