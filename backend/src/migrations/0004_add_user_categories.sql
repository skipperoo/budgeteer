-- Add user_categories table for per-user category storage
-- Each user can define their own set of income and expense categories.
-- The UNIQUE constraint prevents duplicate names within the same type for a user.
CREATE TABLE IF NOT EXISTS user_categories (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       VARCHAR(100) NOT NULL,
    type       VARCHAR(10) NOT NULL CHECK (type IN ('income', 'expense')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, name, type)
);

CREATE INDEX IF NOT EXISTS idx_user_categories_user_id ON user_categories (user_id);
