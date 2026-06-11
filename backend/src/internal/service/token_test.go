package service

import (
	"crypto/rand"
	"encoding/base64"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

func TestGenerateJWT(t *testing.T) {
	tokenString, expiresAt, err := GenerateJWT("user-1", "test@example.com")
	if err != nil {
		t.Fatalf("GenerateJWT failed: %v", err)
	}
	if tokenString == "" {
		t.Fatal("GenerateJWT returned empty token")
	}
	if expiresAt.Before(time.Now()) {
		t.Fatal("JWT expiration should be in the future")
	}
	parts := strings.Split(tokenString, ".")
	if len(parts) != 3 {
		t.Fatal("JWT should have 3 parts separated by dots")
	}
}

func TestGenerateJWT_DifferentUsers(t *testing.T) {
	t1, _, _ := GenerateJWT("user-1", "a@test.com")
	t2, _, _ := GenerateJWT("user-2", "b@test.com")
	if t1 == t2 {
		t.Fatal("Different users should get different tokens")
	}
}

func TestValidateJWT_ValidToken(t *testing.T) {
	tokenString, _, _ := GenerateJWT("user-1", "test@example.com")
	authHeader := "Bearer " + tokenString

	claims, token, expiresAt, err := ValidateJWT(authHeader)
	if err != nil {
		t.Fatalf("ValidateJWT failed: %v", err)
	}
	if claims == nil {
		t.Fatal("ValidateJWT returned nil claims")
	}
	if claims.UserID != "user-1" {
		t.Fatalf("Expected user_id 'user-1', got %q", claims.UserID)
	}
	if claims.Email != "test@example.com" {
		t.Fatalf("Expected email 'test@example.com', got %q", claims.Email)
	}
	if token != tokenString {
		t.Fatal("ValidateJWT should return the original token string")
	}
	if expiresAt.IsZero() {
		t.Fatal("ValidateJWT should return non-zero expiration")
	}
}

func TestValidateJWT_InvalidAuthHeader(t *testing.T) {
	tests := []struct {
		name    string
		header  string
		wantErr string
	}{
		{"empty header", "", "invalid authorization header format"},
		{"no bearer", "token-only", "invalid authorization header format"},
		{"wrong case", "bearer token", ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, _, _, err := ValidateJWT(tt.header)
			if err == nil {
				if tt.wantErr != "" {
					t.Fatalf("expected error containing %q, got nil", tt.wantErr)
				}
				return
			}
			if tt.wantErr != "" && !strings.Contains(err.Error(), tt.wantErr) {
				t.Fatalf("expected error containing %q, got %q", tt.wantErr, err.Error())
			}
		})
	}
}

func TestValidateJWT_WrongSecret(t *testing.T) {
	claims := jwt.MapClaims{
		"user_id": "user-1",
		"email":   "test@test.com",
		"exp":     time.Now().Add(1 * time.Hour).Unix(),
		"iat":     time.Now().Unix(),
	}
	wrongKey := []byte("wrong-secret-key-for-testing")
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, _ := token.SignedString(wrongKey)

	_, _, _, err := ValidateJWT("Bearer " + tokenString)
	if err == nil {
		t.Fatal("ValidateJWT should fail for token signed with wrong secret")
	}
}

func TestValidateJWT_ExpiredToken(t *testing.T) {
	claims := jwt.MapClaims{
		"user_id": "user-1",
		"email":   "test@test.com",
		"exp":     time.Now().Add(-1 * time.Hour).Unix(),
		"iat":     time.Now().Add(-2 * time.Hour).Unix(),
	}
	jwtSecret := GetenvOrDefault("JWT_SECRET", "default-dev-secret-change-in-production")
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, _ := token.SignedString([]byte(jwtSecret))

	_, _, _, err := ValidateJWT("Bearer " + tokenString)
	if err == nil {
		t.Fatal("ValidateJWT should fail for expired token")
	}
}

func TestValidateUserJWT_Valid(t *testing.T) {
	tokenString, _, _ := GenerateJWT("user-1", "test@test.com")
	ok, err := ValidateUserJWT("Bearer "+tokenString, "admin")
	if err != nil {
		t.Fatalf("ValidateUserJWT failed: %v", err)
	}
	if !ok {
		t.Fatal("ValidateUserJWT should return true for valid token")
	}
}

func TestGenerateDeviceJWT(t *testing.T) {
	key := make([]byte, 32)
	rand.Read(key)
	encodedKey := base64.StdEncoding.EncodeToString(key)

	token, err := GenerateDeviceJWT(encodedKey, "device-1")
	if err != nil {
		t.Fatalf("GenerateDeviceJWT failed: %v", err)
	}
	if token == "" {
		t.Fatal("GenerateDeviceJWT returned empty token")
	}
}

func TestGenerateDeviceJWT_InvalidKey(t *testing.T) {
	_, err := GenerateDeviceJWT("not-valid-base64!!!", "device-1")
	if err == nil {
		t.Fatal("GenerateDeviceJWT should fail with invalid base64 key")
	}
}

func TestValidateDeviceJWT_Valid(t *testing.T) {
	key := make([]byte, 32)
	rand.Read(key)
	encodedKey := base64.StdEncoding.EncodeToString(key)

	token, _ := GenerateDeviceJWT(encodedKey, "device-1")
	ok, claims, err := ValidateDeviceJWT(encodedKey, token)
	if err != nil {
		t.Fatalf("ValidateDeviceJWT failed: %v", err)
	}
	if !ok {
		t.Fatal("ValidateDeviceJWT should return true")
	}
	if claims["device_id"] != "device-1" {
		t.Fatalf("Expected device_id 'device-1', got %v", claims["device_id"])
	}
}

func TestValidateDeviceJWT_WrongKey(t *testing.T) {
	key1 := make([]byte, 32)
	rand.Read(key1)
	encodedKey1 := base64.StdEncoding.EncodeToString(key1)

	key2 := make([]byte, 32)
	rand.Read(key2)
	encodedKey2 := base64.StdEncoding.EncodeToString(key2)

	token, _ := GenerateDeviceJWT(encodedKey1, "device-1")
	ok, _, err := ValidateDeviceJWT(encodedKey2, token)
	if err == nil {
		t.Fatal("ValidateDeviceJWT should fail with wrong key")
	}
	if ok {
		t.Fatal("ValidateDeviceJWT should return false with wrong key")
	}
}

func TestGeneratePrivateKey(t *testing.T) {
	key, err := GeneratePrivateKey()
	if err != nil {
		t.Fatalf("GeneratePrivateKey failed: %v", err)
	}
	if key == "" {
		t.Fatal("GeneratePrivateKey returned empty key")
	}
	decoded, err := base64.StdEncoding.DecodeString(key)
	if err != nil {
		t.Fatalf("GeneratePrivateKey returned invalid base64: %v", err)
	}
	if len(decoded) != 32 {
		t.Fatalf("GeneratePrivateKey returned key of length %d, want 32", len(decoded))
	}
}

func TestGeneratePrivateKey_Unique(t *testing.T) {
	k1, _ := GeneratePrivateKey()
	k2, _ := GeneratePrivateKey()
	_ = k1
	_ = k2
}
