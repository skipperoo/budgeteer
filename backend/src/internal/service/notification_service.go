package service

import (
	"context"
	"encoding/json"

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

// CreateNotification creates a new in-app notification for a user.
// data is optional JSON-serializable metadata.
func (s *NotificationService) CreateNotification(ctx context.Context, userID, notifType, title, body string, data map[string]interface{}) error {
	var dataStr *string
	if len(data) > 0 {
		b, err := json.Marshal(data)
		if err != nil {
			return err
		}
		s := string(b)
		dataStr = &s
	}
	return s.NotificationRepo.CreateNotification(ctx, userID, notifType, title, body, dataStr)
}


