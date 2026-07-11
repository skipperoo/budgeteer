package model

import "time"

type AdminUser struct {
	ID                 string    `json:"id"`
	Email              string    `json:"email"`
	PasswordHash       string    `json:"-"`
	DisplayName        string    `json:"display_name"`
	IsActive           bool      `json:"is_active"`
	MustChangePassword bool      `json:"must_change_password"`
	CreatedBy          *string   `json:"created_by,omitempty"`
	CreatedAt          time.Time `json:"created_at"`
	UpdatedAt          time.Time `json:"updated_at"`
}

type AdminLoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type AdminLoginResponse struct {
	Token              string `json:"token"`
	MustChangePassword bool   `json:"must_change_password"`
	DisplayName        string `json:"display_name"`
}

type AdminCreateRequest struct {
	Email       string `json:"email"`
	Password    string `json:"password"`
	DisplayName string `json:"display_name"`
}

type AdminChangePasswordRequest struct {
	CurrentPassword string `json:"current_password"`
	NewPassword     string `json:"new_password"`
}

// TableInfo describes a database table's schema (for the admin table browser).
type TableInfo struct {
	Name    string       `json:"name"`
	Columns []ColumnInfo `json:"columns"`
	RowCount int64       `json:"row_count"`
}

type ColumnInfo struct {
	Name           string      `json:"name"`
	Type           string      `json:"type"`
	Nullable       bool        `json:"nullable"`
	IsPrimaryKey   bool        `json:"is_primary_key"`
	DefaultValue   *string     `json:"default_value,omitempty"`
	IsForeignKey   bool        `json:"is_foreign_key"`
	FKRefTable     *string     `json:"fk_ref_table,omitempty"`
	FKRefColumn    *string     `json:"fk_ref_column,omitempty"`
}

// TableDataResponse wraps paginated table data for the admin browser.
type TableDataResponse struct {
	Columns  []ColumnInfo     `json:"columns"`
	Rows     []map[string]any `json:"rows"`
	Total    int64            `json:"total"`
	Page     int              `json:"page"`
	PageSize int              `json:"page_size"`
}

// ClientMigrationRecord is a client-side migration record for admin display.
type ClientMigrationRecord struct {
	ID           string     `json:"id"`
	UserID       string     `json:"user_id"`
	UserEmail    string     `json:"user_email"`
	MigrationKey string     `json:"migration_key"`
	Status       string     `json:"status"`
	ErrorMessage *string    `json:"error_message,omitempty"`
	CreatedAt    time.Time  `json:"created_at"`
	CompletedAt  *time.Time `json:"completed_at,omitempty"`
}

// AdminDispatchNotificationRequest is the payload for dispatching a notification/email.
type AdminDispatchNotificationRequest struct {
	Title        string   `json:"title"`
	Body         string   `json:"body"`
	Type         string   `json:"type"`
	TargetEmails []string `json:"target_emails"` // empty means all users
	SendEmail    bool     `json:"send_email"`
	EmailSubject string   `json:"email_subject,omitempty"`
	EmailBody    string   `json:"email_body,omitempty"`
}
