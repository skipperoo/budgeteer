-- ============================================================
-- TRANSACTION DOCUMENTS
-- Stores encrypted document files (receipts, invoices, etc.)
-- linked to a transaction. The file data is encrypted with the
-- same AES-256 account key used for transaction payloads.
-- Metadata (mime_type, file_name, file_size) is plaintext so
-- the frontend can render the correct UI without decryption.
-- ============================================================
CREATE TABLE transaction_documents (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id  UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    encrypted_data  BYTEA NOT NULL,
    mime_type       VARCHAR(255) NOT NULL,
    file_name       VARCHAR(255) NOT NULL,
    file_size       BIGINT NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX ON transaction_documents (transaction_id);
