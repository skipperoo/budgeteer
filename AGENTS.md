# Budgeteer - Technical Specifications

> **Revision 2** — Reviewed and extended. Key changes: added missing OTP/categories/recurring/savings-plan tables, added database indexes, added soft-deletes, expanded API surface (logout, key retrieval, user lookup, password change), fixed sync_queue and email_outbox schema, strengthened crypto recommendations, added conflict resolution strategy, added routy router example, added development workflow & testing requirements, updated Docker Compose (frontend service, Redis, healthchecks).

---

## 1. System Overview

Budgeteer is a collaborative, offline-first personal finance tracker. It provides users with a comprehensive overview of their financial situation across multiple accounts. The application emphasizes extreme privacy through End-to-End (E2E) encryption, ensuring that sensitive financial data is never accessible to the server in plain text.

**Target Platforms:** Web (primary), with a responsive layout suitable for mobile browsers. Native mobile apps are out of scope for v1.

---

## 2. Architecture & Security Model

### Offline-First & Sync

The frontend acts as the primary source of truth during active usage. Operations are performed locally and queued. The app synchronizes with the backend via a push/pull mechanism at regular intervals or upon network restoration.

**Conflict Resolution Strategy:** Last-Write-Wins (LWW) using the record's `updated_at` timestamp as the tiebreaker. Financial transactions are treated as **immutable** — a correction to a transaction results in a soft-delete of the original and the insertion of a new corrected record. This eliminates most edit conflicts by design. The only genuine conflict surface is metadata (e.g., account name changes), where LWW is acceptable.

### E2E Encryption Model

To balance E2E encryption with the requirements of TimescaleDB and joint account sharing, the following cryptographic model is enforced:

- **Data Splitting:** Metadata required for database routing and time-series indexing (`transaction_id`, `account_id`, `timestamp`) remains in plain text. Sensitive payload data (`amount`, `category`, `notes`, `counterparty`) is encrypted. This means all financial aggregations (balances, charts) are computed client-side after decryption.
- **Encryption Pipeline:** `JSON Payload` → `Compress (LZ4)` → `Encrypt (AES-256-GCM)` → `Base64 Encode` (for JSON transport).
- **Key Management:** Users generate an **X25519** keypair upon registration (preferred over RSA for smaller key size, faster operations, and better modern security posture). Ed25519 is used for any signatures required in future.
  - The **Private Key** is symmetrically encrypted using the user's password via `Argon2id` (recommended parameters: `m=65536`, `t=3`, `p=4`) + `AES-256-GCM`, and stored server-side. It is only decrypted client-side during active sessions and **held in memory only** — never written to IndexedDB, localStorage, or any persistent client storage.
  - The **Public Key** is stored in plain text to facilitate secure account sharing.
- **Trust Boundary Note:** Because the encrypted private key is stored on the server, a compromised server can attempt an offline dictionary attack against weak user passwords. Argon2id parameters above are chosen to make this computationally expensive. Users should be encouraged to use strong passwords.
- **Joint Accounts:** An AES-256 "Account Key" is generated for each account. To invite a user, the inviter fetches the invitee's Public Key, encrypts the Account Key with it via ECIES (X25519 + AES-GCM), and stores the result in the `account_users` table.
- **Known Limitation — Member Removal:** When a user is removed from a joint account, they retain their copy of the Account Key. Full forward secrecy would require re-keying the account (generating a new Account Key and re-encrypting all future transactions). This is deferred to a post-v1 milestone; removal should be documented as revoking write access only.

---

## 3. Frontend Specifications

- **Tech Stack:** Vite, React, TypeScript, Tailwind CSS, Shadcn UI.
- **State Management:** Zustand (lightweight, integrates cleanly with Shadcn/Vite).
- **Charting:** Recharts or Tremor (both composable and Tailwind-compatible).
- **Crypto Libraries:** Native WebCrypto API for AES-GCM; `@noble/ciphers` and `@noble/curves` for X25519/Ed25519 (audited, zero-dependency).
- **Core Responsibilities:** Key management (decryption/encryption), local state management (IndexedDB/SQLite WASM for offline storage), and synchronization conflict resolution per the LWW strategy defined in Section 2.

### Session Model

Upon login, the user's `encrypted_private_key` is fetched from the server and decrypted client-side using the password-derived Argon2id key. The resulting plaintext private key is held **in a Zustand store in memory only** for the duration of the session. It is cleared on logout or tab close. It is never serialized to any persistent storage.

