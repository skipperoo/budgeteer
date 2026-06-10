package service

import (
	"encoding/base64"
	"fmt"
	"strings"
	"time"

	"budgeteer-backend/internal/model"

	"github.com/golang-jwt/jwt/v5"
)

func GenerateJWT(userID, email string) (string, time.Time, error) {
	expiresAt := time.Now().Add(24 * time.Hour)
	claims := jwt.MapClaims{
		"user_id": userID,
		"email":   email,
		"exp":     expiresAt.Unix(),
		"iat":     time.Now().Unix(),
		"jti":     fmt.Sprintf("%s-%d", userID, time.Now().UnixNano()),
	}

	jwtSecret := GetenvOrDefault("JWT_SECRET", "default-dev-secret-change-in-production")

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString([]byte(jwtSecret))
	if err != nil {
		return "", time.Time{}, fmt.Errorf("failed to sign JWT: %w", err)
	}

	return tokenString, expiresAt, nil
}

func ValidateJWT(authHeader string) (*model.UserClaims, string, time.Time, error) {
	parts := strings.SplitN(authHeader, " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "bearer") {
		return nil, "", time.Time{}, fmt.Errorf("invalid authorization header format")
	}
	tokenString := parts[1]

	jwtSecret := GetenvOrDefault("JWT_SECRET", "default-dev-secret-change-in-production")

	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (any, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return []byte(jwtSecret), nil
	})
	if err != nil {
		return nil, "", time.Time{}, fmt.Errorf("invalid token: %w", err)
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok || !token.Valid {
		return nil, "", time.Time{}, fmt.Errorf("invalid token claims")
	}

	userID, _ := claims["user_id"].(string)
	email, _ := claims["email"].(string)
	var expiresAt time.Time
	if exp, ok := claims["exp"].(float64); ok {
		expiresAt = time.Unix(int64(exp), 0)
	}

	return &model.UserClaims{UserID: userID, Email: email}, tokenString, expiresAt, nil
}

func ValidateUserJWT(authHeader string, role string) (bool, error) {
	claims, _, _, err := ValidateJWT(authHeader)
	if err != nil {
		return false, err
	}
	if claims == nil {
		return false, fmt.Errorf("no claims found")
	}
	return true, nil
}

func GenerateDeviceJWT(encodedKey string, deviceID string) (string, error) {
	secret, err := base64.StdEncoding.DecodeString(encodedKey)
	if err != nil {
		return "", fmt.Errorf("invalid base64 key: %w", err)
	}

	claims := jwt.MapClaims{
		"device_id": deviceID,
		"exp":       time.Now().Add(365 * 24 * time.Hour).Unix(),
		"iat":       time.Now().Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(secret)
}

func ValidateDeviceJWT(encodedKey string, tokenString string) (bool, jwt.MapClaims, error) {
	secret, err := base64.StdEncoding.DecodeString(encodedKey)
	if err != nil {
		return false, nil, fmt.Errorf("invalid base64 key: %w", err)
	}

	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (any, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return false, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return secret, nil
	})
	if err != nil {
		return false, nil, err
	}

	if claims, ok := token.Claims.(jwt.MapClaims); ok && token.Valid {
		return true, claims, nil
	}

	return false, nil, fmt.Errorf("invalid token")
}

func GeneratePrivateKey() (string, error) {
	key := make([]byte, 32)
	encodedKey := base64.StdEncoding.EncodeToString(key)
	return encodedKey, nil
}
