package service

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"budgeteer-backend/internal/database"
	"budgeteer-backend/internal/model"
	"budgeteer-backend/internal/repository"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

// pendingRegistrationTTL is how long we keep a registration pending
// before the OTP expires and the data is auto-cleaned by Redis.
const pendingRegistrationTTL = 15 * time.Minute

// pendingRegistration holds the data submitted during registration,
// stored in Redis until the user verifies their email via OTP.
type pendingRegistration struct {
	PasswordHash        string `json:"password_hash"`
	PublicKey           string `json:"public_key"`
	EncryptedPrivateKey string `json:"encrypted_private_key"`
	OTPCodeHash         string `json:"otp_code_hash"`
	OTPExpiresAt        int64  `json:"otp_expires_at"` // unix timestamp
}

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

func (s *AuthService) Register(ctx context.Context, req *model.RegisterRequest) error {
	// Check if the email is already taken by a verified user
	existing, err := s.UserRepo.FindByEmail(ctx, req.Email)
	if err != nil {
		return fmt.Errorf("database error: %w", err)
	}
	if existing != nil {
		return fmt.Errorf("email already registered")
	}

	// Check if there is already a pending registration for this email
	pendingKey := "pending_reg:" + req.Email
	exists, err := database.Redis.Exists(ctx, pendingKey).Result()
	if err != nil {
		return fmt.Errorf("redis error: %w", err)
	}
	if exists > 0 {
		return fmt.Errorf("verification already pending for this email")
	}

	hashedPassword, err := HashPassword(req.Password)
	if err != nil {
		return fmt.Errorf("failed to hash password: %w", err)
	}

	otpCode := fmt.Sprintf("%06d", time.Now().UnixNano()%1000000)
	otpHash, err := HashPassword(otpCode)
	if err != nil {
		return fmt.Errorf("failed to hash OTP: %w", err)
	}

	now := time.Now()
	pending := &pendingRegistration{
		PasswordHash:        hashedPassword,
		PublicKey:           req.PublicKey,
		EncryptedPrivateKey: req.EncryptedPrivateKey,
		OTPCodeHash:         otpHash,
		OTPExpiresAt:        now.Add(pendingRegistrationTTL).Unix(),
	}

	data, err := json.Marshal(pending)
	if err != nil {
		return fmt.Errorf("failed to marshal pending registration: %w", err)
	}

	if err := database.Redis.Set(ctx, pendingKey, data, pendingRegistrationTTL).Err(); err != nil {
		return fmt.Errorf("failed to store pending registration: %w", err)
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
		return fmt.Errorf("failed to queue verification email: %w", err)
	}

	return nil
}

func (s *AuthService) VerifyOTP(ctx context.Context, email, code string) (*model.User, error) {
	pendingKey := "pending_reg:" + email
	data, err := database.Redis.Get(ctx, pendingKey).Bytes()
	if err != nil {
		return nil, fmt.Errorf("no pending registration found for this email")
	}

	var pending pendingRegistration
	if err := json.Unmarshal(data, &pending); err != nil {
		return nil, fmt.Errorf("failed to parse pending registration: %w", err)
	}

	// Check OTP expiry
	if time.Now().Unix() > pending.OTPExpiresAt {
		database.Redis.Del(ctx, pendingKey)
		return nil, fmt.Errorf("OTP has expired, please register again")
	}

	// Validate OTP code
	if err := bcrypt.CompareHashAndPassword([]byte(pending.OTPCodeHash), []byte(code)); err != nil {
		return nil, fmt.Errorf("invalid OTP code")
	}

	// Create user in database
	now := time.Now()
	user := &model.User{
		ID:                  uuid.New().String(),
		Email:               email,
		PasswordHash:        pending.PasswordHash,
		PublicKey:           pending.PublicKey,
		EncryptedPrivateKey: pending.EncryptedPrivateKey,
		IsVerified:          true,
		CreatedAt:           now,
		UpdatedAt:           now,
	}

	if err := s.UserRepo.Create(ctx, user); err != nil {
		return nil, fmt.Errorf("failed to create user: %w", err)
	}

	// Clean up pending registration
	database.Redis.Del(ctx, pendingKey)

	return user, nil
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