### Views & Pages

- **Overview Dashboard:**
  - Recent movements list.
  - Financial plots and charts (balance over time, spending by category).
  - Interactive time-range selector.
- **Bank Account Management:**
  - Create/delete accounts (set default currency).
  - Manage income/expense subcategories (under fixed Master categories).
  - Setup recurring transactions.
  - **Savings Accounts:** Define savings plans that deduct from a selected account and track counter-value monthly.
  - **Joint Accounts:** Invite users via email/ID to share accounts seamlessly.
- **Settings:**
  - Account management (password changes trigger re-encryption of the private key with the new password-derived key; see Section 4 API).
  - Key rotation (generates a new keypair and re-encrypts all Account Keys for the user's accounts).
  - UI customization and Locale settings.
  - Default currency settings.

### Category Model

Categories are stored on the **backend** under the user's profile (the `user_categories` table):

- **Storage:** Categories are persisted in the `user_categories` database table, scoped per user. The frontend fetches them via `GET /api/v1/categories` on first access and keeps an in-memory cache (Zustand store) with optimistic updates.
- **Per-user:** Each user maintains their own category list, split by transaction type (`income` / `expense`). When a user creates a transaction with a new category, a `POST /api/v1/categories` call persists it server-side.
- **Joint accounts:** Categories are per-user, not per-account. Each member sees only their own categories. The category string is part of the encrypted transaction payload, so decrypted transactions from joint accounts contain the category as typed by the creator.
- **UI:** A dropdown/combobox in the transaction creation form shows existing categories for the selected type plus an "Add new category..." option. Selecting this shows a text input to type and save a new category.
- **Endpoints:**
  - `GET    /api/v1/categories` — List all categories for the authenticated user.
  - `POST   /api/v1/categories` — Create a new category (body: `{ name, type }`).
  - `DELETE /api/v1/categories/{id}` — Delete a category by its ID.

---

## 4. Backend Specifications

- **Tech Stack:** Golang (1.26+), `skipperoo/routy` router, PostgreSQL, TimescaleDB, Redis.
- **Background Workers:**
  - **Email Dispatcher:** Polls the `email_outbox` table (status = `pending`, respecting `scheduled_for`) to send OTPs, registration validations, and notification emails via SMTP. Increments `retry_count` on failure; stops retrying after 5 attempts (`status = 'failed'`).
  - **Savings Plan Cron:** Daily job checking for savings plans where `tracking_end` has passed or where `last_logged_at` is older than 30 days. If no recent activity is detected from plain-text metadata, it queues a reminder email.
  - **Sync Queue Cleanup:** Daily job deleting `sync_queue` rows where `consumed_at IS NOT NULL AND consumed_at < NOW() - INTERVAL '30 days'`. Prevents unbounded table growth.

### API Design

_Note: All Sync, Accounts, and Users endpoints require Auth middleware (JWT validation). JWTs are checked against the Redis blocklist on every request._

| Method     | Endpoint                            | Group    | Description                                                                                                                                                      |
| :--------- | :---------------------------------- | :------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **POST**   | `/api/v1/auth/register`             | Auth     | Accepts email, password hash, `public_key`, `encrypted_private_key`. Queues OTP email.                                                                           |
| **POST**   | `/api/v1/auth/verify-otp`           | Auth     | Validates OTP against the `otps` table and sets `is_verified = true`.                                                                                            |
| **POST**   | `/api/v1/auth/login`                | Auth     | Authenticates and returns a signed JWT.                                                                                                                          |
| **POST**   | `/api/v1/auth/logout`               | Auth     | Adds the current JWT to the Redis blocklist (TTL = token remaining lifetime).                                                                                    |
| **GET**    | `/api/v1/auth/keys`                 | Auth     | Returns the authenticated user's `encrypted_private_key` (for new device logins).                                                                                |
| **PUT**    | `/api/v1/auth/password`             | Auth     | Accepts new `encrypted_private_key` (re-encrypted with new password-derived key).                                                                                |
| **GET**    | `/api/v1/users/lookup?email=`       | Users    | Returns a target user's `public_key` only. Used to encrypt an Account Key before inviting.                                                                       |
| **GET**    | `/api/v1/sync/pull?since=<ts>`      | Sync     | Fetches new data and `sync_queue` items since the given timestamp. **Paginated** (cursor-based, max 500 items per page). Marks returned queue items as consumed. |
| **POST**   | `/api/v1/sync/push`                 | Sync     | Accepts an array of offline operations. Generates `sync_queue` entries for joint users.                                                                          |
| **POST**   | `/api/v1/accounts/`                 | Accounts | Creates a new account entity.                                                                                                                                    |
| **DELETE** | `/api/v1/accounts/{id}`             | Accounts | Soft-deletes the account; queues a `DELETE` sync event for all joint users.                                                                                      |
| **POST**   | `/api/v1/accounts/{id}/invite`      | Accounts | Submits an Account Key encrypted with the target user's Public Key.                                                                                              |
| **GET**    | `/api/v1/accounts/{id}/users`       | Accounts | Lists users belonging to a joint account.                                                                                                                        |
| **DELETE** | `/api/v1/accounts/{id}/users/{uid}` | Accounts | Removes a user from a joint account (revokes write access; see key-rotation limitation).                                                                         |
| **GET**    | `/api/v1/categories`                | Categories | Lists all categories for the authenticated user.                                                                                                                 |
| **POST**   | `/api/v1/categories`                | Categories | Creates a new category (body: `{ name, type }`).                                                                                                                 |
| **DELETE** | `/api/v1/categories/{id}`           | Categories | Deletes a category by its ID.                                                                                                                                    |
| **POST**   | `/api/v1/transactions/{id}/documents`             | Documents | Uploads an encrypted document (receipt) for a transaction. Body: `{ encrypted_data, mime_type, file_name, file_size }`. Max 10 MB. |
| **GET**    | `/api/v1/transactions/{id}/documents`             | Documents | Lists document metadata for a transaction (no encrypted data).                                                                                                   |
| **GET**    | `/api/v1/transactions/{id}/documents/{docId}/data` | Documents | Returns a document's encrypted data (to be decrypted client-side with the account key).                                                                          |
| **DELETE** | `/api/v1/transactions/{id}/documents/{docId}`      | Documents | Deletes a document from a transaction.                                                                                                                           |

### Router Setup (`routy`)

`routy` is a lightweight router built on Go's standard `net/http`. Install with:

```
go get github.com/skipperoo/routy
```

The entry point wires all routes by splitting public and protected subrouters. Protected routes are mounted under `/api/` with the JWT middleware applied at the subrouter level, so no individual handler needs to check auth.

**`main.go`**

```go
package main

import (
    "log"
    "net/http"

    "github.com/skipperoo/routy"
    "budgeteer/internal/handler"
    "budgeteer/internal/middleware"
)

func main() {
    recoverMw := routy.NewRecoverMiddleware(nil)
    loggingMw := routy.NewLoggingMiddleware(middleware.StructuredLogger)

    // --- Public routes (no auth) ---
    router := routy.NewRouter()
    router.
        AddMiddleware(recoverMw.GetMiddleware()).
        AddMiddleware(loggingMw.GetMiddleware()).
        AddHandler("POST /api/v1/auth/register",   handler.Register).
        AddHandler("POST /api/v1/auth/verify-otp", handler.VerifyOTP).
        AddHandler("POST /api/v1/auth/login",       handler.Login)

    // --- Protected routes (JWT + Redis blocklist check) ---
    protected := routy.NewRouter()
    protected.
        AddMiddleware(middleware.JWTAuth).
        AddHandler("POST   /api/v1/auth/logout",   handler.Logout).
        AddHandler("GET    /api/v1/auth/keys",     handler.GetKeys).
        AddHandler("PUT    /api/v1/auth/password", handler.ChangePassword).
        AddHandler("GET    /api/v1/users/lookup",  handler.LookupUser).
        AddHandler("GET    /api/v1/sync/pull",     handler.SyncPull).
        AddHandler("POST   /api/v1/sync/push",     handler.SyncPush).
        AddHandler("POST   /api/v1/accounts/",                   handler.CreateAccount).
        AddHandler("DELETE /api/v1/accounts/{id}",               handler.DeleteAccount).
        AddHandler("POST   /api/v1/accounts/{id}/invite",        handler.InviteToAccount).
        AddHandler("GET    /api/v1/accounts/{id}/users",         handler.ListAccountUsers).
        AddHandler("DELETE /api/v1/accounts/{id}/users/{uid}",   handler.RemoveAccountUser)
    protected.Finalize()

    router.AddSubroute("/api/", protected)
    router.Finalize()

    log.Println("Budgeteer listening on :8080")
    http.ListenAndServe(":8080", router)
}
```

Path parameters are accessed via the standard `r.PathValue()`, and the JWT middleware attaches the parsed claims to the request context for downstream handlers:

**`internal/middleware/auth.go`**

```go
func JWTAuth(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        raw := r.Header.Get("Authorization")
        if raw == "" || !strings.HasPrefix(raw, "Bearer ") {
            http.Error(w, "unauthorized", http.StatusUnauthorized)
            return
        }
        token := strings.TrimPrefix(raw, "Bearer ")
        claims, err := jwt.Validate(token)
        if err != nil {
            http.Error(w, "unauthorized", http.StatusUnauthorized)
            return
        }
        // Check Redis blocklist (set by /auth/logout and key rotation)
        if redis.IsBlocked(r.Context(), token) {
            http.Error(w, "token revoked", http.StatusUnauthorized)
            return
        }
        ctx := context.WithValue(r.Context(), middleware.ClaimsKey, claims)
        next.ServeHTTP(w, r.WithContext(ctx))
    })
}
```

---

## 5. Database Schema

**File:** `backend/migrations/0001_initial.sql`

```sql
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
-- USER CATEGORIES (user-defined, scoped per user)
-- Each user maintains their own category list, split by
-- transaction type (income / expense).
-- ============================================================
CREATE TABLE user_categories (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       VARCHAR(100) NOT NULL,
    type       VARCHAR(10) NOT NULL CHECK (type IN ('income', 'expense')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, name, type)
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
    encrypted_payload TEXT NOT NULL, -- LZ4 → AES-256-GCM → Base64
    version           INT DEFAULT 1,
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW(),
    deleted_at        TIMESTAMPTZ,   -- soft delete; NULL = active
    PRIMARY KEY (id, time)
);

SELECT create_hypertable('transactions', 'time');

-- ============================================================
-- TRANSACTION DOCUMENTS
-- Stores encrypted document files (receipts, invoices, etc.)
-- linked to a transaction. Encrypted with the same AES-256 account
-- key used for transaction payloads. Metadata is plaintext for UI.
-- ============================================================
CREATE TABLE transaction_documents (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id  UUID NOT NULL
    encrypted_data  BYTEA NOT NULL,
    mime_type       VARCHAR(255) NOT NULL,
    file_name       VARCHAR(255) NOT NULL,
    file_size       BIGINT NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

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

-- Transaction documents
CREATE INDEX ON transaction_documents (transaction_id);

-- User categories
CREATE INDEX ON user_categories (user_id);
```

### Migration Workflow

Incremental schema changes are stored as numbered SQL files in `backend/migrations/` (e.g. `0002_add_account_name.sql`, `0003_add_user_preferences.sql`). To apply pending migrations:

```bash
# Using the migration script (reads DB_HOST, DB_PORT, DB_USER, DB_NAME
# from environment, and db_password from Docker secret or env var):
./backend/scripts/migrate.sh

# Or apply a single file manually via psql:
psql "$DATABASE_URL" -f backend/migrations/0004_add_user_categories.sql
```

The migration script (`backend/scripts/migrate.sh`) tracks applied files in a `_migrations` table and only applies each file once. It is safe to run multiple times.

---

## 6. Deployment (Docker)

The application uses Docker Compose with strict secret management. Environment variables are not used for sensitive credentials.

**File:** `docker-compose.yml`

```yaml
version: "3.8"

services:
  frontend:
    build: ./frontend
    ports:
      - "80:80"
      - "443:443"
    depends_on:
      - backend

  backend:
    build: ./backend
    secrets:
      - jwt_secret
      - db_password
      - smtp_password
      - redis_password
    environment:
      - DB_HOST=postgres
      - DB_USER=budgeteer
      - DB_NAME=budgeteer
      - REDIS_HOST=redis
      # Secrets are read directly from /run/secrets/ at runtime
    ports:
      - "8080:8080"
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_started

  postgres:
    image: timescale/timescaledb:latest-pg16
    secrets:
      - db_password
    environment:
      - POSTGRES_USER=budgeteer
      - POSTGRES_DB=budgeteer
      - POSTGRES_PASSWORD_FILE=/run/secrets/db_password
    ports:
      - "5432:5432"
    volumes:
      - ./pg_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U budgeteer"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    secrets:
      - redis_password
    command: >
      sh -c 'redis-server --requirepass "$$(cat /run/secrets/redis_password)"'
    ports:
      - "6379:6379"
    volumes:
      - ./redis_data:/data

secrets:
  jwt_secret:
    file: ./secrets/jwt_secret.txt
  db_password:
    file: ./secrets/db_password.txt
  smtp_password:
    file: ./secrets/smtp_password.txt
  redis_password:
    file: ./secrets/redis_password.txt
```

> **Note:** Redis is used for JWT blocklisting (logout, key rotation) and rate limiting. A blocked JWT is stored with a TTL equal to its remaining lifetime, ensuring the blocklist stays self-pruning. Redis data does not need to be durable — the volume mount above is optional; remove it if you prefer a fully ephemeral cache.

---

## 7. Development Workflow

### Branching Strategy

`master` is the stable, deployable branch. **No one pushes directly to `master`.** Every unit of work — bug fix, feature, refactor, migration — lives in its own branch and enters `develop` exclusively through a pull request once all checks pass. Only humans promote `develop` builds to `master`.

Branch names follow this convention:

```
<type>/<short-description>
```

| Type         | When to use                                               |
| :----------- | :-------------------------------------------------------- |
| `feature/`   | New functionality (e.g. `feature/savings-plan-cron`)      |
| `fix/`       | Bug fixes (e.g. `fix/sync-queue-consumed-at`)             |
| `refactor/`  | Internal restructuring with no behaviour change           |
| `migration/` | Database schema changes (e.g. `migration/add-otps-table`) |
| `chore/`     | Tooling, dependencies, CI config                          |

### Merge Rules

A branch may only be merged into `master` when **all** of the following are true:

1. The CI pipeline passes (build, lint, full test suite).
2. Every new feature or bug fix introduced by the branch is accompanied by tests (see Testing Requirements below).
3. No test that existed before the branch was opened has been deleted or disabled to make the suite pass.

If any check fails, the branch is not merged — it is fixed until the checks pass.

### Testing Requirements

Every pull request that introduces new behaviour **must** ship its tests in the same branch and the same commit. Tests are not a follow-up task; they are part of the definition of done.

**Backend (Go)**

| Layer       | Tool                            | What to cover                                                                                   |
| :---------- | :------------------------------ | :---------------------------------------------------------------------------------------------- |
| Unit        | `testing` (stdlib)              | Pure functions: crypto helpers, payload serialisers, conflict resolution logic, cron predicates |
| Integration | `testing` + `testcontainers-go` | Each handler against a real PostgreSQL + Redis instance spun up in Docker                       |
| Auth flows  | Integration                     | Register → verify-OTP → login → logout cycle; JWT blocklist eviction                            |

Minimum expectations per PR:

- New handler → at least one happy-path and one error-path integration test.
- New background worker → unit test for the scheduling predicate; integration test for the database interaction.
- New database migration → tested via the integration suite against a fresh schema.

**Frontend (TypeScript)**

| Layer     | Tool                  | What to cover                                                                                      |
| :-------- | :-------------------- | :------------------------------------------------------------------------------------------------- |
| Unit      | Vitest                | Crypto pipeline (encrypt → decrypt round-trip), LWW conflict resolver, offline queue logic         |
| Component | React Testing Library | Form validation, error states, loading states                                                      |
| E2E       | Playwright            | Critical user journeys: registration, login, create account, add transaction, joint account invite |

Minimum expectations per PR:

- New UI component → component tests for its interactive states.
- New crypto or sync logic → unit tests with known input/output vectors.
- New user journey → Playwright test covering the happy path.

### CI Pipeline

The GitHub Actions workflow (`.github/workflows/ci.yml`) runs on every push to any branch and on every pull request targeting `master`:

```
1. Lint       — golangci-lint (Go), ESLint + tsc --noEmit (TS)
2. Unit tests — go test ./... (Go), vitest run (TS)
3. Integration tests — testcontainers suite against postgres + redis
4. E2E tests  — Playwright against a docker-compose stack
5. Build      — go build (Go), vite build (TS)
```

All five steps must be green. A pull request with a red pipeline cannot be merged, regardless of review approvals.
