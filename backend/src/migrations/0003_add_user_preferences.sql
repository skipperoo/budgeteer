-- Add preferences JSONB column to users table for per-user settings
-- (accent color, UI preferences, etc.)
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{}'::jsonb;
