-- Add name column to accounts table
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS name VARCHAR(255) NOT NULL DEFAULT '';
