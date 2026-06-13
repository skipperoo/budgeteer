package model

import "time"

type MasterCategory struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Type string `json:"type"` // income, expense
}

type Subcategory struct {
	ID               string    `json:"id"`
	MasterCategoryID string    `json:"master_category_id"`
	CreatedBy        string    `json:"created_by"`
	Name             string    `json:"name"`
	CreatedAt        time.Time `json:"created_at"`
}

// UserCategory represents a user-defined category stored on the backend.
type UserCategory struct {
	ID        string    `json:"id"`
	UserID    string    `json:"user_id"`
	Name      string    `json:"name"`
	Type      string    `json:"type"` // "income" | "expense"
	CreatedAt time.Time `json:"created_at"`
}

// CreateUserCategoryRequest is the payload for creating a new category.
type CreateUserCategoryRequest struct {
	Name string `json:"name"`
	Type string `json:"type"`
}
