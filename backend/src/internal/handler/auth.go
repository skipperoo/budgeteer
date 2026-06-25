package handler

import (
	"encoding/json"
	"net/http"
	"time"

	"budgeteer-backend/internal/database"
	"budgeteer-backend/internal/logger"
	"budgeteer-backend/internal/middleware"
	"budgeteer-backend/internal/model"
	"budgeteer-backend/internal/service"

	"golang.org/x/crypto/bcrypt"
)

func Register(w http.ResponseWriter, r *http.Request) {
	var req model.RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(model.Error{Error: "invalid request body"})
		return
	}
	defer r.Body.Close()

	if err := service.Auth.Register(r.Context(), &req); err != nil {
		w.Header().Set("Content-Type", "application/json")
		code := http.StatusConflict
		// Distinguish between conflict (already registered) and other errors
		if err.Error() == "verification already pending for this email" {
			code = http.StatusConflict
		}
		w.WriteHeader(code)
		json.NewEncoder(w).Encode(model.Error{Error: err.Error()})
		return
	}

	logger.Info("User registered (pending OTP): %s", req.Email)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{"message": "registration successful, check email for OTP"})
}

func VerifyOTP(w http.ResponseWriter, r *http.Request) {
	var req model.VerifyOTPRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(model.Error{Error: "invalid request body"})
		return
	}
	defer r.Body.Close()

	user, err := service.Auth.VerifyOTP(r.Context(), req.Email, req.Code)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		code := http.StatusBadRequest
		if err.Error() == "OTP has expired, please register again" {
			code = http.StatusGone
		}
		w.WriteHeader(code)
		json.NewEncoder(w).Encode(model.Error{Error: err.Error()})
		return
	}

	logger.Info("User verified and registered: %s", user.Email)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "email verified successfully"})
}

func Login(w http.ResponseWriter, r *http.Request) {
	var req model.LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(model.Error{Error: "invalid request body"})
		return
	}
	defer r.Body.Close()

	sessionID, err := service.Auth.LoginInit(r.Context(), req.Email, req.Password)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(model.Error{Error: err.Error()})
		return
	}

	logger.Info("Login OTP sent to: %s", req.Email)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(model.LoginInitResponse{SessionID: sessionID})
}

func LoginVerifyOTP(w http.ResponseWriter, r *http.Request) {
	var req model.LoginVerifyOTPRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(model.Error{Error: "invalid request body"})
		return
	}
	defer r.Body.Close()

	user, token, err := service.Auth.LoginVerifyOTP(r.Context(), req.SessionID, req.Code)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		code := http.StatusBadRequest
		if err.Error() == "OTP has expired, please log in again" {
			code = http.StatusGone
		}
		w.WriteHeader(code)
		json.NewEncoder(w).Encode(model.Error{Error: err.Error()})
		return
	}

	logger.Info("User logged in via OTP: %s", user.Email)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(model.LoginResponse{Token: token})
}

func Logout(w http.ResponseWriter, r *http.Request) {
	raw := r.Header.Get("Authorization")
	if raw == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(model.Error{Error: "unauthorized"})
		return
	}

	_, tokenString, expiresAt, err := service.ValidateJWT(raw)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(model.Error{Error: "unauthorized"})
		return
	}

	if err := service.Auth.Logout(r.Context(), tokenString, expiresAt); err != nil {
		logger.Error("Failed to block token: %v", err)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "logged out successfully"})
}

func GetKeys(w http.ResponseWriter, r *http.Request) {
	claims, ok := r.Context().Value(middleware.ClaimsKey).(*model.UserClaims)
	if !ok || claims == nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(model.Error{Error: "unauthorized"})
		return
	}

	user, err := service.Auth.UserRepo.FindByID(r.Context(), claims.UserID)
	if err != nil || user == nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(model.Error{Error: "user not found"})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(model.KeysResponse{EncryptedPrivateKey: user.EncryptedPrivateKey})
}

func Me(w http.ResponseWriter, r *http.Request) {
	claims, ok := r.Context().Value(middleware.ClaimsKey).(*model.UserClaims)
	if !ok || claims == nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(model.Error{Error: "unauthorized"})
		return
	}

	user, err := service.Auth.UserRepo.FindByID(r.Context(), claims.UserID)
	if err != nil || user == nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(model.Error{Error: "user not found"})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(model.UserResponse{
		ID:                  user.ID,
		Email:               user.Email,
		PublicKey:           user.PublicKey,
		EncryptedPrivateKey: user.EncryptedPrivateKey,
		IsVerified:          user.IsVerified,
		Preferences:         user.Preferences,
	})
}

// LoginWithDevice checks device credentials and returns a JWT directly,
// bypassing the OTP step for recognized devices.
func LoginWithDevice(w http.ResponseWriter, r *http.Request) {
	var req model.LoginWithDeviceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(model.Error{Error: "invalid request body"})
		return
	}
	defer r.Body.Close()

	user, token, err := service.Auth.LoginWithDevice(r.Context(), &req)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(model.Error{Error: err.Error()})
		return
	}

	logger.Info("User logged in via device: %s", user.Email)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(model.LoginResponse{Token: token})
}

// StoreAccessSecret records a new device secret for the authenticated user.
func StoreAccessSecret(w http.ResponseWriter, r *http.Request) {
	claims, ok := r.Context().Value(middleware.ClaimsKey).(*model.UserClaims)
	if !ok || claims == nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(model.Error{Error: "unauthorized"})
		return
	}

	var req model.StoreAccessSecretRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(model.Error{Error: "invalid request body"})
		return
	}
	defer r.Body.Close()

	if err := service.Auth.StoreAccessSecret(r.Context(), claims.UserID, &req); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(model.Error{Error: "failed to store device secret"})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{"message": "device stored successfully"})
}

