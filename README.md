# Budgeteer

A collaborative, offline-first personal finance tracker with end-to-end encryption.

Budgeteer puts you in full control of your finances. Every cent of sensitive data - amounts, categories, notes, counterparties - is encrypted before it leaves your browser. The server stores only what it needs for routing and indexing (timestamps, account IDs). Not even the database administrator can read your transactions.

---

## Features

| Category | Capabilities |
| :------- | :----------- |
| **Accounts** | Personal, joint (with cryptographic key distribution), and savings accounts. Create, edit (name, currency, type, opening balance), soft-delete. |
| **Transactions** | Income, expense, and account-to-account transfers. Encrypted payloads (AES-256-GCM). Soft-delete + re-insert for corrections. |
| **Categories** | Per-user income/expense categories with custom colours (hex) and icons (lucide-react). Enable/disable toggle. Stable `category_id` resolution - rename or delete a category and all transactions update instantly. |
| **Filters** | Date-range quick presets (7d/30d/90d), transaction type checkboxes, category multi-select. Filter button shows active count badge. |
| **Rules** | Automated recurring transactions: `payment` (expense), `transfer` (between own accounts), `user_transfer` (cross-user), `income` (positive), `mortgage` (amortized loan). Commission tracking. Alert offset for pre-fire notifications (1h–2wk). Payloads encrypted with the server's X25519 public key. |
| **Mortgage Rules** | French (fixed payment) or Italian (decreasing) amortization. Monthly payment computed server-side via amortization formula. `interest_amount` shown separately from principal in transaction cards. Auto-deactivates when balance reaches zero. |
| **Budgets** | Per-account or global spending limits with E2E-encrypted payloads. Threshold notifications at 50 % / 80 % / 100 %. Progress computed client-side. |
| **Savings Plans** | Track savings goals with source account deductions, target amount, and time horizon. |
| **Send to User** | One-time transactions to other users via email. Double-encrypted payloads (sender → server → recipient). |
| **Joint Accounts** | Invite users via email. AES-256 Account Key distributed via ECIES (X25519 + AES-GCM). |
| **Invitations** | Pending/accept/decline/expire workflow for accounts, rules, and transaction invitations. 30-day automatic expiry. |
| **Notifications** | In-app notification panel with unread badge (polled every 30 s). Email outbox dispatched via background worker. |
| **Data Management** | Download all data (encrypted JSON zip archive), restore from a previous dump, or permanently delete your account (all soft-deleted). |
| **PIN Unlock** | Device-local PIN (stored in localStorage, never synced) as a convenience to skip password entry on trusted devices. Per-user isolation - PIN from one user is silently cleared when another user logs in. |
| **Remember Device** | Skip OTP on trusted devices via device fingerprint (`@fingerprintjs/fingerprintjs`) and SHA-256 device tokens stored in the `access_secrets` table. |
| **Admin Panel** | Standalone Vite + React app on port 5174. Table browser (schema introspection, inline editing, bulk deletion), client migration management (grouped by user, reschedule, edit status), notification/email dispatch to selected users or everyone. Default admin: `admin@budgeteer.com` / `changeme` (must change on first login). |
| **Offline Sync** | Push/pull with cursor-based pagination (max 500 items/page). Last-Write-Wins conflict resolution. Immutable transactions (soft-delete + re-insert). |

---

## Tech Stack

| Layer | Technology |
| :---- | :--------- |
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS v4, Shadcn UI, Zustand, Recharts |
| **Backend** | Go 1.26+, `routy` router, PostgreSQL / TimescaleDB (hypertable), Redis |
| **Admin Panel** | Vite + React (standalone, served on port 5174) |
| **Crypto** | Web Crypto API (AES-256-GCM), `@noble/ciphers`, `@noble/curves` (X25519, Ed25519), Argon2id, ECIES prefix routing |
| **Deployment** | Docker Compose with Docker secrets (two compose files available) |
| **CI/CD** | GitHub Actions (lint, unit, integration, E2E, build) |

---

## Architecture Highlights

### Encryption Model

```
JSON Payload → LZ4 Compress → AES-256-GCM Encrypt → Base64 Encode
```

