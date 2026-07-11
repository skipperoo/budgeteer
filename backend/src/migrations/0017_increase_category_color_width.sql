-- ============================================================
-- Migration 0017: Increase user_categories.color column width
--
-- The original column was VARCHAR(7) — enough for hex colors
-- (#RRGGBB) but not for oklch values like "oklch(0.65 0.16 120)"
-- which the frontend uses as deterministic fallback colors.
-- ============================================================

ALTER TABLE user_categories
  ALTER COLUMN color TYPE VARCHAR(30);
