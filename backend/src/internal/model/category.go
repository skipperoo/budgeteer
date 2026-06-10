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
