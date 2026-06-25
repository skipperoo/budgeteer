package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"time"

	"budgeteer-backend/internal/database"
	"budgeteer-backend/internal/logger"
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
	UserRepo           *repository.UserRepository
	OTPRepo            *repository.OTPRepository
	EmailRepo          *repository.EmailRepository
	AccessSecretRepo   *repository.AccessSecretRepository
}

var Auth *AuthService

func InitAuthService() {
	Auth = &AuthService{
		UserRepo:         &repository.UserRepository{},
		OTPRepo:          &repository.OTPRepository{},
		EmailRepo:        &repository.EmailRepository{},
		AccessSecretRepo: &repository.AccessSecretRepository{},
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

	// Link any pending invitations that were created before the user registered
	if Invitations != nil {
		if err := Invitations.LinkInvitationsToUser(ctx, email, user.ID); err != nil {
			logger.Error("Failed to link invitations for user %s: %v", user.ID, err)
		}
	}

	// Clean up pending registration
	database.Redis.Del(ctx, pendingKey)

	return user, nil
}

// loginOTPTTL is how long a login OTP session is valid.
const loginOTPTTL = 5 * time.Minute

// loginOTPSession is stored in Redis during the login OTP flow.
type loginOTPSession struct {
	UserID      string `json:"user_id"`
	Email       string `json:"email"`
	OTPCodeHash string `json:"otp_code_hash"`
	ExpiresAt   int64  `json:"expires_at"`
}

// LoginInit validates credentials, sends an OTP email, and returns a session ID.
func (s *AuthService) LoginInit(ctx context.Context, email, password string) (string, error) {
	user, err := s.UserRepo.FindByEmail(ctx, email)
	if err != nil {
		return "", fmt.Errorf("database error: %w", err)
	}
	if user == nil {
		return "", fmt.Errorf("invalid email or password")
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		return "", fmt.Errorf("invalid email or password")
	}

	if !user.IsVerified {
		return "", fmt.Errorf("email not verified")
	}

	// Generate OTP
	otpCode := fmt.Sprintf("%06d", time.Now().UnixNano()%1000000)
	otpHash, err := HashPassword(otpCode)
	if err != nil {
		return "", fmt.Errorf("failed to hash OTP: %w", err)
	}

	now := time.Now()
	sessionID := uuid.New().String()
	session := &loginOTPSession{
		UserID:      user.ID,
		Email:       user.Email,
		OTPCodeHash: otpHash,
		ExpiresAt:   now.Add(loginOTPTTL).Unix(),
	}

	data, err := json.Marshal(session)
	if err != nil {
		return "", fmt.Errorf("failed to marshal login session: %w", err)
	}

	key := "login_otp:" + sessionID
	if err := database.Redis.Set(ctx, key, data, loginOTPTTL).Err(); err != nil {
		return "", fmt.Errorf("failed to store login session: %w", err)
	}

	// Queue OTP email
	emailMsg := &model.EmailOutbox{
		ID:           uuid.New().String(),
		ToAddress:    user.Email,
		Subject:      "Your Budgeteer login code",
		Body:         fmt.Sprintf("Your login verification code is: %s\n\nThis code expires in 5 minutes.", otpCode),
		Status:       "pending",
		ScheduledFor: now,
		CreatedAt:    now,
	}
	if err := s.EmailRepo.Create(ctx, emailMsg); err != nil {
		return "", fmt.Errorf("failed to queue login email: %w", err)
	}

	return sessionID, nil
}

// LoginVerifyOTP validates the OTP code and returns a JWT token.
func (s *AuthService) LoginVerifyOTP(ctx context.Context, sessionID, code string) (*model.User, string, error) {
	key := "login_otp:" + sessionID
	data, err := database.Redis.Get(ctx, key).Bytes()
	if err != nil {
		return nil, "", fmt.Errorf("invalid or expired login session")
	}

	var session loginOTPSession
	if err := json.Unmarshal(data, &session); err != nil {
		return nil, "", fmt.Errorf("failed to parse login session: %w", err)
	}

	// Check expiry
	if time.Now().Unix() > session.ExpiresAt {
		database.Redis.Del(ctx, key)
		return nil, "", fmt.Errorf("OTP has expired, please log in again")
	}

	// Validate OTP code
	if err := bcrypt.CompareHashAndPassword([]byte(session.OTPCodeHash), []byte(code)); err != nil {
		return nil, "", fmt.Errorf("invalid OTP code")
	}

	// Clean up used session
	database.Redis.Del(ctx, key)

	// Look up user and generate JWT
	user, err := s.UserRepo.FindByID(ctx, session.UserID)
	if err != nil || user == nil {
		return nil, "", fmt.Errorf("user not found")
	}

	token, _, err := GenerateJWT(user.ID, user.Email)
	if err != nil {
		return nil, "", fmt.Errorf("failed to generate token: %w", err)
	}

	return user, token, nil
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

func (s *AuthService) ChangePassword(ctx context.Context, userID, newPasswordHash, newEncryptedKey string) error {
	// When a password changes, all stored device secrets should be invalidated
	// because they are bound to the old password via bcrypt(device_token + fingerprint + password).
	if err := s.AccessSecretRepo.DeleteAllByUser(ctx, userID); err != nil {
		logger.Error("Failed to clear access secrets after password change for user %s: %v", userID, err)
	}
	return s.UserRepo.UpdatePasswordAndKey(ctx, userID, newPasswordHash, newEncryptedKey)
}

// ResendLoginOTP generates a new OTP for an existing login session and
// queues a new email. It returns an error if the session is expired or invalid.
// Rate limiting (1 request per minute per session) is handled by the caller.
func (s *AuthService) ResendLoginOTP(ctx context.Context, sessionID string) error {
	key := "login_otp:" + sessionID
	data, err := database.Redis.Get(ctx, key).Bytes()
	if err != nil {
		return fmt.Errorf("invalid or expired login session")
	}

	var session loginOTPSession
	if err := json.Unmarshal(data, &session); err != nil {
		return fmt.Errorf("failed to parse login session: %w", err)
	}

	// Check expiry
	if time.Now().Unix() > session.ExpiresAt {
		database.Redis.Del(ctx, key)
		return fmt.Errorf("OTP has expired, please log in again")
	}

	// Generate new OTP
	otpCode := fmt.Sprintf("%06d", time.Now().UnixNano()%1000000)
	otpHash, err := HashPassword(otpCode)
	if err != nil {
		return fmt.Errorf("failed to hash OTP: %w", err)
	}

	// Update session with new OTP
	session.OTPCodeHash = otpHash
	updatedData, err := json.Marshal(session)
	if err != nil {
		return fmt.Errorf("failed to marshal updated session: %w", err)
	}

	ttl := time.Until(time.Unix(session.ExpiresAt, 0))
	if err := database.Redis.Set(ctx, key, updatedData, ttl).Err(); err != nil {
		return fmt.Errorf("failed to update login session: %w", err)
	}

	// Queue new OTP email
	emailMsg := &model.EmailOutbox{
		ID:           uuid.New().String(),
		ToAddress:    session.Email,
		Subject:      "Your new Budgeteer login code",
		Body:         fmt.Sprintf("Your new login verification code is: %s\n\nThis code expires in %d minutes.", otpCode, int(ttl.Minutes())),
		Status:       "pending",
		ScheduledFor: time.Now(),
		CreatedAt:    time.Now(),
	}
	if err := s.EmailRepo.Create(ctx, emailMsg); err != nil {
		return fmt.Errorf("failed to queue login email: %w", err)
	}

	return nil
}

// ResendRegistrationOTP generates a new OTP for an existing pending registration.
func (s *AuthService) ResendRegistrationOTP(ctx context.Context, email string) error {
	pendingKey := "pending_reg:" + email
	data, err := database.Redis.Get(ctx, pendingKey).Bytes()
	if err != nil {
		return fmt.Errorf("no pending registration found for this email")
	}

	var pending pendingRegistration
	if err := json.Unmarshal(data, &pending); err != nil {
		return fmt.Errorf("failed to parse pending registration: %w", err)
	}

	// Check expiry
	if time.Now().Unix() > pending.OTPExpiresAt {
		database.Redis.Del(ctx, pendingKey)
		return fmt.Errorf("OTP has expired, please register again")
	}

	// Generate new OTP
	otpCode := fmt.Sprintf("%06d", time.Now().UnixNano()%1000000)
	otpHash, err := HashPassword(otpCode)
	if err != nil {
		return fmt.Errorf("failed to hash OTP: %w", err)
	}

	// Update pending registration with new OTP
	pending.OTPCodeHash = otpHash
	updatedData, err := json.Marshal(pending)
	if err != nil {
		return fmt.Errorf("failed to marshal updated registration: %w", err)
	}

	ttl := time.Until(time.Unix(pending.OTPExpiresAt, 0))
	if err := database.Redis.Set(ctx, pendingKey, updatedData, ttl).Err(); err != nil {
		return fmt.Errorf("failed to update pending registration: %w", err)
	}

	// Queue new OTP email
	emailMsg := &model.EmailOutbox{
		ID:           uuid.New().String(),
		ToAddress:    email,
		Subject:      "Verify your Budgeteer account",
		Body:         fmt.Sprintf("Your new verification code is: %s\n\nThis code expires in %d minutes.", otpCode, int(ttl.Minutes())),
		Status:       "pending",
		ScheduledFor: time.Now(),
		CreatedAt:    time.Now(),
	}
	if err := s.EmailRepo.Create(ctx, emailMsg); err != nil {
		return fmt.Errorf("failed to queue verification email: %w", err)
	}

	return nil
}

// ---------------------------------------------------------------------------
// Device-based login (remember device — skip OTP)
// ---------------------------------------------------------------------------

// LoginWithDevice authenticates the user and checks if the device token
// matches a stored access secret. If valid, it returns a JWT directly,
// bypassing the OTP step.
func (s *AuthService) LoginWithDevice(ctx context.Context, req *model.LoginWithDeviceRequest) (*model.User, string, error) {
	user, err := s.UserRepo.FindByEmail(ctx, req.Email)
	if err != nil {
		return nil, "", fmt.Errorf("database error: %w", err)
	}
	if user == nil {
		return nil, "", fmt.Errorf("invalid email or password")
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		return nil, "", fmt.Errorf("invalid email or password")
	}

	if !user.IsVerified {
		return nil, "", fmt.Errorf("email not verified")
	}

	// Find a stored access secret for this user + device fingerprint
	secret, err := s.AccessSecretRepo.FindByUserAndFingerprint(ctx, user.ID, req.FingerprintHash)
	if err != nil {
		return nil, "", fmt.Errorf("database error: %w", err)
	}
	if secret == nil {
		return nil, "", fmt.Errorf("device not recognized")
	}

	// Verify the device token by comparing SHA-256(device_token + fingerprint + password)
	// with the stored secret_hash.
	payload := req.DeviceToken + req.FingerprintHash + req.Password
	hash := sha256.Sum256([]byte(payload))
	expected := hex.EncodeToString(hash[:])
	if expected != secret.SecretHash {
		return nil, "", fmt.Errorf("device not recognized")
	}

	// Update last_used timestamp
	if err := s.AccessSecretRepo.UpdateLastUsed(ctx, secret.ID); err != nil {
		logger.Error("Failed to update last_used for access secret %s: %v", secret.ID, err)
	}

	token, _, err := GenerateJWT(user.ID, user.Email)
	if err != nil {
		return nil, "", fmt.Errorf("failed to generate token: %w", err)
	}

	return user, token, nil
}

// StoreAccessSecret saves a new access secret hash for a device.
// The secret_hash should already be a bcrypt hash computed client-side as:
//
//	bcrypt(device_token + fingerprint_hash + password)
//
// This binds the device token to both the device fingerprint and the password.
// Changing the password invalidates all device secrets since the hash no longer matches.
func (s *AuthService) StoreAccessSecret(ctx context.Context, userID string, req *model.StoreAccessSecretRequest) error {
	now := time.Now()
	secret := &model.AccessSecret{
		ID:              uuid.New().String(),
		UserID:          userID,
		FingerprintHash: req.FingerprintHash,
		SecretHash:      req.SecretHash,
		DeviceName:      req.DeviceName,
		CreatedAt:       now,
	}
	return s.AccessSecretRepo.Create(ctx, secret)
}

// ListAccessSecrets returns all stored devices for the user.
func (s *AuthService) ListAccessSecrets(ctx context.Context, userID string) ([]*model.AccessSecret, error) {
	return s.AccessSecretRepo.ListByUserID(ctx, userID)
}

// RemoveAccessSecret deletes a stored device secret.
func (s *AuthService) RemoveAccessSecret(ctx context.Context, userID, secretID string) error {
	return s.AccessSecretRepo.Delete(ctx, secretID, userID)
}
