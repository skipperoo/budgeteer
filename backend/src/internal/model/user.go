package model

import "time"

type User struct {
	ID                  string    `json:"id"`
	Email               string    `json:"email"`
	PasswordHash        string    `json:"-"`
	PublicKey           string    `json:"public_key"`
	EncryptedPrivateKey string    `json:"encrypted_private_key"`
	IsVerified          bool      `json:"is_verified"`
	CreatedAt           time.Time `json:"created_at"`
	UpdatedAt           time.Time `json:"updated_at"`
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
	ID                  string `json:"id"`
	Email               string `json:"email"`
	PublicKey           string `json:"public_key"`
	EncryptedPrivateKey string `json:"encrypted_private_key"`
	IsVerified          bool   `json:"is_verified"`
}
