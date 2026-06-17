-- ============================================================
-- Migration 0009: Rule notification alerts and income rule type
--
-- Adds:
--   1. alert_offset column to rules (INTERVAL, nullable)
--      Used by the rule notification worker to send reminders
--      before a rule fires. Stored as INTERVAL so the worker
--      can query it without decrypting the payload.
--      E.g. '1 hour', '2 days', '1 week'
--   2. last_alerted_at column to rules (TIMESTAMPTZ, nullable)
--      Set when a pre-firing notification is sent. The worker
--      uses this to avoid sending duplicate alerts.
--   3. No DB changes needed for commissions or income rule
--      type — both are handled inside the encrypted rule
--      payload (RulePayload.Commission, RulePayload.Type = "income").
-- ============================================================

-- ============================================================
-- RULES: Add alert offset for pre-firing notifications
-- ============================================================
ALTER TABLE rules ADD COLUMN alert_offset INTERVAL;
ALTER TABLE rules ADD COLUMN last_alerted_at TIMESTAMPTZ;

CREATE INDEX ON rules (alert_offset) WHERE alert_offset IS NOT NULL;
