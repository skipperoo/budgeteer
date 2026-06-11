-- ============================================================
-- Extensions
-- ============================================================
CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE users (
    id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email                 VARCHAR(255) UNIQUE NOT NULL,
    password_hash         VARCHAR(255) NOT NULL,
    public_key            TEXT NOT NULL,
    encrypted_private_key TEXT NOT NULL,
    is_verified           BOOLEAN DEFAULT FALSE,
    created_at            TIMESTAMPTZ DEFAULT NOW(),
    updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- OTPs
-- Stores hashed one-time passwords for email verification.
-- Never store OTPs in plain text.
-- ============================================================
CREATE TABLE otps (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
    code_hash  VARCHAR(255) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed   BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ACCOUNTS
-- ============================================================
CREATE TABLE accounts (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name       VARCHAR(255) NOT NULL DEFAULT '',
    currency   VARCHAR(3) NOT NULL,
    type       VARCHAR(50) CHECK (type IN ('personal', 'joint', 'savings')) NOT NULL,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ  -- soft delete; NULL = active
);

-- ============================================================
-- ACCOUNT USERS (Key Distribution)
-- ============================================================
CREATE TABLE account_users (
    account_id            UUID REFERENCES accounts(id) ON DELETE CASCADE,
    user_id               UUID REFERENCES users(id) ON DELETE CASCADE,
    encrypted_account_key TEXT NOT NULL,
    role                  VARCHAR(50) DEFAULT 'member',
    joined_at             TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (account_id, user_id)
);

-- ============================================================
-- MASTER CATEGORIES (system-defined, seeded at startup)
-- ============================================================
CREATE TABLE master_categories (
    id   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    type VARCHAR(10) CHECK (type IN ('income', 'expense')) NOT NULL
);

-- ============================================================
-- SUBCATEGORIES (user-defined, scoped per user)
-- ============================================================
CREATE TABLE subcategories (
    id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    master_category_id UUID REFERENCES master_categories(id) ON DELETE CASCADE,
    created_by         UUID REFERENCES users(id) ON DELETE CASCADE,
    name               VARCHAR(100) NOT NULL,
    created_at         TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TRANSACTIONS (TimescaleDB Hypertable)
-- Encrypted payload contains: amount, category, notes, counterparty.
-- Routing metadata (account_id, time) is intentionally plain text.
-- ============================================================
CREATE TABLE transactions (
    id                UUID NOT NULL,
    time              TIMESTAMPTZ NOT NULL,
    account_id        UUID REFERENCES accounts(id) ON DELETE CASCADE,
    created_by        UUID REFERENCES users(id),
    encrypted_payload TEXT NOT NULL, -- LZ4 -> AES-256-GCM -> Base64
    version           INT DEFAULT 1,
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW(),
    deleted_at        TIMESTAMPTZ,   -- soft delete; NULL = active
    PRIMARY KEY (id, time)
);

SELECT create_hypertable('transactions', 'time');

-- ============================================================
-- RECURRING TRANSACTIONS
-- Defines a template and schedule for auto-generated transactions.
-- ============================================================
CREATE TABLE recurring_transactions (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id        UUID REFERENCES accounts(id) ON DELETE CASCADE,
    created_by        UUID REFERENCES users(id),
    frequency         VARCHAR(20) CHECK (frequency IN ('daily', 'weekly', 'monthly', 'yearly')) NOT NULL,
    next_occurrence   TIMESTAMPTZ NOT NULL,
    end_date          TIMESTAMPTZ,
    encrypted_payload TEXT NOT NULL, -- same structure as transactions.encrypted_payload
    is_active         BOOLEAN DEFAULT TRUE,
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SAVINGS PLANS
-- Tracks a savings goal deducting from a source account.
-- Sensitive fields (target amount, label) are encrypted.
-- last_logged_at is plain text for cron job inspection.
-- ============================================================
CREATE TABLE savings_plans (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id        UUID REFERENCES accounts(id) ON DELETE CASCADE,
    source_account_id UUID REFERENCES accounts(id),
    created_by        UUID REFERENCES users(id),
    currency          VARCHAR(3) NOT NULL,
    tracking_start    TIMESTAMPTZ NOT NULL,
    tracking_end      TIMESTAMPTZ NOT NULL,
    last_logged_at    TIMESTAMPTZ,        -- plaintext; inspected by cron
    encrypted_payload TEXT NOT NULL,     -- target amount, plan name, notes
    is_active         BOOLEAN DEFAULT TRUE,
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SYNC QUEUE
-- Delivers operations to joint account members who were offline.
-- consumed_at is set by the pull endpoint; cleaned up after 30 days.
-- encrypted_payload is nullable: DELETE actions carry no payload.
-- ============================================================
CREATE TABLE sync_queue (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    target_user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
    account_id        UUID REFERENCES accounts(id),
    action            VARCHAR(50) NOT NULL, -- 'INSERT', 'UPDATE', 'DELETE'
    entity_type       VARCHAR(50) NOT NULL,
    encrypted_payload TEXT,                -- NULL for DELETE actions
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    consumed_at       TIMESTAMPTZ          -- NULL = pending; set on pull
);

-- ============================================================
-- EMAIL OUTBOX
-- Polled by the Email Dispatcher worker.
-- scheduled_for supports delayed sending (e.g. OTP expiry window).
-- retry_count prevents infinite retry loops on persistent failures.
-- ============================================================
CREATE TABLE email_outbox (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    to_address   VARCHAR(255) NOT NULL,
    subject      VARCHAR(255) NOT NULL,
    body         TEXT NOT NULL,
    status       VARCHAR(50) DEFAULT 'pending', -- 'pending', 'sent', 'failed'
    retry_count  INT DEFAULT 0,
    scheduled_for TIMESTAMPTZ DEFAULT NOW(),
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================

-- Auth / user lookups
CREATE INDEX ON users (email);
CREATE INDEX ON otps (user_id, expires_at) WHERE consumed = FALSE;

-- Account access
CREATE INDEX ON account_users (user_id);
CREATE INDEX ON accounts (created_by) WHERE deleted_at IS NULL;

-- Transaction queries (most frequent read path)
CREATE INDEX ON transactions (account_id, time DESC) WHERE deleted_at IS NULL;

-- Recurring transaction scheduling
CREATE INDEX ON recurring_transactions (next_occurrence) WHERE is_active = TRUE;

-- Savings plan cron
CREATE INDEX ON savings_plans (tracking_end, last_logged_at) WHERE is_active = TRUE;

-- Sync queue polling (hot path for pull endpoint)
CREATE INDEX ON sync_queue (target_user_id, created_at) WHERE consumed_at IS NULL;

-- Email dispatcher polling
CREATE INDEX ON email_outbox (status, scheduled_for) WHERE status = 'pending';
