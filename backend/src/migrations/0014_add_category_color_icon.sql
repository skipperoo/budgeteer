-- Add color, icon, and is_disabled columns to user_categories
-- color: user-defined color for the category (hex, e.g. "#3B82F6")
-- icon: lucide-react icon name (e.g. "shopping-cart", "utensils")
-- is_disabled: if true, the category is hidden from dropdowns and pie charts

ALTER TABLE user_categories
  ADD COLUMN IF NOT EXISTS color      VARCHAR(7),
  ADD COLUMN IF NOT EXISTS icon       VARCHAR(100),
  ADD COLUMN IF NOT EXISTS is_disabled BOOLEAN NOT NULL DEFAULT FALSE;
