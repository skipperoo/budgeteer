package service

import (
	"context"
	"fmt"
	"time"

	"budgeteer-backend/internal/database"
	"budgeteer-backend/internal/model"
	"budgeteer-backend/internal/repository"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

type AuthService struct {
	UserRepo  *repository.UserRepository
	OTPRepo   *repository.OTPRepository
	EmailRepo *repository.EmailRepository
}

var Auth *AuthService

func InitAuthService() {
	Auth = &AuthService{
		UserRepo:  &repository.UserRepository{},
		OTPRepo:   &repository.OTPRepository{},
		EmailRepo: &repository.EmailRepository{},
	}
}

func (s *AuthService) Register(ctx context.Context, req *model.RegisterRequest) (*model.User, error) {
	existing, err := s.UserRepo.FindByEmail(ctx, req.Email)
	if err != nil {
		return nil, fmt.Errorf("database error: %w", err)
	}
	if existing != nil {
		return nil, fmt.Errorf("email already registered")
	}

	hashedPassword, err := HashPassword(req.Password)
	if err != nil {
		return nil, fmt.Errorf("failed to hash password: %w", err)
	}

	now := time.Now()
	user := &model.User{
		ID:                  uuid.New().String(),
		Email:               req.Email,
		PasswordHash:        hashedPassword,
		PublicKey:           req.PublicKey,
		EncryptedPrivateKey: req.EncryptedPrivateKey,
		IsVerified:          false,
		CreatedAt:           now,
		UpdatedAt:           now,
	}

	if err := s.UserRepo.Create(ctx, user); err != nil {
		return nil, fmt.Errorf("failed to create user: %w", err)
	}

	otpCode := fmt.Sprintf("%06d", time.Now().UnixNano()%1000000)
	otpHash, err := HashPassword(otpCode)
	if err != nil {
		return nil, fmt.Errorf("failed to hash OTP: %w", err)
	}

	otp := &model.OTP{
		ID:        uuid.New().String(),
		UserID:    user.ID,
		CodeHash:  otpHash,
		ExpiresAt: now.Add(15 * time.Minute),
		Consumed:  false,
		CreatedAt: now,
	}
	if err := s.OTPRepo.Create(ctx, otp); err != nil {
		return nil, fmt.Errorf("failed to create OTP: %w", err)
	}

	email := &model.EmailOutbox{
		ID:           uuid.New().String(),
		ToAddress:    req.Email,
		Subject:      "Verify your Budgeteer account",
		Body:         fmt.Sprintf("Your verification code is: %s\n\nThis code expires in 15 minutes.", otpCode),
		Status:       "pending",
		ScheduledFor: now,
		CreatedAt:    now,
	}
	if err := s.EmailRepo.Create(ctx, email); err != nil {
		return nil, fmt.Errorf("failed to queue verification email: %w", err)
	}

	return user, nil
}

func (s *AuthService) VerifyOTP(ctx context.Context, email, code string) error {
	user, err := s.UserRepo.FindByEmail(ctx, email)
	if err != nil {
		return fmt.Errorf("database error: %w", err)
	}
	if user == nil {
		return fmt.Errorf("user not found")
	}

	otp, err := s.OTPRepo.FindValidByUserID(ctx, user.ID)
	if err != nil {
		return fmt.Errorf("database error: %w", err)
	}
	if otp == nil {
		return fmt.Errorf("no valid OTP found")
	}

	if err := bcrypt.CompareHashAndPassword([]byte(otp.CodeHash), []byte(code)); err != nil {
		return fmt.Errorf("invalid OTP code")
	}

	if err := s.OTPRepo.MarkConsumed(ctx, otp.ID); err != nil {
		return fmt.Errorf("failed to consume OTP: %w", err)
	}

	if err := s.UserRepo.UpdateVerified(ctx, user.ID); err != nil {
		return fmt.Errorf("failed to verify user: %w", err)
	}

	return nil
}

func (s *AuthService) Login(ctx context.Context, email, password string) (*model.User, string, error) {
	user, err := s.UserRepo.FindByEmail(ctx, email)
	if err != nil {
		return nil, "", fmt.Errorf("database error: %w", err)
	}
	if user == nil {
		return nil, "", fmt.Errorf("invalid email or password")
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		return nil, "", fmt.Errorf("invalid email or password")
	}

	if !user.IsVerified {
		return nil, "", fmt.Errorf("email not verified")
	}

	token, _, err := GenerateJWT(user.ID, user.Email)
	if err != nil {
		return nil, "", fmt.Errorf("failed to generate token: %w", err)
	}

	return user, token, nil
}

func (s *AuthService) Logout(ctx context.Context, tokenString string, expiresAt time.Time) error {
	ttl := time.Until(expiresAt)
	if ttl <= 0 {
		return nil
	}
	return database.Redis.Set(ctx, "blocklist:"+tokenString, "revoked", ttl).Err()
}

func (s *AuthService) IsBlocked(ctx context.Context, tokenString string) (bool, error) {
	val, err := database.Redis.Exists(ctx, "blocklist:"+tokenString).Result()
	if err != nil {
		return false, err
	}
	return val > 0, nil
}

func (s *AuthService) ChangePassword(ctx context.Context, userID, newEncryptedKey string) error {
	return s.UserRepo.UpdateEncryptedPrivateKey(ctx, userID, newEncryptedKey)
}
