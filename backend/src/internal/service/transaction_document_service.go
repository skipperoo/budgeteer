package service

import (
	"context"
	"encoding/base64"
	"fmt"
	"time"

	"budgeteer-backend/internal/model"
	"budgeteer-backend/internal/repository"

	"github.com/google/uuid"
)

type TransactionDocumentService struct {
	DocRepo      *repository.TransactionDocumentRepository
	TxRepo       *repository.TransactionRepository
	AccountUserRepo *repository.AccountUserRepository
}

var TransactionDocuments *TransactionDocumentService

func InitTransactionDocumentService() {
	TransactionDocuments = &TransactionDocumentService{
		DocRepo:         &repository.TransactionDocumentRepository{},
		TxRepo:          &repository.TransactionRepository{},
		AccountUserRepo: &repository.AccountUserRepository{},
	}
}

// verifyTransactionAccess checks that the user has access to the account
// that the transaction belongs to. Returns the transaction or an error.
func (s *TransactionDocumentService) verifyTransactionAccess(ctx context.Context, transactionID, userID string) (*model.Transaction, error) {
	t, err := s.TxRepo.FindByID(ctx, transactionID)
	if err != nil {
		return nil, fmt.Errorf("database error: %w", err)
	}
	if t == nil {
		return nil, fmt.Errorf("transaction not found")
	}

	au, err := s.AccountUserRepo.FindByAccountAndUser(ctx, t.AccountID, userID)
	if err != nil {
		return nil, fmt.Errorf("database error: %w", err)
	}
	if au == nil {
		return nil, fmt.Errorf("access denied")
	}
	return t, nil
}

// Upload stores a new encrypted document for a transaction.
func (s *TransactionDocumentService) Upload(ctx context.Context, transactionID, userID string, req *model.UploadDocumentRequest) (*model.DocumentMetadata, error) {
	if _, err := s.verifyTransactionAccess(ctx, transactionID, userID); err != nil {
		return nil, err
	}

	// Decode the base64 encrypted data
	encryptedData, err := base64.StdEncoding.DecodeString(req.EncryptedData)
	if err != nil {
		return nil, fmt.Errorf("invalid encrypted_data encoding: %w", err)
	}

	now := time.Now()
	doc := &model.TransactionDocument{
		ID:            uuid.New().String(),
		TransactionID: transactionID,
		EncryptedData: encryptedData,
		MimeType:      req.MimeType,
		FileName:      req.FileName,
		FileSize:      req.FileSize,
		CreatedAt:     now,
	}

	if err := s.DocRepo.Create(ctx, doc); err != nil {
		return nil, fmt.Errorf("failed to store document: %w", err)
	}

	return &model.DocumentMetadata{
		ID:            doc.ID,
		TransactionID: doc.TransactionID,
		MimeType:      doc.MimeType,
		FileName:      doc.FileName,
		FileSize:      doc.FileSize,
		CreatedAt:     doc.CreatedAt,
	}, nil
}

// List returns document metadata for a transaction (no encrypted data).
func (s *TransactionDocumentService) List(ctx context.Context, transactionID, userID string) ([]*model.DocumentMetadata, error) {
	if _, err := s.verifyTransactionAccess(ctx, transactionID, userID); err != nil {
		return nil, err
	}

	docs, err := s.DocRepo.FindByTransactionID(ctx, transactionID)
	if err != nil {
		return nil, fmt.Errorf("database error: %w", err)
	}
	if docs == nil {
		docs = []*model.DocumentMetadata{}
	}
	return docs, nil
}

// GetData returns the full document including encrypted data.
func (s *TransactionDocumentService) GetData(ctx context.Context, documentID, transactionID, userID string) (*model.DocumentDataResponse, error) {
	if _, err := s.verifyTransactionAccess(ctx, transactionID, userID); err != nil {
		return nil, err
	}

	doc, err := s.DocRepo.FindByID(ctx, documentID)
	if err != nil {
		return nil, fmt.Errorf("database error: %w", err)
	}
	if doc == nil {
		return nil, fmt.Errorf("document not found")
	}
	if doc.TransactionID != transactionID {
		return nil, fmt.Errorf("document does not belong to this transaction")
	}

	return &model.DocumentDataResponse{
		ID:            doc.ID,
		EncryptedData: base64.StdEncoding.EncodeToString(doc.EncryptedData),
		MimeType:      doc.MimeType,
		FileName:      doc.FileName,
	}, nil
}

// Delete removes a document.
func (s *TransactionDocumentService) Delete(ctx context.Context, documentID, transactionID, userID string) error {
	if _, err := s.verifyTransactionAccess(ctx, transactionID, userID); err != nil {
		return err
	}

	doc, err := s.DocRepo.FindByID(ctx, documentID)
	if err != nil {
		return fmt.Errorf("database error: %w", err)
	}
	if doc == nil {
		return fmt.Errorf("document not found")
	}
	if doc.TransactionID != transactionID {
		return fmt.Errorf("document does not belong to this transaction")
	}

	return s.DocRepo.Delete(ctx, documentID)
}
