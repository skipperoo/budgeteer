-- ============================================================
-- Drop FK constraint on transaction_documents.transaction_id
-- if it exists. The transactions table uses a composite PK
-- (id, time) as a TimescaleDB hypertable, so we cannot FK
-- reference id alone. The app handles integrity.
-- ============================================================
ALTER TABLE transaction_documents
  DROP CONSTRAINT IF EXISTS transaction_documents_transaction_id_fkey;
