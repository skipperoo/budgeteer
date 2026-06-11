package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"budgeteer-backend/internal/database"
	"budgeteer-backend/internal/logger"
	"budgeteer-backend/internal/model"
	"budgeteer-backend/internal/repository"
	"budgeteer-backend/internal/service"
	"budgeteer-backend/internal/testhelpers"
)

func handlerSetupTest(t *testing.T) func() {
	t.Helper()
	ctx := context.Background()

	pg, err := testhelpers.SetupPostgresOnce(ctx)
	if err != nil {
		t.Skipf("Skipping handler integration test: postgres not available: %v", err)
	}

	rd, err := testhelpers.SetupRedis(ctx)
	if err != nil {
		pg.Cleanup()
		t.Skipf("Skipping handler integration test: redis not available: %v", err)
	}

	if err := database.Connect(ctx, pg.DSN); err != nil {
		rd.Cleanup()
		t.Skipf("Skipping handler integration test: database connect failed: %v", err)
	}

	if err := database.ConnectRedis(ctx, rd.Host, rd.Port, rd.Password); err != nil {
		database.Close()
		rd.Cleanup()
		t.Skipf("Skipping handler integration test: redis connect failed: %v", err)
	}

	logger.InitLogger()
	service.InitServices()

	cleanup := func() {
		// Clean Redis pending registrations
		keys, _ := database.Redis.Keys(ctx, "pending_reg:*").Result()
		for _, k := range keys {
			database.Redis.Del(ctx, k)
		}
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

func request(method, target string, body any) *http.Request {
	b, _ := json.Marshal(body)
	return httptest.NewRequest(method, target, bytes.NewReader(b))
}

func TestRegisterHandler(t *testing.T) {
	cleanup := handlerSetupTest(t)
	defer cleanup()

	body := map[string]string{
		"email":                  "handler-register@test.com",
		"password":               "Str0ng!Pass",
		"public_key":             "pk-value",
		"encrypted_private_key":  "ek-value",
	}

	w := httptest.NewRecorder()
	req := request("POST", "/api/v1/auth/register", body)
	req.Header.Set("Content-Type", "application/json")
	Register(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("Expected 201 Created, got %d: %s", w.Code, w.Body.String())
	}

	var resp map[string]string
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["message"] == "" {
		t.Fatal("Expected message in response")
	}
}

func TestRegisterHandler_DuplicateEmail(t *testing.T) {
	cleanup := handlerSetupTest(t)
	defer cleanup()

	body := map[string]string{
		"email":                  "handler-dupe@test.com",
		"password":               "Str0ng!Pass",
		"public_key":             "pk",
		"encrypted_private_key":  "ek",
	}

	w1 := httptest.NewRecorder()
	Register(w1, request("POST", "/api/v1/auth/register", body))
	if w1.Code != http.StatusCreated {
		t.Fatalf("First register should succeed: %d", w1.Code)
	}

	w2 := httptest.NewRecorder()
	Register(w2, request("POST", "/api/v1/auth/register", body))
	if w2.Code != http.StatusConflict {
		t.Fatalf("Duplicate register should return 409, got %d", w2.Code)
	}
}

func TestRegisterHandler_InvalidBody(t *testing.T) {
	cleanup := handlerSetupTest(t)
	defer cleanup()

	w := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/api/v1/auth/register", bytes.NewReader([]byte("{invalid")))
	req.Header.Set("Content-Type", "application/json")
	Register(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("Expected 400 for invalid body, got %d", w.Code)
	}
}

func TestLoginHandler_AfterRegister(t *testing.T) {
	cleanup := handlerSetupTest(t)
	defer cleanup()

	email := "handler-login-test@test.com"
	password := "Str0ng!Pass"

	regBody := map[string]string{
		"email":                  email,
		"password":               password,
		"public_key":             "pk",
		"encrypted_private_key":  "ek",
	}
	w := httptest.NewRecorder()
	Register(w, request("POST", "/api/v1/auth/register", regBody))

	loginBody := map[string]string{"email": email, "password": password}
	w2 := httptest.NewRecorder()
	Login(w2, request("POST", "/api/v1/auth/login", loginBody))

	if w2.Code == http.StatusOK {
		t.Fatal("Unverified user should not be able to login")
	}
}

func TestLoginHandler_VerifiedUser(t *testing.T) {
	cleanup := handlerSetupTest(t)
	defer cleanup()

	email := "handler-verified-login@test.com"
	password := "Str0ng!Pass"

	service.InitAuthService()
	err := service.Auth.Register(context.Background(), &model.RegisterRequest{
		Email:               email,
		Password:            password,
		PublicKey:           "pk",
		EncryptedPrivateKey: "ek",
	})
	if err != nil {
		t.Fatalf("Register failed: %v", err)
	}

	// Retrieve OTP from email outbox
	emailRepo := &repository.EmailRepository{}
	emails, _ := emailRepo.ListPending(context.Background(), 10)
	var otpCode string
	for _, e := range emails {
		if e.ToAddress == email {
			fmt.Sscanf(e.Body, "Your verification code is: %s", &otpCode)
			break
		}
	}
	if otpCode == "" {
		t.Fatal("Could not extract OTP code from email outbox")
	}

	// Verify OTP — this creates the user in DB
	_, err = service.Auth.VerifyOTP(context.Background(), email, otpCode)
	if err != nil {
		t.Fatalf("VerifyOTP failed: %v", err)
	}

	loginBody := map[string]string{"email": email, "password": password}
	w := httptest.NewRecorder()
	Login(w, request("POST", "/api/v1/auth/login", loginBody))

	if w.Code != http.StatusOK {
		t.Fatalf("Verified user login should succeed, got %d: %s", w.Code, w.Body.String())
	}

	var resp map[string]string
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["token"] == "" {
		t.Fatal("Login should return a token")
	}
}

func TestHealthCheck(t *testing.T) {
	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/api/v1/health", nil)
	HealthCheck(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200, got %d", w.Code)
	}

	var resp map[string]string
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["details"] != "Healthy!" {
		t.Fatalf("Expected 'Healthy!', got %q", resp["details"])
	}
}
