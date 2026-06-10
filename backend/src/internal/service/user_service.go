package service

import (
	"context"
	"fmt"

	"budgeteer-backend/internal/repository"
)

type UserService struct {
	UserRepo *repository.UserRepository
}

var Users *UserService

func InitUserService() {
	Users = &UserService{
		UserRepo: &repository.UserRepository{},
	}
}

func (s *UserService) LookupPublicKey(ctx context.Context, email string) (string, error) {
	publicKey, err := s.UserRepo.PublicKeyByEmail(ctx, email)
	if err != nil {
		return "", fmt.Errorf("database error: %w", err)
	}
	if publicKey == "" {
		return "", fmt.Errorf("user not found")
	}
	return publicKey, nil
}
