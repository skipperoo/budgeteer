-- ============================================================
-- Migration 0018: Add admin_users table
--
-- Stores admin panel credentials separately from regular users.
-- Passwords are bcrypt hashes. must_change_password forces a
-- password change on first login (including for the seeded admin).
-- The first admin user is seeded by the application at startup
-- if the table is empty.
-- ============================================================

CREATE TABLE IF NOT EXISTS admin_users (
    id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email                 VARCHAR(255) UNIQUE NOT NULL,
    password_hash         VARCHAR(255) NOT NULL,
    display_name          VARCHAR(100) NOT NULL DEFAULT '',
    is_active             BOOLEAN NOT NULL DEFAULT TRUE,
    must_change_password  BOOLEAN NOT NULL DEFAULT TRUE,
    created_by            UUID REFERENCES admin_users(id),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
