package repository

import (
	"context"
	"fmt"
	"strings"
	"time"

	"budgeteer-backend/internal/database"
	"budgeteer-backend/internal/model"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type CategoryRepository struct{}

// ListByUser returns all categories for a given user, ordered by creation date.
func (r *CategoryRepository) ListByUser(ctx context.Context, userID string) ([]*model.UserCategory, error) {
	query := `SELECT id, user_id, name, type, color, icon, is_disabled, created_at
	          FROM user_categories WHERE user_id = $1 ORDER BY created_at ASC`
	rows, err := database.Pool.Query(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var categories []*model.UserCategory
	for rows.Next() {
		cat := &model.UserCategory{}
		if err := rows.Scan(&cat.ID, &cat.UserID, &cat.Name, &cat.Type, &cat.Color, &cat.Icon, &cat.IsDisabled, &cat.CreatedAt); err != nil {
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
	query := `INSERT INTO user_categories (id, user_id, name, type, color, icon, is_disabled, created_at)
	          VALUES ($1, $2, $3, $4, NULL, NULL, FALSE, $5)`
	_, err := database.Pool.Exec(ctx, query, cat.ID, cat.UserID, cat.Name, cat.Type, cat.CreatedAt)
	if err != nil {
		return nil, err
	}
	return cat, nil
}

// FindByID returns a single category by id.
func (r *CategoryRepository) FindByID(ctx context.Context, id string) (*model.UserCategory, error) {
	query := `SELECT id, user_id, name, type, color, icon, is_disabled, created_at
	          FROM user_categories WHERE id = $1`
	cat := &model.UserCategory{}
	err := database.Pool.QueryRow(ctx, query, id).Scan(&cat.ID, &cat.UserID, &cat.Name, &cat.Type, &cat.Color, &cat.Icon, &cat.IsDisabled, &cat.CreatedAt)
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

// Update modifies category fields (name, color, icon, is_disabled) for a given category.
// Only non-nil fields are updated.
func (r *CategoryRepository) Update(ctx context.Context, id, userID string, req *model.UpdateUserCategoryRequest) (*model.UserCategory, error) {
	// Build SET clause dynamically
	setClauses := []string{}
	args := []interface{}{}
	argIdx := 1

	if req.Name != nil {
		setClauses = append(setClauses, fmt.Sprintf("name = $%d", argIdx))
		args = append(args, *req.Name)
		argIdx++
	}
	if req.Color != nil {
		setClauses = append(setClauses, fmt.Sprintf("color = $%d", argIdx))
		args = append(args, *req.Color)
		argIdx++
	}
	if req.Icon != nil {
		setClauses = append(setClauses, fmt.Sprintf("icon = $%d", argIdx))
		args = append(args, *req.Icon)
		argIdx++
	}
	if req.IsDisabled != nil {
		setClauses = append(setClauses, fmt.Sprintf("is_disabled = $%d", argIdx))
		args = append(args, *req.IsDisabled)
		argIdx++
	}

	if len(setClauses) == 0 {
		// Nothing to update, return current state
		return r.FindByID(ctx, id)
	}

	args = append(args, id, userID)
	query := fmt.Sprintf(
		`UPDATE user_categories SET %s WHERE id = $%d AND user_id = $%d RETURNING id, user_id, name, type, color, icon, is_disabled, created_at`,
		strings.Join(setClauses, ", "),
		argIdx,
		argIdx+1,
	)

	cat := &model.UserCategory{}
	err := database.Pool.QueryRow(ctx, query, args...).Scan(
		&cat.ID, &cat.UserID, &cat.Name, &cat.Type, &cat.Color, &cat.Icon, &cat.IsDisabled, &cat.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return cat, nil
}
