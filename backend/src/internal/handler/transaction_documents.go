package handler

import (
	"encoding/json"
	"net/http"

	"budgeteer-backend/internal/middleware"
	"budgeteer-backend/internal/model"
	"budgeteer-backend/internal/service"
)

const maxDocumentSize = 20 * 1024 * 1024 // 20 MB

// UploadDocument handles POST /v1/transactions/{id}/documents
func UploadDocument(w http.ResponseWriter, r *http.Request) {
	claims, ok := r.Context().Value(middleware.ClaimsKey).(*model.UserClaims)
	if !ok || claims == nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(model.Error{Error: "unauthorized"})
		return
	}

	transactionID := r.PathValue("id")

	var req model.UploadDocumentRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxDocumentSize)).Decode(&req); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(model.Error{Error: "invalid request body or file too large (max 20MB)"})
		return
	}
	defer r.Body.Close()

	if req.EncryptedData == "" || req.MimeType == "" || req.FileName == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(model.Error{Error: "encrypted_data, mime_type, and file_name are required"})
		return
	}

	doc, err := service.TransactionDocuments.Upload(r.Context(), transactionID, claims.UserID, &req)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		code := http.StatusForbidden
		if err.Error() == "transaction not found" {
			code = http.StatusNotFound
		}
		w.WriteHeader(code)
		json.NewEncoder(w).Encode(model.Error{Error: err.Error()})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(doc)
}

// ListDocuments handles GET /v1/transactions/{id}/documents
func ListDocuments(w http.ResponseWriter, r *http.Request) {
	claims, ok := r.Context().Value(middleware.ClaimsKey).(*model.UserClaims)
	if !ok || claims == nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(model.Error{Error: "unauthorized"})
		return
	}

	transactionID := r.PathValue("id")

	docs, err := service.TransactionDocuments.List(r.Context(), transactionID, claims.UserID)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		code := http.StatusForbidden
		if err.Error() == "transaction not found" {
			code = http.StatusNotFound
		}
		w.WriteHeader(code)
		json.NewEncoder(w).Encode(model.Error{Error: err.Error()})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(docs)
}

// GetDocumentData handles GET /v1/transactions/{id}/documents/{docId}/data
func GetDocumentData(w http.ResponseWriter, r *http.Request) {
	claims, ok := r.Context().Value(middleware.ClaimsKey).(*model.UserClaims)
	if !ok || claims == nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(model.Error{Error: "unauthorized"})
		return
	}

	transactionID := r.PathValue("id")
	documentID := r.PathValue("docId")

	data, err := service.TransactionDocuments.GetData(r.Context(), documentID, transactionID, claims.UserID)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		code := http.StatusForbidden
		if err.Error() == "transaction not found" || err.Error() == "document not found" {
			code = http.StatusNotFound
		}
		w.WriteHeader(code)
		json.NewEncoder(w).Encode(model.Error{Error: err.Error()})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(data)
}

// DeleteDocument handles DELETE /v1/transactions/{id}/documents/{docId}
func DeleteDocument(w http.ResponseWriter, r *http.Request) {
	claims, ok := r.Context().Value(middleware.ClaimsKey).(*model.UserClaims)
	if !ok || claims == nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(model.Error{Error: "unauthorized"})
		return
	}

	transactionID := r.PathValue("id")
	documentID := r.PathValue("docId")

	if err := service.TransactionDocuments.Delete(r.Context(), documentID, transactionID, claims.UserID); err != nil {
		w.Header().Set("Content-Type", "application/json")
		code := http.StatusForbidden
		if err.Error() == "transaction not found" || err.Error() == "document not found" {
			code = http.StatusNotFound
		}
		w.WriteHeader(code)
		json.NewEncoder(w).Encode(model.Error{Error: err.Error()})
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
