-- ============================================================
-- Migration 0007: Rules engine for automated payments/transfers
-- ============================================================

-- Add plaintext balance column to accounts (in currency-minor units, e.g. cents).
-- This is server-maintained for rule precondition checks only.
-- The user's true balance is always computed client-side from decrypted transactions.
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS balance BIGINT NOT NULL DEFAULT 0;

-- ============================================================
-- RULES TABLE
-- Stores automated payment and transfer rules.
-- Scheduling fields are plaintext for efficient DB queries.
-- Encrypted payload (server-key only) contains type, amounts, account IDs, etc.
-- ============================================================
CREATE TABLE IF NOT EXISTS rules (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_by           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name                 VARCHAR(255) NOT NULL,                -- plaintext display label
    encrypted_payload    TEXT NOT NULL,                         -- ECIES with server's public key
    frequency            VARCHAR(20) NOT NULL CHECK (frequency IN ('once', 'daily', 'weekly', 'monthly', 'yearly')),
    next_occurrence      TIMESTAMPTZ NOT NULL,
    end_date             TIMESTAMPTZ,                           -- optional end date
    max_occurrences      INT,                                   -- optional max executions
    occurrences_so_far   INT NOT NULL DEFAULT 0,
    last_triggered_at    TIMESTAMPTZ,                           -- when it last fired
    is_active            BOOLEAN NOT NULL DEFAULT TRUE,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_rules_owner   ON rules (created_by);
CREATE INDEX IF NOT EXISTS idx_rules_due     ON rules (next_occurrence) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_accounts_balance ON accounts (id) WHERE deleted_at IS NULL;
