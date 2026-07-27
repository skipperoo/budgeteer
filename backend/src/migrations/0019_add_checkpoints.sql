-- ============================================================
-- Migration 0019: Monthly balance checkpoints + opening-balance
-- account metadata.
--
-- See /spec.md (perf/checkpointing). Summary:
--   * encrypted_metadata on accounts (E2E-encrypted JSON holding the
--     opening balance in cents; written by the frontend with the account key).
--   * transactions_checkpoints: one row per account per calendar month,
--     holding an ECIES(AES-GCM, account-key)-encrypted {balance, tx_count}.
--     Metadata (account_id, checkpoint_month) is plaintext for indexing.
--   * Seed a pending client-side migration that moves the legacy
--     "Opening Balance" transaction into account metadata and builds all
--     monthly checkpoints.
--
-- Note: the plaintext accounts.balance BIGINT column added by 0007 is used
-- ONLY by the rule scheduler for precondition checks; it is NOT modified
-- or removed here.
-- ============================================================

-- Encrypted account-level metadata (opening balance, future fields).
-- Encrypted with the account key (AES-256-GCM, same format used for
-- account-key-encrypted transactions). Decryptable by every joint member.
-- NULL until the frontend migration writes it.
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS encrypted_metadata TEXT;

-- Monthly balance checkpoints (one row per account per month).
-- checkpoint_month = the LAST UTC day of the month (DATE, e.g. 2025-07-31),
-- representing the balance *through the end of* that month.
CREATE TABLE IF NOT EXISTS transactions_checkpoints (
    account_id        UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    checkpoint_month  DATE NOT NULL,
    encrypted_balance TEXT NOT NULL,   -- AES-GCM(account-key) JSON {balance, tx_count}
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (account_id, checkpoint_month)
);

CREATE INDEX IF NOT EXISTS idx_checkpoints_account_month
    ON transactions_checkpoints (account_id, checkpoint_month DESC);

-- ----------------------------------------------------------
-- sync_queue: support propagation of checkpoint and account_metadata
-- updates to joint-account members.
--   * checkpoint_month: the affected month (for entity_type 'checkpoint').
--   * source_updated_at: the originating row's updated_at, used as the LWW
--     tiebreaker when a joint member applies a received checkpoint/
--     account_metadata update.
-- ----------------------------------------------------------
ALTER TABLE sync_queue ADD COLUMN IF NOT EXISTS checkpoint_month DATE;
ALTER TABLE sync_queue ADD COLUMN IF NOT EXISTS source_updated_at TIMESTAMPTZ;

-- ============================================================
-- Seed pending client-side migration for all existing users.
-- The frontend runner (migration-store.ts) builds the checkpoints and
-- moves the opening balance out of the transactions table into
-- accounts.encrypted_metadata.
-- ============================================================
INSERT INTO pending_migrations (user_id, migration_key, status)
SELECT id, 'build_checkpoints_and_move_opening_balance', 'pending'
FROM users
ON CONFLICT (user_id, migration_key) DO NOTHING;