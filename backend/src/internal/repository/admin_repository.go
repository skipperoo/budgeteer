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
	"golang.org/x/crypto/bcrypt"
)

type AdminRepository struct{}

// FindByEmail looks up an admin user by email.
func (r *AdminRepository) FindByEmail(ctx context.Context, email string) (*model.AdminUser, error) {
	query := `SELECT id, email, password_hash, display_name, is_active, must_change_password, created_by, created_at, updated_at
	          FROM admin_users WHERE email = $1`
	row := database.Pool.QueryRow(ctx, query, email)
	a := &model.AdminUser{}
	err := row.Scan(&a.ID, &a.Email, &a.PasswordHash, &a.DisplayName, &a.IsActive, &a.MustChangePassword, &a.CreatedBy, &a.CreatedAt, &a.UpdatedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return a, nil
}

// FindByID looks up an admin user by id.
func (r *AdminRepository) FindByID(ctx context.Context, id string) (*model.AdminUser, error) {
	query := `SELECT id, email, password_hash, display_name, is_active, must_change_password, created_by, created_at, updated_at
	          FROM admin_users WHERE id = $1`
	row := database.Pool.QueryRow(ctx, query, id)
	a := &model.AdminUser{}
	err := row.Scan(&a.ID, &a.Email, &a.PasswordHash, &a.DisplayName, &a.IsActive, &a.MustChangePassword, &a.CreatedBy, &a.CreatedAt, &a.UpdatedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return a, nil
}

// ListAll returns all admin users.
func (r *AdminRepository) ListAll(ctx context.Context) ([]*model.AdminUser, error) {
	query := `SELECT id, email, password_hash, display_name, is_active, must_change_password, created_by, created_at, updated_at
	          FROM admin_users ORDER BY created_at ASC`
	rows, err := database.Pool.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var admins []*model.AdminUser
	for rows.Next() {
		a := &model.AdminUser{}
		if err := rows.Scan(&a.ID, &a.Email, &a.PasswordHash, &a.DisplayName, &a.IsActive, &a.MustChangePassword, &a.CreatedBy, &a.CreatedAt, &a.UpdatedAt); err != nil {
			return nil, err
		}
		admins = append(admins, a)
	}
	return admins, nil
}

// Create inserts a new admin user with a bcrypt-hashed password.
func (r *AdminRepository) Create(ctx context.Context, email, password, displayName, createdBy string) (*model.AdminUser, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}
	now := time.Now()
	a := &model.AdminUser{
		ID:                 uuid.New().String(),
		Email:              email,
		PasswordHash:       string(hash),
		DisplayName:        displayName,
		IsActive:           true,
		MustChangePassword: true,
		CreatedBy:          &createdBy,
		CreatedAt:          now,
		UpdatedAt:          now,
	}
	query := `INSERT INTO admin_users (id, email, password_hash, display_name, is_active, must_change_password, created_by, created_at, updated_at)
	          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`
	_, err = database.Pool.Exec(ctx, query,
		a.ID, a.Email, a.PasswordHash, a.DisplayName, a.IsActive, a.MustChangePassword, a.CreatedBy, a.CreatedAt, a.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return a, nil
}

// UpdatePassword updates the admin's password hash and clears the must_change_password flag.
func (r *AdminRepository) UpdatePassword(ctx context.Context, id, newPassword string) error {
	hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	query := `UPDATE admin_users SET password_hash = $1, must_change_password = FALSE, updated_at = $2 WHERE id = $3`
	_, err = database.Pool.Exec(ctx, query, string(hash), time.Now(), id)
	return err
}

// Update updates admin user fields.
func (r *AdminRepository) Update(ctx context.Context, id string, updates map[string]any) error {
	if len(updates) == 0 {
		return nil
	}
	setClauses := []string{}
	args := []any{}
	idx := 1
	for k, v := range updates {
		setClauses = append(setClauses, fmt.Sprintf("%s = $%d", k, idx))
		args = append(args, v)
		idx++
	}
	args = append(args, id)
	query := fmt.Sprintf(`UPDATE admin_users SET %s, updated_at = NOW() WHERE id = $%d`,
		strings.Join(setClauses, ", "), idx)
	_, err := database.Pool.Exec(ctx, query, args...)
	return err
}

// Delete removes an admin user.
func (r *AdminRepository) Delete(ctx context.Context, id string) error {
	query := `DELETE FROM admin_users WHERE id = $1`
	_, err := database.Pool.Exec(ctx, query, id)
	return err
}

// SeedDefaultAdmin creates the default admin if the table is empty.
func (r *AdminRepository) SeedDefaultAdmin(ctx context.Context) error {
	var count int
	err := database.Pool.QueryRow(ctx, `SELECT COUNT(*) FROM admin_users`).Scan(&count)
	if err != nil {
		return err
	}
	if count > 0 {
		return nil
	}
	hash, err := bcrypt.GenerateFromPassword([]byte("changeme"), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	now := time.Now()
	query := `INSERT INTO admin_users (id, email, password_hash, display_name, is_active, must_change_password, created_at, updated_at)
	          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`
	_, err = database.Pool.Exec(ctx, query,
		uuid.New().String(), "admin@budgeteer.com", string(hash),
		"Admin", true, true, now, now)
	return err
}
