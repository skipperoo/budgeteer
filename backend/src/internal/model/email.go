package model

import "time"

type EmailOutbox struct {
	ID           string    `json:"id"`
	ToAddress    string    `json:"to_address"`
	Subject      string    `json:"subject"`
	Body         string    `json:"body"`
	Status       string    `json:"status"` // pending, sent, failed
	RetryCount   int       `json:"retry_count"`
	ScheduledFor time.Time `json:"scheduled_for"`
	CreatedAt    time.Time `json:"created_at"`
}