- **Data splitting:** Metadata for routing and time-series indexing (`transaction_id`, `account_id`, `timestamp`) stays in plaintext. All financial data goes into the encrypted payload.
- **Key management:** Each user generates an X25519 keypair on registration. The private key is symmetrically encrypted with the user's password via Argon2id + AES-256-GCM and stored server-side. It is decrypted client-side on login and **held in memory only** - never persisted to IndexedDB, localStorage, or any persistent storage.
- **ECIES prefix routing:** Payloads starting with `"1|"` were encrypted via ECIES (X25519 + AES-GCM) using the user's X25519 public key (rule-generated transactions). Otherwise, they were encrypted with the account key (AES-GCM). The frontend detects the prefix and uses the correct decryption path transparently.
- **Account keys:** Joint accounts use a random AES-256 key. When inviting a user, the key is encrypted with the recipient's X25519 public key via ECIES. Alternatively, the inviter can encrypt with the **server's** X25519 public key, allowing invitations to unregistered users - the server re-encrypts with the recipient's key on acceptance.
- **Budget encryption:** Budget payloads use the same ECIES scheme with the user's own X25519 public key, since budgets are personal settings (not shared account data).
- **Session model:** Zustand store holds the decrypted private key in memory during the session. Cleared on logout or tab close.

### Background Workers

All workers run as goroutines alongside the HTTP server.

| Worker | Interval | Description |
| :----- | :------- | :---------- |
| **Email Dispatcher** | Continuous (poll) | Sends pending emails from `email_outbox` via SMTP. Max 5 retries, then marks as failed. |
| **Rule Scheduler** | Configurable (default 300 s) | Polls `rules` for active rules where `next_occurrence <= NOW()`. Decrypts payload with server's X25519 private key, checks preconditions, creates transactions (encrypted with user's X25519 public key via ECIES), updates balances. Handles mortgage amortization (French/Italian), user transfer target resolution, and commission. |
| **Rule Notifier** | Configurable (default 300 s) | Polls `rules` for active rules with `alert_offset`. Sends in-app notification + queues email when `(next_occurrence - alert_offset) <= NOW()`. |
| **Invitation Expiry** | Every 6 h | Expires pending invitations older than 30 days. Deletes associated rules. Notifies inviters. |
| **Savings Plan Cron** | Daily | Checks savings plans where `tracking_end` passed or no activity in 30 days. Queues reminder emails. |
| **Sync Queue Cleanup** | Daily | Deletes consumed sync queue entries older than 30 days. |

---

## Quick Start

```bash
# Prerequisites: Docker, Go 1.26+, Node.js 22+

# 0. Generate required secrets (one-time)
mkdir -p secrets
echo -n "change-me" > secrets/jwt_secret.txt
echo -n "change-me" > secrets/db_password.txt
echo -n "change-me" > secrets/smtp_password.txt
echo -n "change-me" > secrets/redis_password.txt
echo -n "change-me" > secrets/server_encryption_key.txt

# 1. Start the full stack
docker compose up -d

# 2. Run tests (unit + integration)
./run_tests.sh

# 3. Frontend dev server (proxies /api to backend)
cd frontend && npm run dev

# 4. Backend (runs on :8080)
cd backend/src && go run ./cmd/budgeteer-backend

# 5. Admin panel (runs on :5174)
cd admin-panel && npm run dev
```

> **Development with HTTPS:** Web Crypto API requires a secure context. Use `docker compose -f docker-compose-dev.yml up -d` for local development with HTTPS (Angie/nginx reverse proxy on port 8443). Run `./gen_certs.sh <your-dev-ip>` first to generate self-signed certificates.

> **Admin Panel:** After starting the stack, visit `http://localhost:5174` (or `https://<ip>:8443/admin` in dev mode). Default credentials: `admin@budgeteer.com` / `changeme` - you will be prompted to change the password on first login.

---

## Project Structure

