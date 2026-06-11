package repository

import (
	"context"
	"testing"
	"time"

	"budgeteer-backend/internal/model"

	"github.com/google/uuid"
)

func TestOTPRepoCreateAndFind(t *testing.T) {
	cleanup := repoSetupDB(t)
	defer cleanup()

	userRepo := &UserRepository{}
	user := createUser(t, "repo-otp@test.com")
	userRepo.Create(context.Background(), user)

	otpRepo := &OTPRepository{}
	otp := &model.OTP{
		ID:        uuid.New().String(),
		UserID:    user.ID,
		CodeHash:  "$2a$10$otphashvalue",
		ExpiresAt: time.Now().Add(15 * time.Minute),
		Consumed:  false,
		CreatedAt: time.Now(),
	}

	err := otpRepo.Create(context.Background(), otp)
	if err != nil {
		t.Fatalf("OTPRepo.Create failed: %v", err)
	}

	found, err := otpRepo.FindValidByUserID(context.Background(), user.ID)
	if err != nil {
		t.Fatalf("FindValidByUserID failed: %v", err)
	}
	if found == nil {
		t.Fatal("FindValidByUserID returned nil for valid OTP")
	}
	if found.ID != otp.ID {
		t.Fatalf("Expected OTP ID %q, got %q", otp.ID, found.ID)
	}
}

func TestOTPRepoFindExpired(t *testing.T) {
	cleanup := repoSetupDB(t)
	defer cleanup()

	userRepo := &UserRepository{}
	user := createUser(t, "repo-otp-expired@test.com")
	userRepo.Create(context.Background(), user)

	otpRepo := &OTPRepository{}
	otp := &model.OTP{
		ID:        uuid.New().String(),
		UserID:    user.ID,
		CodeHash:  "$2a$10$hash",
		ExpiresAt: time.Now().Add(-1 * time.Hour),
		Consumed:  false,
		CreatedAt: time.Now().Add(-2 * time.Hour),
	}
	otpRepo.Create(context.Background(), otp)

	found, err := otpRepo.FindValidByUserID(context.Background(), user.ID)
	if err != nil {
		t.Fatalf("FindValidByUserID failed: %v", err)
	}
	if found != nil {
		t.Fatal("FindValidByUserID should return nil for expired OTP")
	}
}

func TestOTPRepoMarkConsumed(t *testing.T) {
	cleanup := repoSetupDB(t)
	defer cleanup()

	userRepo := &UserRepository{}
	user := createUser(t, "repo-otp-consume@test.com")
	userRepo.Create(context.Background(), user)

	otpRepo := &OTPRepository{}
	otp := &model.OTP{
		ID:        uuid.New().String(),
		UserID:    user.ID,
		CodeHash:  "$2a$10$hash",
		ExpiresAt: time.Now().Add(15 * time.Minute),
		Consumed:  false,
		CreatedAt: time.Now(),
	}
	otpRepo.Create(context.Background(), otp)

	err := otpRepo.MarkConsumed(context.Background(), otp.ID)
	if err != nil {
		t.Fatalf("MarkConsumed failed: %v", err)
	}

	found, _ := otpRepo.FindValidByUserID(context.Background(), user.ID)
	if found != nil {
		t.Fatal("OTP should not be findable after being consumed")
	}
}