// ListAccessSecrets returns all remembered devices for the authenticated user.
func ListAccessSecrets(w http.ResponseWriter, r *http.Request) {
	claims, ok := r.Context().Value(middleware.ClaimsKey).(*model.UserClaims)
	if !ok || claims == nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(model.Error{Error: "unauthorized"})
		return
	}

	secrets, err := service.Auth.ListAccessSecrets(r.Context(), claims.UserID)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(model.Error{Error: "failed to list devices"})
		return
	}
	if secrets == nil {
		secrets = []*model.AccessSecret{}
	}

	// Redact the secret_hash from the response
	type SafeAccessSecret struct {
		ID             string     `json:"id"`
		DeviceName     string     `json:"device_name,omitempty"`
		LastUsedAt     *time.Time `json:"last_used_at,omitempty"`
		CreatedAt      time.Time  `json:"created_at"`
	}
	safeList := make([]SafeAccessSecret, len(secrets))
	for i, s := range secrets {
		safeList[i] = SafeAccessSecret{
			ID:         s.ID,
			DeviceName: s.DeviceName,
			LastUsedAt: s.LastUsedAt,
			CreatedAt:  s.CreatedAt,
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"devices": safeList})
}

// RemoveAccessSecret deletes a remembered device for the authenticated user.
func RemoveAccessSecret(w http.ResponseWriter, r *http.Request) {
	claims, ok := r.Context().Value(middleware.ClaimsKey).(*model.UserClaims)
	if !ok || claims == nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(model.Error{Error: "unauthorized"})
		return
	}

	secretID := r.PathValue("id")
	if secretID == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(model.Error{Error: "missing device id"})
		return
	}

	if err := service.Auth.RemoveAccessSecret(r.Context(), claims.UserID, secretID); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(model.Error{Error: "failed to remove device"})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "device removed successfully"})
}

func ChangePassword(w http.ResponseWriter, r *http.Request) {
	claims, ok := r.Context().Value(middleware.ClaimsKey).(*model.UserClaims)
	if !ok || claims == nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(model.Error{Error: "unauthorized"})
		return
	}

	var req struct {
		Password               string `json:"password"`
		NewPassword            string `json:"new_password"`
		NewEncryptedPrivateKey string `json:"new_encrypted_private_key"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(model.Error{Error: "invalid request body"})
		return
	}
	defer r.Body.Close()

	if req.NewPassword == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(model.Error{Error: "new_password is required"})
		return
	}

	user, err := service.Auth.UserRepo.FindByID(r.Context(), claims.UserID)
	if err != nil || user == nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(model.Error{Error: "user not found"})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(model.Error{Error: "invalid password"})
		return
	}

	newPasswordHash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(model.Error{Error: "failed to hash new password"})
		return
	}

	if err := service.Auth.ChangePassword(r.Context(), claims.UserID, string(newPasswordHash), req.NewEncryptedPrivateKey); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(model.Error{Error: "failed to update password"})
		return
	}

	// Issue a fresh JWT so the user stays logged in
	newToken, _, err := service.GenerateJWT(user.ID, user.Email)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(model.Error{Error: "password updated but failed to generate token"})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"message":                "password changed successfully",
		"token":                  newToken,
		"encrypted_private_key":  req.NewEncryptedPrivateKey,
	})
}

// ResendOTP generates a new OTP for an existing login session or pending
// registration. Accepts either session_id (login) or email (registration).
// Rate-limited to 1 request per minute per session/email (Redis-based).
// POST /api/v1/auth/resend-otp
func ResendOTP(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SessionID string `json:"session_id"`
		Email     string `json:"email"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(model.Error{Error: "invalid request body"})
		return
	}
	defer r.Body.Close()

	if req.SessionID == "" && req.Email == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(model.Error{Error: "either session_id or email is required"})
		return
	}

	// Build rate limit key based on what was provided
	var rateLimitKey string
	if req.SessionID != "" {
		rateLimitKey = "otp_resend:" + req.SessionID
	} else {
		rateLimitKey = "otp_resend:reg:" + req.Email
	}

	// Redis rate limit: 1 request per minute
	exists, err := database.Redis.Exists(r.Context(), rateLimitKey).Result()
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(model.Error{Error: "rate limit check failed"})
		return
	}
	if exists > 0 {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusTooManyRequests)
		json.NewEncoder(w).Encode(model.Error{Error: "please wait before requesting a new code"})
		return
	}

	var svcErr error
	if req.SessionID != "" {
		svcErr = service.Auth.ResendLoginOTP(r.Context(), req.SessionID)
	} else {
		svcErr = service.Auth.ResendRegistrationOTP(r.Context(), req.Email)
	}

	if svcErr != nil {
		w.Header().Set("Content-Type", "application/json")
		code := http.StatusBadRequest
		errMsg := svcErr.Error()
		if errMsg == "OTP has expired, please log in again" || errMsg == "OTP has expired, please register again" {
			code = http.StatusGone
		}
		w.WriteHeader(code)
		json.NewEncoder(w).Encode(model.Error{Error: errMsg})
		return
	}

	// Set rate limit key with 60s TTL
	database.Redis.Set(r.Context(), rateLimitKey, "1", time.Minute)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "new code sent"})
}
