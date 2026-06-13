package repository

import (
	"context"
	"time"

	"budgeteer-backend/internal/database"
	"budgeteer-backend/internal/model"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type CategoryRepository struct{}

// ListByUser returns all categories for a given user, ordered by creation date.
func (r *CategoryRepository) ListByUser(ctx context.Context, userID string) ([]*model.UserCategory, error) {
	query := `SELECT id, user_id, name, type, created_at
	          FROM user_categories WHERE user_id = $1 ORDER BY created_at ASC`
	rows, err := database.Pool.Query(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var categories []*model.UserCategory
	for rows.Next() {
		cat := &model.UserCategory{}
		if err := rows.Scan(&cat.ID, &cat.UserID, &cat.Name, &cat.Type, &cat.CreatedAt); err != nil {
			return nil, err
		}
		categories = append(categories, cat)
	}
	return categories, rows.Err()
}

// Create inserts a new user category.
func (r *CategoryRepository) Create(ctx context.Context, userID, name, catType string) (*model.UserCategory, error) {
	cat := &model.UserCategory{
		ID:        uuid.New().String(),
		UserID:    userID,
		Name:      name,
		Type:      catType,
		CreatedAt: time.Now(),
	}
	query := `INSERT INTO user_categories (id, user_id, name, type, created_at)
	          VALUES ($1, $2, $3, $4, $5)`
	_, err := database.Pool.Exec(ctx, query, cat.ID, cat.UserID, cat.Name, cat.Type, cat.CreatedAt)
	if err != nil {
		return nil, err
	}
	return cat, nil
}

// FindByID returns a single category by id.
func (r *CategoryRepository) FindByID(ctx context.Context, id string) (*model.UserCategory, error) {
	query := `SELECT id, user_id, name, type, created_at
	          FROM user_categories WHERE id = $1`
	cat := &model.UserCategory{}
	err := database.Pool.QueryRow(ctx, query, id).Scan(&cat.ID, &cat.UserID, &cat.Name, &cat.Type, &cat.CreatedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return cat, nil
}

// Delete removes a category by id (scoped to the user as a safety check).
func (r *CategoryRepository) Delete(ctx context.Context, id, userID string) error {
	query := `DELETE FROM user_categories WHERE id = $1 AND user_id = $2`
	_, err := database.Pool.Exec(ctx, query, id, userID)
	return err
}
