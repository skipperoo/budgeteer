package repository

import (
	"context"

	"budgeteer-backend/internal/database"
	"budgeteer-backend/internal/model"

	"github.com/jackc/pgx/v5"
)

type TransactionDocumentRepository struct{}

func (r *TransactionDocumentRepository) Create(ctx context.Context, doc *model.TransactionDocument) error {
	query := `INSERT INTO transaction_documents (id, transaction_id, encrypted_data, mime_type, file_name, file_size, created_at)
	          VALUES ($1, $2, $3, $4, $5, $6, $7)`
	_, err := database.Pool.Exec(ctx, query,
		doc.ID, doc.TransactionID, doc.EncryptedData, doc.MimeType,
		doc.FileName, doc.FileSize, doc.CreatedAt)
	return err
}

// FindByTransactionID returns document metadata (no encrypted_data) for a transaction.
func (r *TransactionDocumentRepository) FindByTransactionID(ctx context.Context, transactionID string) ([]*model.DocumentMetadata, error) {
	query := `SELECT id, transaction_id, mime_type, file_name, file_size, created_at
	          FROM transaction_documents WHERE transaction_id = $1 ORDER BY created_at ASC`
	rows, err := database.Pool.Query(ctx, query, transactionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var docs []*model.DocumentMetadata
	for rows.Next() {
		d := &model.DocumentMetadata{}
		if err := rows.Scan(&d.ID, &d.TransactionID, &d.MimeType, &d.FileName, &d.FileSize, &d.CreatedAt); err != nil {
			return nil, err
		}
		docs = append(docs, d)
	}
	return docs, nil
}

// FindByID returns a full document including encrypted_data.
func (r *TransactionDocumentRepository) FindByID(ctx context.Context, id string) (*model.TransactionDocument, error) {
	query := `SELECT id, transaction_id, encrypted_data, mime_type, file_name, file_size, created_at
	          FROM transaction_documents WHERE id = $1`
	row := database.Pool.QueryRow(ctx, query, id)
	doc := &model.TransactionDocument{}
	err := row.Scan(&doc.ID, &doc.TransactionID, &doc.EncryptedData, &doc.MimeType,
		&doc.FileName, &doc.FileSize, &doc.CreatedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return doc, nil
}

func (r *TransactionDocumentRepository) Delete(ctx context.Context, id string) error {
	query := `DELETE FROM transaction_documents WHERE id = $1`
	_, err := database.Pool.Exec(ctx, query, id)
	return err
}
