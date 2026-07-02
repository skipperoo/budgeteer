# Budgeteer - Technical Specifications

> **Revision 13** — Opening balance is now editable from the account Edit dialog (name/currency/type/opening balance in one form). Instead of creating a new adjustment transaction each time, the flow updates the existing Opening Balance transaction in-place (or creates one if none exists) and deletes any stale adjustment transactions. The Total Transactions count now explicitly excludes Opening Balance transactions. See Section 3 (AccountDetailPage account edit dialog), Section 5 (no migration — existing `transactions` table used).

> **Revision 12** — Added account-to-account transfer support. The `TransactionPayload` now includes optional `is_transfer`, `transfer_pair_id`, `transfer_source_account_id`, `transfer_target_account_id`, `transfer_source_account_name`, and `transfer_target_account_name` fields. The `TransactionForm` has a new "Account Transfer" toggle (switch) below the date field; when active, the expense/income type selector and category dropdown are hidden, and a "Target Account" dropdown (listing all other user accounts) is shown instead. The counterparty field is auto-filled as "From Account → To Account" and set to read-only. The "Send to" accordion is hidden while transfer mode is active. Transfer creation creates two linked transactions sequentially (expense in source, income in target) with a shared `transfer_pair_id` in the encrypted payload. The `AccountDetailPage` inline create form was refactored to use the shared `TransactionForm`. Transfers are excluded from dashboard and account detail stats: transaction count, income/expense counts, money flow (cumulative income/expenses), and category pie charts — via the new `isTransferPayload()` helper. Adding `isTransferPayload()` and `getTransferPairId()` helpers to `crypto-transaction.ts`. Edit flow supports updating both sides of a transfer, converting a regular transaction to a transfer (creates paired transaction), and converting a transfer back to a regular transaction (deletes paired transaction). No database migration needed — all transfer metadata lives in the encrypted payload. See Section 2 (ECIES prefix routing), Section 3 (TransactionForm transfer toggle, DashboardPage/AccountDetailPage filtering), Section 4 (no backend changes — frontend creates both transactions), Section 5 (no migration — encrypted payload fields only).

> **Revision 10** — Added dump, restore, and delete account features. New backend endpoints: `GET /api/v1/user/dump` returns all user data as raw encrypted JSON (accounts, transactions, documents, categories, budgets, rules, notifications, invitations, savings plans, recurring transactions). `POST /api/v1/user/restore` accepts re-encrypted data, clears all existing user data atomically in a transaction, and inserts the provided data (preserving original IDs). `DELETE /api/v1/user` soft-deletes personal accounts, removes the user from joint accounts, and deletes all other user-associated data; transactions sent to other users are preserved. The frontend `SettingsPage` includes a new `DataManagementSection` with: "Download Data" (fetches dump, creates a multi-file zip archive via JSZip), "Restore Data" (parses a previously downloaded zip, sends re-encrypted payload with "Guacamole" confirmation), and "Delete Account" (sends deletion request with "DELETE" confirmation; on success logs the user out). See Section 2 (data management encryption), Section 3 (DataManagementSection component), Section 4 (user data endpoints), Section 5 (no new migration — all data lives in existing tables).

