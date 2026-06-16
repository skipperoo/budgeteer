package repository

import (
	"context"
	"time"

	"budgeteer-backend/internal/database"
	"budgeteer-backend/internal/model"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

type InvitationRepository struct{}

func (r *InvitationRepository) Create(ctx context.Context, inv *model.Invitation) error {
	q := database.GetQuerier(ctx)
	query := `INSERT INTO invitations (id, entity_type, entity_id, invited_by, invited_email, invited_user_id, encrypted_data, status, created_at, expires_at)
	          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`
	_, err := q.Exec(ctx, query,
		inv.ID, inv.EntityType, inv.EntityID, inv.InvitedBy, inv.InvitedEmail,
		inv.InvitedUserID, inv.EncryptedData, inv.Status, inv.CreatedAt, inv.ExpiresAt)
	return err
}

func (r *InvitationRepository) FindByID(ctx context.Context, id string) (*model.Invitation, error) {
	q := database.GetQuerier(ctx)
	query := `SELECT id, entity_type, entity_id, invited_by, invited_email, invited_user_id, encrypted_data, status, created_at, expires_at
	          FROM invitations WHERE id = $1`
	row := q.QueryRow(ctx, query, id)
	return scanInvitation(row)
}

func (r *InvitationRepository) FindPendingByUserID(ctx context.Context, userID string) ([]*model.Invitation, error) {
	q := database.GetQuerier(ctx)
	query := `SELECT id, entity_type, entity_id, invited_by, invited_email, invited_user_id, encrypted_data, status, created_at, expires_at
	          FROM invitations WHERE invited_user_id = $1 AND status = 'pending'
	          ORDER BY created_at DESC`
	rows, err := q.Query(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var invitations []*model.Invitation
	for rows.Next() {
		inv, err := scanInvitation(rows)
		if err != nil {
			return nil, err
		}
		invitations = append(invitations, inv)
	}
	return invitations, nil
}

func (r *InvitationRepository) FindPendingByEmail(ctx context.Context, email string) ([]*model.Invitation, error) {
	q := database.GetQuerier(ctx)
	query := `SELECT id, entity_type, entity_id, invited_by, invited_email, invited_user_id, encrypted_data, status, created_at, expires_at
	          FROM invitations WHERE invited_email = $1 AND status = 'pending'
	          ORDER BY created_at DESC`
	rows, err := q.Query(ctx, query, email)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var invitations []*model.Invitation
	for rows.Next() {
		inv, err := scanInvitation(rows)
		if err != nil {
			return nil, err
		}
		invitations = append(invitations, inv)
	}
	return invitations, nil
}

// FindExpired returns pending invitations where expires_at < now.
func (r *InvitationRepository) FindExpired(ctx context.Context, now time.Time) ([]*model.Invitation, error) {
	q := database.GetQuerier(ctx)
	query := `SELECT id, entity_type, entity_id, invited_by, invited_email, invited_user_id, encrypted_data, status, created_at, expires_at
	          FROM invitations WHERE status = 'pending' AND expires_at < $1
	          ORDER BY expires_at ASC`
	rows, err := q.Query(ctx, query, now)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var invitations []*model.Invitation
	for rows.Next() {
		inv, err := scanInvitation(rows)
		if err != nil {
			return nil, err
		}
		invitations = append(invitations, inv)
	}
	return invitations, nil
}

func (r *InvitationRepository) UpdateStatus(ctx context.Context, id, status string) error {
	q := database.GetQuerier(ctx)
	_, err := q.Exec(ctx,
		`UPDATE invitations SET status = $1 WHERE id = $2`, status, id)
	return err
}

func (r *InvitationRepository) UpdateInvitedUserID(ctx context.Context, id, userID string) error {
	q := database.GetQuerier(ctx)
	_, err := q.Exec(ctx,
		`UPDATE invitations SET invited_user_id = $1 WHERE id = $2`, userID, id)
	return err
}

func (r *InvitationRepository) FindByEntity(ctx context.Context, entityType, entityID string) (*model.Invitation, error) {
	q := database.GetQuerier(ctx)
	query := `SELECT id, entity_type, entity_id, invited_by, invited_email, invited_user_id, encrypted_data, status, created_at, expires_at
	          FROM invitations WHERE entity_type = $1 AND entity_id = $2
	          ORDER BY created_at DESC LIMIT 1`
	return scanInvitation(q.QueryRow(ctx, query, entityType, entityID))
}

func scanInvitation(row pgx.Row) (*model.Invitation, error) {
	inv := &model.Invitation{}
	var invitedUserID, encryptedData pgtype.Text
	err := row.Scan(&inv.ID, &inv.EntityType, &inv.EntityID, &inv.InvitedBy,
		&inv.InvitedEmail, &invitedUserID, &encryptedData, &inv.Status,
		&inv.CreatedAt, &inv.ExpiresAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	if invitedUserID.Valid {
		s := invitedUserID.String
		inv.InvitedUserID = &s
	}
	if encryptedData.Valid {
		s := encryptedData.String
		inv.EncryptedData = &s
	}
	return inv, nil
}