```
budgeteer/
├── backend/src/
│   ├── cmd/budgeteer-backend/    # Entry point, router wiring, graceful shutdown
│   ├── internal/
│   │   ├── handler/              # HTTP handlers (routy)
│   │   ├── service/              # Business logic (auth, sync, accounts, rules, budgets)
│   │   ├── repository/           # Database access layer (pgx)
│   │   ├── middleware/           # JWT auth + Redis blocklist middleware
│   │   ├── model/                # Data models
│   │   ├── database/             # Connection pool management
│   │   ├── logger/               # Structured logging
│   │   ├── worker/               # Background workers (email, rule scheduler, notifier, cron)
│   │   └── testhelpers/          # Shared integration test infra (testcontainers-go)
│   └── migrations/               # SQL migration files (0001_initial.sql, 0002_…, etc.)
├── frontend/
│   ├── src/
│   │   ├── components/           # React components (Shadcn UI)
│   │   │   ├── TransactionForm/  # Transaction create/edit with transfer toggle, send-to-user
│   │   │   ├── FilterMenu/       # Date range presets, type & category filters
│   │   │   ├── PrivateKeyGate/   # Password / PIN unlock gate
│   │   │   ├── CategoryManagementSection/  # Category CRUD with colour, icon, toggle
│   │   │   ├── DataManagementSection/      # Download/restore/delete account
│   │   │   └── PieChart/         # Category pie charts with colour, icon, "+N more" popover
│   │   ├── lib/                  # Crypto (AES-GCM, ECIES), sync queue, API client
│   │   ├── stores/               # Zustand stores (auth, accounts, categories, filter, budgets)
│   │   └── pages/                # Route pages (Dashboard, Accounts, Settings, Budgets, Rules)
│   └── vite.config.ts
├── admin-panel/                  # Standalone Vite + React admin app (port 5174)
│   └── src/
│       ├── components/
│       │   ├── TableBrowser/     # Generic schema introspection, inline edit, bulk delete
│       │   ├── MigrationManage/  # Client migrations grouped by user, reschedule, status edit
│       │   └── DispatchPanel/    # Notification/email dispatch to selected users or all
│       └── pages/
├── docker-compose.yml            # Production stack
├── docker-compose-dev.yml        # Dev stack with HTTPS reverse proxy
├── run_tests.sh                  # One-command test runner
├── AGENTS.md                     # Full technical specification (178 KB)
├── BACKLOG.md                    # Open issues and TODO list
└── CHANGELOG.md                  # User-facing changelog
```

---

## API Overview

All routes are under `/api/v1/`. Authenticated routes require a `Bearer <JWT>` header. Unauthenticated routes: registration, login, OTP verification, health check, and the server's public key.

| Group | Key Endpoints |
| :---- | :------------ |
| **Auth** | `POST register`, `POST verify-otp`, `POST login`, `POST login-with-device`, `POST login-verify-otp`, `POST logout`, `GET keys`, `PUT password`, `GET me`, `GET/PUT preferences` |
| **Users** | `GET lookup?email=` (returns public key) |
| **Sync** | `GET pull?since=<ts>` (paginated), `POST push` (batch offline ops) |
| **Accounts** | `GET`, `POST`, `PUT /{id}`, `DELETE /{id}`, `POST /{id}/invite`, `PUT /{id}/key`, `GET /{id}/users`, `DELETE /{id}/users/{uid}` |
| **Transactions** | `GET /accounts/{id}/transactions`, `POST /accounts/{id}/transactions`, `PUT /transactions/{id}`, `DELETE /transactions/{id}` |
| **Documents** | `POST /transactions/{id}/documents`, `GET /transactions/{id}/documents`, `GET /transactions/{id}/documents/{docId}/data`, `DELETE /transactions/{id}/documents/{docId}` |
| **Categories** | `GET`, `POST`, `PUT /{id}`, `DELETE /{id}` |
| **Budgets** | `GET`, `POST`, `PUT /{id}`, `DELETE /{id}`, `POST /{id}/notify` |
| **Rules** | `GET public-key` (unauthenticated), `GET`, `POST`, `PUT /{id}`, `DELETE /{id}` |
| **Notifications** | `GET`, `GET /count`, `PUT /{id}/read` |
| **Invitations** | `GET`, `POST /{id}/accept`, `POST /{id}/decline` |
| **User Data** | `GET /user/dump`, `POST /user/restore`, `DELETE /user` |
| **Admin** | `POST /admin/auth/login`, `POST /admin/auth/change-password`, `GET/POST/DELETE /admin/admins`, `GET /admin/tables`, `GET /admin/tables/{name}/data` (paginated), `PUT /admin/tables/{name}/data/{id}`, `DELETE /admin/tables/{name}/data`, `GET /admin/migrations`, `PUT /admin/migrations/{id}`, `POST /admin/dispatch` |

