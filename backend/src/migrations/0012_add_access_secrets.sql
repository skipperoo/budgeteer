-- ============================================================
-- ACCESS SECRETS (Remember Device)
-- Stores device-specific encrypted tokens so that trusted
-- devices can skip OTP verification during login.
--
-- fingerprint_hash: SHA-256 hex digest of the device fingerprint
-- secret_hash: bcrypt hash of (device_token + fingerprint + password)
--   This binds the secret to both the device and the user's password,
--   so that changing the password invalidates all device secrets.
--   The server stores only bcrypt hashes, never raw tokens.
-- ============================================================
CREATE TABLE access_secrets (
    id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    fingerprint_hash   VARCHAR(64) NOT NULL,
    secret_hash        TEXT NOT NULL,
    device_name        VARCHAR(255),
    last_used_at       TIMESTAMPTZ,
    created_at         TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, fingerprint_hash)
);

CREATE INDEX ON access_secrets (user_id);
