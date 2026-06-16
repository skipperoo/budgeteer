-- ============================================================
-- Migration 0008: Invitation system for rules and accounts
--
-- Adds:
--   1. status, target_email, target_account_encrypted to rules
--   2. status to account_users
--   3. notifications table (in-app notification panel)
--   4. invitations table (generic, for rules and accounts)
-- ============================================================

-- ============================================================
-- RULES: Add invitation fields
-- ============================================================
ALTER TABLE rules ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('pending_accepted', 'active'));

ALTER TABLE rules ADD COLUMN target_email VARCHAR(255);

-- Encrypted with server's public key; populated when receiver accepts
-- and chooses which of their accounts receives the money.
ALTER TABLE rules ADD COLUMN target_account_encrypted TEXT;

CREATE INDEX ON rules (target_email);
CREATE INDEX ON rules (status) WHERE status = 'pending_accepted';

-- ============================================================
-- ACCOUNT USERS: Add invitation status
-- ============================================================
ALTER TABLE account_users ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('pending_accepted', 'active'));

-- ============================================================
-- NOTIFICATIONS
-- In-app notification panel. Notifications are created for:
--   - Incoming invitations (rule, account)
--   - Invitation accepted by receiver
--   - Invitation expired
--   - etc.
-- ============================================================
CREATE TABLE notifications (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type       VARCHAR(50) NOT NULL,
    title      TEXT NOT NULL,
    body       TEXT NOT NULL,
    data       JSONB,         -- e.g. {"invitation_id": "...", "rule_id": "...", "account_id": "..."}
    is_read    BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON notifications (user_id, created_at DESC);
CREATE INDEX ON notifications (user_id, is_read) WHERE is_read = FALSE;

-- ============================================================
-- INVITATIONS
-- Generic polymorphic invitations table.
-- Supports both rule (user_transfer) and account invitations.
-- encrypted_data stores entity-specific encrypted payload:
--   - For accounts: the account key encrypted with server's public key
--   - For rules: (currently not used pre-acceptance; acceptance stores
--     receiver's chosen account_id on the rule itself)
-- ============================================================
CREATE TABLE invitations (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type     VARCHAR(20) NOT NULL CHECK (entity_type IN ('rule', 'account')),
    entity_id       UUID NOT NULL,
    invited_by      UUID NOT NULL REFERENCES users(id),
    invited_email   VARCHAR(255) NOT NULL,
    invited_user_id UUID REFERENCES users(id),     -- NULL if not registered yet
    encrypted_data  TEXT,                            -- optional: account key encrypted with server's public key
    status          VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    expires_at      TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 days'
);

CREATE INDEX ON invitations (invited_user_id, status) WHERE status = 'pending';
CREATE INDEX ON invitations (status, expires_at) WHERE status = 'pending';
CREATE INDEX ON invitations (entity_type, entity_id);