See `AGENTS.md` §4 for full route specifications.

---

## Database

Uses **TimescaleDB** (PostgreSQL extension) with a hypertable for transactions.

**Key tables:**

| Table | Purpose |
| :---- | :------ |
| `users` | User accounts, password hash, X25519 keypair |
| `otps` | Hashed one-time passwords for email verification |
| `accounts` | Personal/joint/savings accounts (soft-delete) |
| `account_users` | Joint account membership + encrypted account key |
| `user_categories` | Per-user income/expense categories (colour, icon, is_disabled) |
| `transactions` | Hypertable: encrypted payloads with plaintext routing metadata |
| `transaction_documents` | Encrypted receipt/invoice files |
| `recurring_transactions` | Template + schedule for auto-generated transactions |
| `rules` | Automated rules: payment, transfer, user_transfer, income, mortgage |
| `budgets` | E2E-encrypted spending limits with threshold notification flags |
| `savings_plans` | Savings goals with source account, target, timeline |
| `notifications` | In-app notification panel |
| `invitations` | Polymorphic invitations (account, rule, transaction) |
| `sync_queue` | Offline operation delivery for joint account members |
| `email_outbox` | Email dispatch queue (polled by worker) |
| `access_secrets` | Device tokens for "remember this device" |
| `admin_users` | Admin credentials (bcrypt-hashed), seeded with `admin@budgeteer.com` |
| `_migrations` | Tracks which SQL migration files have been applied |

Migrations are incremental SQL files in `backend/src/migrations/`. Apply with:

```bash
./backend/scripts/migrate.sh
```

---

## Deployment

### Production (`docker-compose.yml`)

```bash
# Generate secrets (one-time)
mkdir -p secrets
echo -n "<random-jwt-secret>" > secrets/jwt_secret.txt
echo -n "<random-db-password>" > secrets/db_password.txt
echo -n "<smtp-password>" > secrets/smtp_password.txt
echo -n "<random-redis-password>" > secrets/redis_password.txt
echo -n "<random-server-encryption-key>" > secrets/server_encryption_key.txt

# Start
docker compose up -d

# Services:
#   - Frontend:       http://localhost:80
#   - Backend API:    http://localhost:8080
#   - Admin Panel:    http://localhost:5174
#   - PostgreSQL:     localhost:5432
#   - Redis:          localhost:6379
#   - pgAdmin:        http://localhost:5050 (dev only)
```

### Development with HTTPS (`docker-compose-dev.yml`)

Web Crypto API requires a secure context. For local development:

```bash
# 1. Generate self-signed certificates for your dev machine IP
./gen_certs.sh <your-machine-ip>

# 2. Start the dev stack
docker compose -f docker-compose-dev.yml up -d

# 3. Access at:
#    https://<your-dev-ip>:8443     (HTTPS)
#    http://<your-dev-ip>:8080      (backend API directly)
```

---

## Environment Variables

| Variable | Default | Description |
| :------- | :------ | :---------- |
| `DB_HOST` | `postgres` | PostgreSQL host |
| `DB_USER` | `budgeteer` | PostgreSQL user |
| `DB_NAME` | `budgeteer` | PostgreSQL database |
| `REDIS_HOST` | `redis` | Redis host |
| `SMTP_HOST` | - | SMTP server hostname |
| `SMTP_PORT` | `587` | SMTP port |
| `SMTP_USER` | - | SMTP username |
| `SMTP_FROM` | `noreply@budgeteer.app` | From address for sent emails |
| `SMTP_SSL` | `false` | Use SSL for SMTP |
| `LOG_LEVEL` | `INFO` | Log level (`DEBUG`, `INFO`, `WARN`, `ERROR`) |
| `RULES_CHECK_INTERVAL` | `300` | Rule scheduler/notifier poll interval (seconds) |

Sensitive values (DB password, JWT secret, SMTP password, Redis password, server encryption key) are read from Docker secrets at `/run/secrets/`.
