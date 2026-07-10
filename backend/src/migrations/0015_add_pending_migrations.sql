-- ============================================================
-- Migration 0015: Add pending_migrations table
--
-- Tracks client-side migrations that need to be run per user.
-- When a migration is pending, the frontend queries this table
-- upon login, runs the migration logic, and marks it complete.
--
-- Seed: all existing users get the 'add_category_id' migration
-- so they can upgrade their transaction payloads.
-- ============================================================

CREATE TABLE IF NOT EXISTS pending_migrations (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    migration_key   VARCHAR(100) NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'completed', 'failed')),
    error_message   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMPTZ,
    UNIQUE(user_id, migration_key)
);

CREATE INDEX ON pending_migrations (user_id, status);

-- Seed: mark 'add_category_id' as pending for ALL existing users
INSERT INTO pending_migrations (user_id, migration_key, status)
SELECT id, 'add_category_id', 'pending'
FROM users
ON CONFLICT (user_id, migration_key) DO NOTHING;
