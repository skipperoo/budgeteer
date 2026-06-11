package handler

import (
	"encoding/json"
	"net/http"

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

	user, token, err := service.Auth.Login(r.Context(), req.Email, req.Password)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(model.Error{Error: err.Error()})
		return
	}

	logger.Info("User logged in: %s", user.Email)
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
	})
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
		NewEncryptedPrivateKey string `json:"new_encrypted_private_key"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(model.Error{Error: "invalid request body"})
		return
	}
	defer r.Body.Close()

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

	if err := service.Auth.ChangePassword(r.Context(), claims.UserID, req.NewEncryptedPrivateKey); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(model.Error{Error: "failed to update key"})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "password changed successfully"})
}
