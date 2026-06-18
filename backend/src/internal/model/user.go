package model

import "time"

// UserPreferences stores per-user UI/UX settings persisted to the DB.
type UserPreferences struct {
	AccentColor       string  `json:"accent_color"`
	DefaultCommission float64 `json:"default_commission"`
	DefaultCurrency   string  `json:"default_currency,omitempty"`
	Locale            string  `json:"locale,omitempty"`
	Theme             string  `json:"theme,omitempty"` // "light" or "dark"
}

type User struct {
	ID                  string          `json:"id"`
	Email               string          `json:"email"`
	PasswordHash        string          `json:"-"`
	PublicKey           string          `json:"public_key"`
	EncryptedPrivateKey string          `json:"encrypted_private_key"`
	IsVerified          bool            `json:"is_verified"`
	Preferences         UserPreferences `json:"preferences"`
	CreatedAt           time.Time       `json:"created_at"`
	UpdatedAt           time.Time       `json:"updated_at"`
}

type RegisterRequest struct {
	Email               string `json:"email"`
	Password            string `json:"password"`
	PublicKey           string `json:"public_key"`
	EncryptedPrivateKey string `json:"encrypted_private_key"`
}

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type LoginResponse struct {
	Token string `json:"token"`
}

type LoginInitResponse struct {
	SessionID string `json:"session_id"`
}

type LoginVerifyOTPRequest struct {
	SessionID string `json:"session_id"`
	Code      string `json:"code"`
}

type VerifyOTPRequest struct {
	Email string `json:"email"`
	Code  string `json:"code"`
}

type ChangePasswordRequest struct {
	NewEncryptedPrivateKey string `json:"new_encrypted_private_key"`
	Password               string `json:"password"`
}

type KeysResponse struct {
	EncryptedPrivateKey string `json:"encrypted_private_key"`
}

type UserResponse struct {
	ID                  string          `json:"id"`
	Email               string          `json:"email"`
	PublicKey           string          `json:"public_key"`
	EncryptedPrivateKey string          `json:"encrypted_private_key"`
	IsVerified          bool            `json:"is_verified"`
	Preferences         UserPreferences `json:"preferences"`
}

type UpdatePreferencesRequest struct {
	Preferences UserPreferences `json:"preferences"`
}

// --- Access secrets (remember device) ---

type AccessSecret struct {
	ID               string     `json:"id"`
	UserID           string     `json:"user_id"`
	FingerprintHash  string     `json:"fingerprint_hash"`
	SecretHash       string     `json:"-"`
	DeviceName       string     `json:"device_name,omitempty"`
	LastUsedAt       *time.Time `json:"last_used_at,omitempty"`
	CreatedAt        time.Time  `json:"created_at"`
}

type StoreAccessSecretRequest struct {
	FingerprintHash string `json:"fingerprint_hash"`
	SecretHash      string `json:"secret_hash"`      // bcrypt(token + fingerprint + password)
	DeviceName      string `json:"device_name,omitempty"`
}

type LoginWithDeviceRequest struct {
	Email           string `json:"email"`
	Password        string `json:"password"`
	FingerprintHash string `json:"fingerprint_hash"`
	DeviceToken     string `json:"device_token"` // plaintext token sent from device storage
}
