-- ============================================================
-- BUDGETS
-- User-defined monthly/yearly spending limits. Sensitive fields
-- (amount, category) are ECIES-encrypted with the user's X25519
-- public key, matching the pattern used by rules.
-- Metadata (account_id, period, dates) is plain text for querying.
-- Progress tracking is computed client-side using decrypted
-- transaction payloads.
-- ============================================================
CREATE TABLE budgets (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id          UUID REFERENCES accounts(id) ON DELETE CASCADE,
    encrypted_payload   TEXT NOT NULL,              -- ECIES with user's X25519 public key
    period              VARCHAR(10) NOT NULL CHECK (period IN ('monthly', 'yearly')),
    start_date          DATE NOT NULL,
    end_date            DATE,                       -- NULL = ongoing
    last_notified_50    BOOLEAN NOT NULL DEFAULT FALSE,
    last_notified_80    BOOLEAN NOT NULL DEFAULT FALSE,
    last_notified_100   BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON budgets (user_id);
CREATE INDEX ON budgets (account_id);
