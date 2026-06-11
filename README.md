# Budgeteer

A collaborative, offline-first personal finance tracker with end-to-end encryption.

**Key features:**
- Offline-first architecture with sync queue for multi-device / joint account use
- End-to-end encryption (AES-256-GCM + X25519 key exchange) — the server never sees plaintext financial data
- Joint accounts with cryptographic key distribution (ECIES)
- Recurring transactions, savings plans, and custom subcategories
- TimescaleDB hypertable for efficient time-series transaction storage
- Conflict resolution via Last-Write-Wins with immutable transactions

---

## Tech Stack

| Layer       | Technology                                                           |
| :---------- | :------------------------------------------------------------------- |
| **Frontend**  | React 19, TypeScript, Vite, Tailwind CSS v4, Shadcn UI, Zustand, Recharts |
| **Backend**   | Go 1.26+, routy router, PostgreSQL / TimescaleDB, Redis                |
| **Deployment**| Docker Compose with Docker secrets                                   |
| **Crypto**    | Web Crypto API, @noble/ciphers, @noble/curves (X25519, Ed25519)      |

---

## Quick Start

```bash
# Prerequisites: Docker, Go 1.26+, Node.js 22+

# 1. Start the stack
docker compose up -d

# 2. Run tests (unit + integration)
./run_tests.sh

# 3. Frontend dev server (proxies /api to backend)
cd frontend && npm run dev

# 4. Backend (runs on :8080)
cd backend/src && go run ./cmd/budgeteer-backend
```

> **First run:** The PostgreSQL container auto-applies migrations from `backend/src/migrations/`. Create `secrets/` files before starting (see `docker-compose.yml` for the list).

---

## Project Structure

```
budgeteer/
├── backend/src/
│   ├── cmd/budgeteer-backend/   # Entry point, router wiring, graceful shutdown
│   ├── internal/
│   │   ├── handler/             # HTTP handlers (routy)
│   │   ├── service/             # Business logic (auth, sync, accounts)
│   │   ├── repository/          # Database access layer (pgx)
│   │   ├── middleware/           # JWT auth middleware
│   │   ├── model/               # Data models
│   │   ├── database/            # Connection pool management
│   │   ├── logger/              # Structured logging
│   │   ├── worker/              # Background workers (email, cron)
│   │   └── testhelpers/         # Shared integration test infra (testcontainers-go)
│   └── migrations/              # SQL migration files
├── frontend/
│   ├── src/
│   │   ├── components/          # React components (Shadcn UI)
│   │   ├── lib/                 # Crypto, sync, API client
│   │   ├── stores/              # Zustand stores (auth, accounts)
│   │   └── pages/               # Route pages
│   └── vite.config.ts
├── docker-compose.yml           # Full stack with secrets
├── run_tests.sh                 # One-command test runner
└── AGENTS.md                    # Full technical specification
```

---

## Development

### Branching

| Branch  | Purpose                                  |
| :------ | :--------------------------------------- |
| `master` | Stable, deployable — human-promoted from `develop` |
| `develop` | Integration branch — feature/fix PRs merge here |

Branch names follow `<type>/<short-description>`:
`feature/`, `fix/`, `refactor/`, `migration/`, `chore/`.

### Testing

Every PR must ship tests in the same commit. Minimum requirements:

| Layer       | Tool                            | Coverage                          |
| :---------- | :------------------------------ | :-------------------------------- |
| Backend     | Go testing + testcontainers-go  | Each handler: happy + error path  |
| Frontend    | Vitest + React Testing Library  | Components: form, error, loading  |
| E2E         | Playwright                      | Critical user journeys            |

Run the full suite with a single command:

```bash
./run_tests.sh
```

All checks must pass before merge — no exceptions.

### Environment Variables

| Variable          | Default               | Description                         |
| :---------------- | :-------------------- | :---------------------------------- |
| `DB_HOST`         | `postgres`            | PostgreSQL host                     |
| `DB_USER`         | `budgeteer`           | PostgreSQL user                     |
| `DB_NAME`         | `budgeteer`           | PostgreSQL database                 |
| `REDIS_HOST`      | `redis`               | Redis host                          |
| `SMTP_HOST`       | —                     | SMTP server (for email dispatcher)  |
| `LOG_LEVEL`       | `INFO`                | Log level (DEBUG, INFO, WARN, ERROR)|

Sensitive values (db passwords, JWT secret, SMTP credentials) are read from Docker secrets at `/run/secrets/`.

---

## Architecture Highlights

- **E2E Encryption:** Plain-text metadata for indexing (`account_id`, `timestamp`); encrypted payload for all financial data
- **Session Model:** Private key decrypted client-side from Argon2id-derived key, held in-memory in Zustand — never persisted to localStorage/IndexedDB
- **Joint Accounts:** AES-256 Account Key shared via ECIES (X25519 + AES-GCM) using recipient's public key
- **Offline Sync:** Push/pull with cursor-based pagination; Last-Write-Wins conflict resolution; immutable transactions (soft-delete + re-insert)
- **Redis:** JWT blocklisting (self-pruning via TTL) and rate limiting