> **Revision 9** — Added "send to user" one-time transaction with invitation flow. When creating a transaction, the sender can optionally provide a `target_email` and `server_encrypted_payload` (payload encrypted with the server's X25519 public key). The backend creates the expense transaction normally, then creates a pending `'transaction'` invitation. The recipient sees the invitation in their pending invitations list, chooses an account, and accepts. The server decrypts the payload, re-encrypts it with the recipient's X25519 public key, creates an income transaction in the recipient's account, and updates both balances. The invitation `entity_type` CHECK constraint is extended to accept `'transaction'` (migration 0013). The frontend `TransactionForm` has an optional "Send to user" accordion section for the target email; on submit it fetches the server's public key and double-encrypts the payload. See Section 2 (double-encryption for send-to-user), Section 3 (send-to-user accordion in TransactionForm), Section 4 (transaction invitation endpoints), Section 5 (migration 0013).

> **Revision 8** — Added "Remember this device" (skip OTP on trusted devices) and PIN unlock for the private key gate. New `access_secrets` table (migration 0012) stores bcrypt-style device secrets bound to user+password via SHA-256. Login flow now checks for a stored device token before showing the OTP step; if the device is recognized, a new `POST /api/v1/auth/login-with-device` endpoint returns a JWT directly. Device fingerprint uses `@fingerprintjs/fingerprintjs` for stable cross-session identification. PIN unlock stores the user's password encrypted with the PIN in localStorage (the PIN is never sent to the server); the PrivateKeyGate component shows a PIN prompt when PIN is enabled, with a "Use password instead" fallback. Settings page includes a PIN setup section (enable/disable) and device management (list/revoke remembered devices). See Section 2 (device fingerprint storage), Section 3 (PIN gate, remember-device checkbox), Section 4 (LoginWithDevice handler, device CRUD endpoints), Section 5 (access_secrets table). 

> **Revision 7** — Added mortgage rules with French/Italian amortization. New `mortgage` rule type: payload includes `mortgage_total_amount`, `mortgage_interest_rate`, `mortgage_term_months`, `mortgage_payment_day`, `mortgage_amortization_type`, `mortgage_remaining_balance` — all ECIES-encrypted with the server's X25519 public key. The Rule Scheduler computes the monthly payment using the amortization formula, creates ECIES-encrypted transactions with `interest_amount` field, updates the remaining balance in the payload, and re-encrypts it with the server's public key. The rule auto-deactivates when `remaining_balance <= 0`. Transaction cards and detail overlays display `interest_amount` separately from the principal. A new amortization type dropdown in the Rules form offers French (fixed payment) and Italian (decreasing payment) options with an info modal explaining the difference. See Section 2 (ECIES prefix routing for interest-bearing transactions), Section 3 (mortgage form, amortization modal, interest display), Section 4 (executeMortgage in RuleService), Section 5 (new mortgage fields in RulePayload).

> **Revision 6** — Added budget spending limits with E2E-encrypted payloads. Budget amounts, categories are ECIES-encrypted with the user's X25519 public key. Budget progress computed client-side; threshold notifications (50%/80%/100%) triggered via `POST /budgets/{id}/notify` which creates in-app notifications. Alert bell moved from sidebar/bottomnav to Header top-right icon-only button. Budgets nav link (PiggyBank icon) replaces Notifications in sidebar and bottomnav. See Section 2 (budget encryption), Section 3 (budget views, alert bell in header), Section 4 (`/v1/budgets/*` endpoints), Section 5 (`budgets` table).

> **Revision 5** — Added commission tracking, income rule type, and rule alert notifications. Key changes: `commission` field in transaction and rule payloads; `income` rule type (positive auto-generated transactions); `alert_offset INTERVAL` column on the `rules` table for pre-fire notifications; `RuleNotifier` background worker; frontend ECIES-prefix detection for rule-generated transactions (`"1|"` → decrypt with X25519 private key, fallback to AES-GCM with account key). See Section 2 (ECIES prefix routing), Section 3 (commission display, income type), Section 4 (RuleNotifier worker, alert_offset API), Section 5 (`alert_offset` + `last_alerted_at` columns).

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

- **Data Splitting:** Metadata required for database routing and time-series indexing (`transaction_id`, `account_id`, `timestamp`) remains in plain text. Sensitive payload data (`amount`, `category`, `notes`, `counterparty`, `commission`, `interest_amount`, `is_transfer`, `transfer_pair_id`, `transfer_source_account_id`, `transfer_target_account_id`) is encrypted. This means all financial aggregations (balances, charts) are computed client-side after decryption.
- **Encryption Pipeline:** `JSON Payload` → `Compress (LZ4)` → `Encrypt (AES-256-GCM)` → `Base64 Encode` (for JSON transport).
- **Key Management:** Users generate an **X25519** keypair upon registration (preferred over RSA for smaller key size, faster operations, and better modern security posture). Ed25519 is used for any signatures required in future.
  - The **Private Key** is symmetrically encrypted using the user's password via `Argon2id` (recommended parameters: `m=65536`, `t=3`, `p=4`) + `AES-256-GCM`, and stored server-side. It is only decrypted client-side during active sessions and **held in memory only** — never written to IndexedDB, localStorage, or any persistent client storage.
  - The **Public Key** is stored in plain text to facilitate secure account sharing.
- **Server Keypair:** The server generates an X25519 keypair on first startup. The **private key** is stored as a Docker secret (`server_encryption_key`) and is never exposed. The **public key** is served at `GET /api/v1/rules/public-key` (unauthenticated). Clients use this public key to encrypt rule payloads via ECIES, ensuring only the server can read rule details. Rule-generated transactions are similarly encrypted with the recipient user's X25519 public key (using the same ECIES format with a `1|` prefix to distinguish from account-key AES-GCM).
- **Trust Boundary Note:** Because the encrypted private key is stored on the server, a compromised server can attempt an offline dictionary attack against weak user passwords. Argon2id parameters above are chosen to make this computationally expensive. Users should be encouraged to use strong passwords.
- **Joint Accounts:** An AES-256 "Account Key" is generated for each account. To invite a user, the inviter fetches the invitee's Public Key, encrypts the Account Key with it via ECIES (X25519 + AES-GCM), and stores the result in the `account_users` table.
- **Invitation Flow (Accounts + Rules + Transactions):** Instead of requiring the inviter to fetch the invitee's public key upfront, the inviter can encrypt the account key (or rule/transaction payload) with the **server's X25519 public key** and submit it. The server stores this in the `invitations` table. When the invitee accepts, the server decrypts with its private key and re-encrypts with the invitee's public key. This allows inviting unregistered users (who don't have a keypair yet).
  - For account invitations: the inviter encrypts `{"account_key": "base64..."}` with the server's public key.
  - For user_transfer rule invitations: the sender creates the rule with `target_email`, the rule starts as `pending_accepted`. When the receiver accepts, they select an account. The chosen account ID is encrypted with the server's public key and stored on the rule as `target_account_encrypted`.
  - For send-to-user one-time transactions: the sender provides `target_email` and `server_encrypted_payload` (payload encrypted with the server's public key). The backend creates the expense transaction normally, then creates a pending `'transaction'` invitation storing the server-encrypted payload as `encrypted_data`. When the recipient accepts, they provide their chosen account ID encrypted with the server's public key. The server decrypts the stored payload, re-encrypts it with the recipient's X25519 public key, creates an income transaction in the recipient's account, and atomically updates the balance. See also Section 5, migration 0013.
- **ECIES Prefix Routing (Frontend):** When decrypting a transaction payload, the frontend checks the first two characters of `encrypted_payload`. If it starts with `"1|"`, the payload was encrypted via ECIES (X25519 + AES-GCM) using the user's X25519 public key (rule-generated transactions). The frontend decrypts it using the in-memory X25519 private key via `decryptECIESPayload`. Otherwise, the payload is an AES-GCM ciphertext encrypted with the account key, and the frontend decrypts it via `decryptTransactionPayload`. This distinction is invisible to the user.
- **Budget Encryption:** Budget payloads (`amount`, `category`) are encrypted with the user's own X25519 public key via the same ECIES scheme (`decryptECIESPayload`), since budgets are personal user settings (not shared account data). Budget metadata (`account_id`, `period`, `start_date`, `end_date`) remains in plaintext for server-side filtering. Progress is computed client-side by decrypting transactions and summing against the decrypted budget amount.
- **In-App Notifications:** The `notifications` table stores in-app messages. A notification badge in the header (top-right icon-only button) shows the unread count, polled every 30 seconds.
- **30-Day Expiry:** Pending invitations that are not accepted within 30 days are automatically expired. For rules, the rule is deleted. For accounts, just the invitation record is expired. The inviter receives both an in-app notification and an email.
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
- **Rules Management:**
  - Create/list/edit/delete automated rules for recurring payments and transfers.
  - Rule types: `payment` (recurring expense), `transfer` (between own accounts), `user_transfer` (cross-user), `income` (positive auto-generated income), `mortgage` (amortized loan payment).
  - Rule data is encrypted client-side with the server's X25519 public key before being sent to the API.
  - Scheduling fields (frequency, next_occurrence, alert_offset) are plaintext for server-side querying.
  - Generated transactions are encrypted with the target user's X25519 public key and stored with an ECIES `1|` prefix.
  - Commission field optional on all rule types (shown separately from the amount in transaction cards and detail overlays).
  - Mortgage-generated transactions include `interest_amount` field in the encrypted payload, shown separately from principal in transaction cards and detail overlays.
  - Mortgage form includes fields for total amount, interest rate, term (months), payment day (1-28), and amortization type (French/Italian). An info modal explains the difference between the two amortization methods.
  - Alert offset dropdown (1 hour, 2 hours, 12 hours, 1 day, 2 days, 1 week, 2 weeks) creates a pre-fire notification + email via the RuleNotifier worker.
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
  - **Rule Scheduler:** Polls the `rules` table for active rules where `next_occurrence <= NOW()`, decrypts the rule payload with the server's X25519 private key, checks preconditions (sufficient balance, matching currencies), and atomically creates transactions (encrypted with the user's X25519 public key via ECIES) and updates account balances. For `user_transfer` rules created via invitation, the target account is decrypted from `target_account_encrypted` and the target user is looked up from the invitation. For `mortgage` rules, the scheduler computes the monthly payment using the amortization formula (French fixed or Italian decreasing), creates a transaction with `interest_amount` in the payload, updates the remaining balance in the encrypted payload, and re-encrypts it with the server's public key. The rule auto-deactivates when `remaining_balance <= 0`. Configurable interval via `RULES_CHECK_INTERVAL` env var (default: 300 seconds).
  - **Rule Notifier:** Polls the `rules` table for active rules where `alert_offset IS NOT NULL` and `(next_occurrence - alert_offset) <= NOW()`. Sends an in-app notification and queues an email for each rule, then sets `last_alerted_at` to avoid duplicate alerts. Configurable interval via `RULES_CHECK_INTERVAL` env var (default: 300 seconds).
  - **Invitation Expiry:** Runs every 6 hours, checks the `invitations` table for pending invitations where `expires_at < NOW()`. For expired rule invitations, the rule is deleted. The invitation is marked `expired`, the inviter receives an in-app notification and an email via the email_outbox.

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
| **POST**   | `/api/v1/accounts/{id}/invite`      | Accounts | Invites a user by email. Body: `{ user_email, encrypted_account_key }` where encrypted_account_key is the account key encrypted with the server's X25519 public key. |
| **GET**    | `/api/v1/accounts/{id}/users`       | Accounts | Lists users belonging to a joint account.                                                                                                                        |
| **DELETE** | `/api/v1/accounts/{id}/users/{uid}` | Accounts | Removes a user from a joint account (revokes write access; see key-rotation limitation).                                                                         |
| **GET**    | `/api/v1/categories`                | Categories | Lists all categories for the authenticated user.                                                                                                                 |
| **POST**   | `/api/v1/categories`                | Categories | Creates a new category (body: `{ name, type }`).                                                                                                                 |
| **DELETE** | `/api/v1/categories/{id}`           | Categories | Deletes a category by its ID.                                                                                                                                    |
| **GET**    | `/api/v1/budgets`                                  | Budgets   | Lists all budgets for the authenticated user.                                                                                                                   |
| **POST**   | `/api/v1/budgets`                                  | Budgets   | Creates a new budget. Body: `{ account_id?, encrypted_payload, period, start_date, end_date? }`. `encrypted_payload` is ECIES with user's X25519 public key.   |
| **PUT**    | `/api/v1/budgets/{id}`                             | Budgets   | Updates a budget. Only the owner can update.                                                                                                                    |
| **DELETE** | `/api/v1/budgets/{id}`                             | Budgets   | Deletes a budget. Only the owner can delete.                                                                                                                    |
| **POST**   | `/api/v1/budgets/{id}/notify`                      | Budgets   | Marks a budget threshold as notified (50/80/100%). Body: `{ threshold }`. Creates in-app notification.                                                          |
| **GET**    | `/api/v1/accounts/{id}/transactions`               | Transactions | Lists transactions for an account.                                                                                                                             |
| **POST**   | `/api/v1/accounts/{id}/transactions`               | Transactions | Creates a new transaction. Body: `{ encrypted_payload, time, target_email?, server_encrypted_payload? }`. If `target_email` is set, the transaction is a "send to user" transfer — the expense is recorded and a `'transaction'` invitation is created for the recipient. `server_encrypted_payload` is required when `target_email` is set. |
| **PUT**    | `/api/v1/transactions/{id}`                        | Transactions | Updates an existing transaction. Only the owner can update.                                                                                                    |
| **DELETE** | `/api/v1/transactions/{id}`                        | Transactions | Soft-deletes a transaction.                                                                                                                                    |
| **POST**   | `/api/v1/transactions/{id}/documents`             | Documents | Uploads an encrypted document (receipt) for a transaction. Body: `{ encrypted_data, mime_type, file_name, file_size }`. Max 10 MB. |
| **GET**    | `/api/v1/transactions/{id}/documents`             | Documents | Lists document metadata for a transaction (no encrypted data).                                                                                                   |
| **GET**    | `/api/v1/transactions/{id}/documents/{docId}/data` | Documents | Returns a document's encrypted data (to be decrypted client-side with the account key).                                                                          |
| **DELETE** | `/api/v1/transactions/{id}/documents/{docId}`      | Documents | Deletes a document from a transaction.                                                                                                                           |
| **GET**    | `/api/v1/rules/public-key`                         | Rules     | Returns the server's X25519 public key (unauthenticated). Used by the frontend to encrypt rule payloads.                                                         |
| **GET**    | `/api/v1/rules`                                    | Rules     | Lists all rules for the authenticated user.                                                                                                                      |
| **POST**   | `/api/v1/rules`                                    | Rules     | Creates a new rule. Body: `{ name, encrypted_payload, frequency, next_occurrence, end_date?, max_occurrences?, target_email?, alert_offset? }`. `target_email` triggers pending_accepted flow for user_transfer rules. `alert_offset` is an INTERVAL string (e.g. `"1 hour"`, `"2 days"`) for pre-fire alert scheduling. |
| **PUT**    | `/api/v1/rules/{id}`                               | Rules     | Updates a rule. Only the owner can update.                                                                                                                       |
| **DELETE** | `/api/v1/rules/{id}`                               | Rules     | Deletes a rule. Only the owner can delete.                                                                                                                       |
| **GET**    | `/api/v1/notifications`                            | Notifications | Lists in-app notifications for the authenticated user.                                                                                                        |
| **GET**    | `/api/v1/notifications/count`                      | Notifications | Returns unread notification count.                                                                                                                            |
| **PUT**    | `/api/v1/notifications/{id}/read`                  | Notifications | Marks a notification as read.                                                                                                                                 |
| **GET**    | `/api/v1/invitations`                              | Invitations | Lists pending invitations for the authenticated user (by user ID or email).                                                                                   |
| **POST**   | `/api/v1/invitations/{id}/accept`                  | Invitations | Accepts a pending invitation. For rule and transaction invitations, body may contain `{ encrypted_account }` (receiver's chosen account ID encrypted with server's public key). For transaction invitations, the server decrypts the stored payload, re-encrypts it with the recipient's X25519 public key, creates an income transaction, and updates the balance. |
| **POST**   | `/api/v1/invitations/{id}/decline`                 | Invitations | Declines a pending invitation. Deletes the rule if it's a rule invitation.                                                                                    |
| **GET**    | `/api/v1/user/dump`                                | User Data   | Returns all user data as raw encrypted JSON (accounts, transactions, documents, categories, budgets, rules, notifications, invitations, savings plans, recurring transactions). |
| **POST**   | `/api/v1/user/restore`                             | User Data   | Accepts re-encrypted data, atomically clears existing data in a transaction, and inserts the provided data preserving original IDs. |
| **DELETE** | `/api/v1/user`                                     | User Data   | Soft-deletes personal accounts, removes user from joint accounts, deletes all other user data. Requires `{ "confirmation": "DELETE" }` body. Transactions sent to other users are preserved. |

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
    logger.InitLogger()
    defer logger.CloseLogger()

    ctx, cancel := context.WithCancel(context.Background())
    defer cancel()

    // ... database + redis connections ...

    recoverMw := routy.NewRecoverMiddleware(nil)
    loggingMw := routy.NewLoggingMiddleware(middleware.StructuredLogger)

    // --- Public routes (no auth) ---
    router := routy.NewRouter()
    router.
        AddMiddleware(recoverMw.GetMiddleware()).
        AddMiddleware(loggingMw.GetMiddleware()).
        AddHandler("POST /api/v1/auth/register",        handler.Register).
        AddHandler("POST /api/v1/auth/verify-otp",      handler.VerifyOTP).
        AddHandler("POST /api/v1/auth/login",            handler.Login).
        AddHandler("POST /api/v1/auth/login-verify-otp", handler.LoginVerifyOTP).
        AddHandler("GET  /api/v1/health",                handler.HealthCheck).
        AddHandler("GET  /api/v1/rules/public-key",      handler.RulePublicKey)

    // --- Protected routes (JWT + Redis blocklist) ---
    protected := routy.NewRouter()
    protected.
        AddMiddleware(middleware.JWTAuth).
        AddHandler("POST   /v1/auth/logout",               handler.Logout).
        AddHandler("GET    /v1/auth/keys",                 handler.GetKeys).
        AddHandler("GET    /v1/auth/me",                   handler.Me).
        AddHandler("PUT    /v1/auth/password",             handler.ChangePassword).
        AddHandler("GET    /v1/auth/preferences",           handler.GetPreferences).
        AddHandler("PUT    /v1/auth/preferences",           handler.UpdatePreferences).
        AddHandler("GET    /v1/users/lookup",              handler.LookupUser).
        AddHandler("GET    /v1/sync/pull",                 handler.SyncPull).
        AddHandler("POST   /v1/sync/push",                 handler.SyncPush).
        AddHandler("GET    /v1/accounts",                  handler.ListAccounts).
        AddHandler("POST   /v1/accounts",                  handler.CreateAccount).
        AddHandler("PUT    /v1/accounts/{id}",             handler.UpdateAccount).
        AddHandler("DELETE /v1/accounts/{id}",             handler.DeleteAccount).
        AddHandler("POST   /v1/accounts/{id}/invite",        handler.InviteToAccount).
        AddHandler("PUT    /v1/accounts/{id}/key",           handler.UpdateMyAccountKey).
        AddHandler("GET    /v1/accounts/{id}/users",         handler.ListAccountUsers).
        AddHandler("DELETE /v1/accounts/{id}/users/{uid}",   handler.RemoveAccountUser).
        AddHandler("GET    /v1/accounts/{id}/transactions",  handler.ListTransactions).
        AddHandler("POST   /v1/accounts/{id}/transactions",  handler.CreateTransaction).
        AddHandler("PUT    /v1/transactions/{id}",           handler.UpdateTransaction).
        AddHandler("DELETE /v1/transactions/{id}",           handler.DeleteTransaction).
        AddHandler("GET    /v1/categories",                  handler.ListCategories).
        AddHandler("POST   /v1/categories",                  handler.CreateCategory).
        AddHandler("DELETE /v1/categories/{id}",             handler.DeleteCategory).
        // Transaction documents
        AddHandler("POST   /v1/transactions/{id}/documents",                handler.UploadDocument).
        AddHandler("GET    /v1/transactions/{id}/documents",                handler.ListDocuments).
        AddHandler("GET    /v1/transactions/{id}/documents/{docId}/data",   handler.GetDocumentData).
        AddHandler("DELETE /v1/transactions/{id}/documents/{docId}",        handler.DeleteDocument).
        // Rules
        AddHandler("GET    /v1/rules",          handler.ListRules).
        AddHandler("POST   /v1/rules",          handler.CreateRule).
        AddHandler("PUT    /v1/rules/{id}",     handler.UpdateRule).
        AddHandler("DELETE /v1/rules/{id}",     handler.DeleteRule).
        // Notifications
        AddHandler("GET    /v1/notifications",          handler.ListNotifications).
        AddHandler("GET    /v1/notifications/count",    handler.CountUnreadNotifications).
        AddHandler("PUT    /v1/notifications/{id}/read", handler.MarkNotificationRead).
        // Invitations
        AddHandler("GET    /v1/invitations",              handler.ListPendingInvitations).
        AddHandler("POST   /v1/invitations/{id}/accept",  handler.AcceptInvitation).
        AddHandler("POST   /v1/invitations/{id}/decline", handler.DeclineInvitation)

    router.AddSubroute("/api/", protected.Finalize())
    final := router.Finalize()

    // --- Background workers ---
    go worker.NewEmailDispatcher().Run(ctx)
    go worker.NewSavingsCron().Run(ctx)
    go worker.NewSyncCleanup().Run(ctx)
    go worker.NewRuleScheduler().Run(ctx)
    go worker.NewInvitationExpiryWorker().Run(ctx)
    go worker.NewRuleNotifier().Run(ctx)

    server := &http.Server{
        Addr:    ":8080",
        Handler: final,
        // ... timeouts ...
    }
    // ... graceful shutdown ...
    http.ListenAndServe(":8080", server)
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
-- Encrypted payload contains: amount, category, notes, counterparty, commission, interest_amount (mortgage).
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
-- BUDGETS
-- Tracks per-account and per-category spending limits.
-- encrypted_payload contains: amount, category (ECIES with user's X25519 public key).
-- Metadata (account_id, period) is plaintext for server-side querying.
-- Progress is computed client-side; threshold notifications are
-- stored via last_notified_X flags to prevent duplicates.
-- ============================================================
CREATE TABLE budgets (
    id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id         UUID REFERENCES accounts(id) ON DELETE CASCADE, -- NULL = global budget (all accounts)
    encrypted_payload  TEXT NOT NULL,                                   -- ECIES with user's X25519 public key
    period             VARCHAR(10) NOT NULL CHECK (period IN ('monthly', 'yearly')),
    start_date         DATE NOT NULL,
    end_date           DATE,
    last_notified_50   TIMESTAMPTZ,                                     -- when 50% threshold was last notified
    last_notified_80   TIMESTAMPTZ,                                     -- when 80% threshold was last notified
    last_notified_100  TIMESTAMPTZ,                                     -- when 100% threshold was last notified
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- RULES (Automated payments and transfers)
-- Encrypted payload is ECIES with the server's X25519 public key.
-- Scheduling metadata (frequency, next_occurrence) is plaintext
-- for the Rule Scheduler worker to query without decryption.
-- ============================================================
CREATE TABLE rules (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_by           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name                 VARCHAR(255) NOT NULL,                -- plaintext display label
    encrypted_payload    TEXT NOT NULL,                         -- ECIES with server's public key
    frequency            VARCHAR(20) NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly', 'yearly')),
    next_occurrence      TIMESTAMPTZ NOT NULL,
    end_date             TIMESTAMPTZ,                           -- optional end date
    max_occurrences      INT,                                   -- optional max executions
    occurrences_so_far   INT NOT NULL DEFAULT 0,
    last_triggered_at    TIMESTAMPTZ,                           -- when it last fired
    is_active            BOOLEAN NOT NULL DEFAULT TRUE,
    alert_offset         INTERVAL,                              -- added in 0009; pre-fire alert window (e.g. '1 hour', '2 days')
    last_alerted_at      TIMESTAMPTZ,                           -- added in 0009; prevents duplicate alerts
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
-- NOTIFICATIONS
-- In-app notification panel for invitations and updates.
-- ============================================================
CREATE TABLE notifications (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type       VARCHAR(50) NOT NULL,
    title      TEXT NOT NULL,
    body       TEXT NOT NULL,
    data       JSONB,
    is_read    BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INVITATIONS
-- Generic polymorphic invitations for rules and accounts.
-- encrypted_data stores the account key (for account invites)
-- encrypted with the server's X25519 public key.
-- ============================================================
CREATE TABLE invitations (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type     VARCHAR(20) NOT NULL CHECK (entity_type IN ('rule', 'account')),
    entity_id       UUID NOT NULL,
    invited_by      UUID NOT NULL REFERENCES users(id),
    invited_email   VARCHAR(255) NOT NULL,
    invited_user_id UUID REFERENCES users(id),
    encrypted_data  TEXT,
    status          VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    expires_at      TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 days'
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

-- Budgets
CREATE INDEX ON user_categories (user_id);

-- Rules scheduling
CREATE INDEX ON rules (next_occurrence) WHERE is_active = TRUE;

-- Notifications
CREATE INDEX ON notifications (user_id, created_at DESC);
CREATE INDEX ON notifications (user_id, is_read) WHERE is_read = FALSE;

-- Invitations
CREATE INDEX ON invitations (invited_user_id, status) WHERE status = 'pending';
CREATE INDEX ON invitations (status, expires_at) WHERE status = 'pending';
CREATE INDEX ON invitations (entity_type, entity_id);
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
      - server_encryption_key
    environment:
      - DB_HOST=postgres
      - DB_USER=budgeteer
      - DB_NAME=budgeteer
      - REDIS_HOST=redis
      - RULES_CHECK_INTERVAL=300
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
  server_encryption_key:
    file: ./secrets/server_encryption_key.txt
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
