package service

import (
	"context"

	"budgeteer-backend/internal/model"
	"budgeteer-backend/internal/repository"
)

type NotificationService struct {
	NotificationRepo *repository.NotificationRepository
}

var Notifications *NotificationService

func InitNotificationService() {
	Notifications = &NotificationService{
		NotificationRepo: &repository.NotificationRepository{},
	}
}

// List returns notifications for a user, newest first.
func (s *NotificationService) List(ctx context.Context, userID string, limit, offset int) ([]*model.Notification, error) {
	return s.NotificationRepo.ListByUserID(ctx, userID, limit, offset)
}

// MarkRead marks a notification as read.
func (s *NotificationService) MarkRead(ctx context.Context, id, userID string) error {
	return s.NotificationRepo.MarkRead(ctx, id, userID)
}

// CountUnread returns the number of unread notifications.
func (s *NotificationService) CountUnread(ctx context.Context, userID string) (int, error) {
	return s.NotificationRepo.CountUnread(ctx, userID)
}


