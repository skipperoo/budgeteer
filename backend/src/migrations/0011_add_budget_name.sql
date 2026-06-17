-- Add plaintext display name column to budgets table.
-- Like rules.name, this is a display label and does not need encryption.
ALTER TABLE budgets ADD COLUMN IF NOT EXISTS name VARCHAR(255) NOT NULL DEFAULT '';
