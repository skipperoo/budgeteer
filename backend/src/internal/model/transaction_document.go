package model

import "time"

type TransactionDocument struct {
	ID              string    `json:"id"`
	TransactionID   string    `json:"transaction_id"`
	EncryptedData   []byte    `json:"-"` // never serialized in JSON responses (binary)
	MimeType        string    `json:"mime_type"`
	FileName        string    `json:"file_name"`
	FileSize        int64     `json:"file_size"`
	CreatedAt       time.Time `json:"created_at"`
}

// UploadDocumentRequest is the JSON body for POST /transactions/{id}/documents.
// EncryptedData is the base64-encoded AES-256-GCM output (iv + ciphertext).
type UploadDocumentRequest struct {
	EncryptedData string `json:"encrypted_data"` // base64 of iv(12) || ciphertext
	MimeType      string `json:"mime_type"`
	FileName      string `json:"file_name"`
	FileSize      int64  `json:"file_size"`
}

// DocumentMetadata is a lightweight response (no encrypted data)
type DocumentMetadata struct {
	ID            string    `json:"id"`
	TransactionID string    `json:"transaction_id"`
	MimeType      string    `json:"mime_type"`
	FileName      string    `json:"file_name"`
	FileSize      int64     `json:"file_size"`
	CreatedAt     time.Time `json:"created_at"`
}

// DocumentDataResponse is the response for GET /transactions/{id}/documents/{docId}/data
type DocumentDataResponse struct {
	ID            string `json:"id"`
	EncryptedData string `json:"encrypted_data"` // base64 of iv(12) || ciphertext
	MimeType      string `json:"mime_type"`
	FileName      string `json:"file_name"`
}
