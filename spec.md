# Performance: Monthly Balance Checkpointing

> Status: design spec for a smaller agent to implement on the `perf/checkpointing`
> branch (already created from `develop`). Every decision below is final and must
> be followed; ambiguous edges are called out explicitly under "Open questions"
> at the bottom.

## 1. Problem

Budgeteer is E2E-encrypted, so the server never reads amounts. Today the frontend
must download **every** transaction for an account on app open to compute balances
and the dashboard's pre-window opening balance (an `O(n)` scan in
`DashboardPage.tsx` / `AccountDetailPage.tsx`). For accounts with many
transactions this is slow on every launch.

We introduce **monthly balance checkpoints** — an encrypted prefix-sum, one row
per account per calendar month — plus moving the **opening balance** out of a
special transaction and into encrypted account metadata. The dashboard then
derives "opening balance before the selected window" from a single checkpoint
plus the in-month transactions, instead of scanning the whole history.

## 2. Data model

### 2.1 Plain-text routing (server-readable), encrypted value (client-only)

Checkpoint **metadata** (`account_id`, `checkpoint_month`) stays plaintext so the
server can filter/index; the **balance value** is encrypted with the account key
(joint members share this key) and is only ever read/written by the frontend.

### 2.2 Database migration — `backend/src/migrations/0019_add_checkpoints.sql`

> Note: migrations `0001`–`0016` and `0018` exist (`0017` is skipped). Use
> `0019`. `0007` already added a plaintext `accounts.balance BIGINT` column used
> **only** by the rule scheduler for precondition checks — do **not** remove or
> modify it; it is independent of this work.

```sql
-- Encrypted account-level metadata (opening balance, future fields).
-- Encrypted with the account key (X25519-derived AES-256-GCM, same ECIES format
-- used for account keys in account_users.encrypted_account_key). Decryptable by
-- every joint member. NULL for accounts not yet migrated.
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS encrypted_metadata TEXT;

-- Monthly balance checkpoints (one row per account per month).
-- checkpoint_month = the LAST UTC day of the month, DATE type (e.g. 2025-07-31).
CREATE TABLE IF NOT EXISTS transactions_checkpoints (
    account_id        UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    checkpoint_month  DATE NOT NULL,
    encrypted_balance TEXT NOT NULL,   -- ECIES with account key; JSON {balance, tx_count}
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (account_id, checkpoint_month)
);

CREATE INDEX IF NOT EXISTS idx_checkpoints_account_month
    ON transactions_checkpoints (account_id, checkpoint_month DESC);
```

`checkpoint_month` semantics: it represents the balance **through the end of**
that month. A checkpoint whose month === the current month is a **live**
checkpoint — kept continuously updated by the frontend (it is the running balance,
see §4.3). Checkpoints for **closed** past months are immutable historical
snapshots (only changed when a transaction in that month is edited/deleted, or by
documented propagation rules).

The encrypted balance JSON is:
```json
{ "balance": 12345.67, "tx_count": 42 }
```
- `balance` is a JSON number (float, 2-dp), computed as
  `opening_balance + Σ effectiveAmount(tx) for all non-deleted tx with
  time <= end of this month` (effectiveAmount = `amount - (commission ?? 0)`,
  same helper used everywhere today in `frontend/src/lib/crypto-transaction.ts`).
  Storing as a float matches existing frontend arithmetic; a full recompute
  (§5.3) is the source of truth and resets any drift.
- `tx_count` is the count of non-deleted transactions for the account whose
  month-of-time is <= this checkpoint's month. Used by the staleness check (§5.4).

### 2.3 Month bucketing — UTC

Bucket a transaction into a month by the **UTC date** of its `time`
(`new Date(tx.time).getUTCFullYear()/getUTCMonth()`). Checkpoint month-end =
last UTC day of that month (e.g. `2025-02-28`). This is deterministic and
identical on every device; it can cause a late-evening local transaction to land
in the next UTC month, which is acceptable and consistent. Do **not** use a user
preference timezone.

### 2.4 Opening balance — encrypted account metadata

The opening balance ceases to be a transaction. It lives in
`accounts.encrypted_metadata`, an encrypted JSON blob:
```json
{ "opening_balance_cents": 150000 }
```
Stored in integer cents to avoid float issues for this single base value (the
frontend converts to/from float when computing checkpoint base). Encrypted with
the account key, written by the account owner when editing the account. Read by
any joint member (shared key).

## 3. Backend changes

All in Go under `backend/src/internal/`. Add model structs in
`internal/model/`, repos in `internal/repository/`, services in
`internal/service/`, handlers in `internal/handler/`, and wire routes in
`backend/src/cmd/budgeteer-backend/main.go` (protected subrouter).

### 3.1 Account model / endpoints

- Extend `model.Account` with `EncryptedMetadata *string` (nullable). Update
  `account_repository.go` `Scan`/`Create`/`Update`/`ListByUserID`/`FindByID`
  and the `users`-join in `user_data_repository.go` to select/insert the column.
- `PUT /api/v1/accounts/{id}` (`UpdateAccount` handler/service): accept an
  optional `encrypted_metadata` field in the request body. Only the **owner**
  may set it (existing role check applies). The handler must pass it through
  verbatim (no decrypt). When omitted, leave the existing value unchanged.
- `GET /api/v1/accounts` and `ListByUserID`: now return `encrypted_metadata`.

### 3.2 Checkpoint endpoints (new)

- `GET /api/v1/accounts/{id}/checkpoints`
  Query params (optional): `from` and `to` (ISO dates, inclusive). Returns the
  checkpoint rows for that account within `[from, to]` (or all if omitted),
  ascending by `checkpoint_month`. Requires account access (reuse the
  account-access check used by `ListTransactions`: `AccountUserRepo.FindByAccountAndUser`).
- `PUT /api/v1/accounts/{id}/checkpoints` — **bulk upsert**. Body:
  `{ "checkpoints": [ { "checkpoint_month": "2025-07-31", "encrypted_balance": "..." } ] }`.
  Upsert each row (`ON CONFLICT (account_id, checkpoint_month) DO UPDATE SET
  encrypted_balance = EXCLUDED.encrypted_balance, updated_at = NOW()`). Max 400
  rows per request. Requires account access (owner or member). Returns
  `{ "status": "ok" }`.
  > A single bulk upsert is required because one transaction edit can touch many
  > months (propagation), and per-row PUTs would be too chatty.

### 3.3 Staleness verification endpoint (new)

- `POST /api/v1/accounts/{id}/checkpoints/verify`
  Body: `{ "months": [ "2025-07-31", "2025-06-30", ... ] }` (the month-ends the
  frontend currently has checkpoints for). Returns:
  `{ "counts": [ { "checkpoint_month": "2025-07-31", "tx_count": 42 }, ... ] }`
  where `tx_count` = `COUNT(*) FROM transactions WHERE account_id = $1 AND
  deleted_at IS NULL AND date_trunc('month', time AT TIME ZONE 'UTC') <=
  date_trunc('month', $month::date)`. This is a **plain-text** count (`time` and
  `account_id` are already plain text per AGENTS §2), so no decryption is needed.
  Requires account access. The frontend compares each returned `tx_count` to the
  `tx_count` it stored inside that checkpoint's encrypted blob (§5.4).

### 3.4 Transaction list with date filter

Extend the existing `GET /api/v1/accounts/{id}/transactions` handler
(`handler/transactions.go`) to accept optional `from` and `to` query params (ISO
timestamps). When provided, filter `time >= from AND time <= to` in the repo
`ListByAccountID` (add params; keep backward compatibility with `limit`/`offset`
and pagination). The frontend uses this to download only the months overlapping
the active window (§5.2).

### 3.5 sync_queue propagation

Extend `sync_service.go` so the frontend can push checkpoint and
account-metadata updates to joint members. Concretely, in `POST /api/v1/sync/push`
accept `SyncOperation` entries with new `entity_type` values:
- `"checkpoint"` — `action` `INSERT`/`UPDATE`, `encrypted_payload` = the
  checkpoint's `encrypted_balance`, plus the affected `checkpoint_month` carried
  in the existing plaintext fields (extend `SyncOperation`/`SyncQueueItem` with an
  optional `checkpoint_month` field, or pack the month into the existing
  `account_id`-style routing field — agent chooses, but it must be plain text so
  the sync fan-out lookup works without decryption).
- `"account_metadata"` — `action` `UPDATE`, `encrypted_payload` = the
  `encrypted_metadata` blob; route to all other account members.

The server fan-out logic that already iterates `AccountUserRepo.ListByAccount`
must be generalised: for checkpoint/account_metadata ops, the "account" to fan
out to is the one owning the entity (derive from the op's account id). Keep the
existing transaction INSERT/DELETE behaviour unchanged.

> Checkpoint sync entries can be marked consumed by the existing pull endpoint
> as they are today for transactions (no new consumption path is required — the
> frontend applies the diff and discards; it does **not** persist the propagated
> blob as a new row, it upserts via §3.2 after applying).

Important nuance: a **received** propagated checkpoint is applied by overwriting
the local checkpoint row with the incoming blob only if its `updated_at` is newer
(LWW). The frontend stores the last-known `updated_at` per checkpoint from the
pull payload. (Add `updated_at` to the `SyncQueueItem` payload carried for these
entity types, or accept the simpler rule: "incoming always wins" — agent should
pick LWW to avoid clobbering.)

## 4. Frontend changes

Frontend lives in `frontend/src/`. Tech: Vite + React + TS + Zustand.

### 4.1 Checkpoint crypto/store

- New `frontend/src/lib/crypto-transaction.ts` exports — add checkpoint
  encrypt/decrypt helpers (the checkpoint blob uses the **account-key** AES-GCM
  format, the same as account-key-encrypted transactions, so use
  `encryptTransactionPayload`/`decryptTransactionPayload` on the JSON
  `{"balance":..., "tx_count":...}`). Do **not** use the ECIES `1|` format.
- New `frontend/src/stores/checkpoint-store.ts` (Zustand): holds `checkpoints:
  Record<accountId, CheckpointRow[]>`, with actions `loadCheckpoints(accountId,
  from?, to?)`, `upsertMany(accountId, rows)` (calls the bulk PUT), and a selector
  `balanceThrough(accountId, monthEnd)`.

### 4.2 Open-balance-as-account-metadata

- New helper `frontend/src/lib/account-metadata.ts`:
  `encryptAccountMetadata({opening_balance_cents}, accountKey)` /
  `decryptAccountMetadata(blob, accountKey)`.
- `stores/account-store.ts` `updateAccount`: add an optional
  `encryptedMetadata` param; when provided, include `encrypted_metadata` in the
  PUT body.
- Account creation (`AccountListPage.tsx` create flow): the opening balance
  entered in the form is now written to `encrypted_metadata` (via
  `updateAccount` after `createAccount` returns and the account key is
  available), **not** as a transaction. No `time: "1970-01-01"` transaction is
  created anymore.
- Editing opening balance (`AccountDetailPage.tsx` "Edit Account" dialog and the
  separate "Edit Opening Balance" dialog, both recently touched by the
  `fix/opening-balance` and `fix/locale` work): editing opening balance now
  writes `encrypted_metadata` and recomputes all checkpoints by adding the
  **delta** between new and old opening balance to every existing checkpoint's
  `balance` (then re-encrypts and bulk-PUTs). No "Opening Balance" transaction
  is created or touched.

### 4.3 The live current-month checkpoint

The checkpoint for the **current** calendar month is kept up to date on every
add/edit/delete of a transaction in that month: it equals
`opening_balance + Σ effectiveAmount over all tx through "end of current month"`,
i.e. the running balance. On app open, the *current* balance is simply this
checkpoint's `balance` (no full download needed). Define a constant rule:

> "the frontend always maintains a checkpoint for the current month, even if the
> month is open, and updates it whenever transactions in that month change."

Reviewing the user's clarification: this current-month checkpoint **is** the
actual updated balance, so the app does not need an arbitrary "last N months"
download. It only needs: checkpoints covering the active window (closed months)
+ the current-month checkpoint + the transactions overlapping the active window
(§5.2).

### 4.4 Update-on-transaction-change (propagation rule)

Whenever the frontend adds / edits / deletes / accepts (send-to-user) a
transaction dated in month `M` for account `A`:

1. Identify every checkpoint month from `M` through the current month
   (inclusive) for `A`. If `M` is in the future (no checkpoints yet), only
   rebuild `M` if it equals the current month; future months have no
   checkpoints.
2. Recompute each affected checkpoint's `balance` by re-summing: for the earliest
   affected month `M`, recompute `tx_count` and `balance` as
   `opening_balance + Σ effectiveAmount(lastCheckpointBefore(M) ... end of M)`.
   For `M+1 .. current`, recompute as `balance(M-) + Σ effectiveAmount(M ...)`.
   (Equivalently, and recommended: recompute the earliest affected month, then
   derive subsequent ones by adding that month's delta to the chain. Either is
   correct; keep it simple and obviously-correct.)
3. Bulk-PUT the affected checkpoints via the §3.2 endpoint.
4. For **transfers** (`is_transfer`), both legs live in different accounts →
   run §4.4 for **both** accounts.
5. For **send-to-user** acceptance (recipient side), run §4.4 for the recipient's
   account.

Centralise this in one helper, e.g. `frontend/src/lib/checkpoint-recompute.ts`:
`async function recomputeFrom(accountId, fromMonthEnd, { full })` and
`async function applyCheckpointUpdateAfterTxChange(accountId, txMonth)`.

### 4.5 RangeSum for the dashboard pre-window opening balance (the perf win)

Use prefix-sum differencing **only** where the spec said to: replace the
`O(n)` "sum all transactions before the window" loop in
`DashboardPage.tsx` (`balanceChartData` IIFE) and the equivalent in
`AccountDetailPage.tsx` with:

> window-start opening balance =
>   `balanceThrough(accountId, lastMonthEndBefore(windowStart))`
>   + `Σ effectiveAmount(tx) for tx whose month == monthOf(windowStart) and
>     tx.date < windowStart`

i.e. one checkpoint read + a sum over at most the current opening partial month.
The transactions downloaded in §5.2 already include that partial month, so no
extra fetch. Do **not** introduce RangeSum anywhere else (per user decision).

## 5. App-open flow & reconciliation

### 5.1 On app open (per accessible account)

1. Ensure the account key is available (`decrypt-transactions.ts getAccountKey`).
2. Load checkpoints: `GET /accounts/{id}/checkpoints` (closed months covering the
   active window + the current month). Also decrypt `encrypted_metadata` for the
   opening balance.
3. **Staleness check** (§5.4): verify checkpoints vs server tx counts; recompute
   if needed.
4. Render current balance from the current-month checkpoint immediately.

### 5.2 Transaction download

Download only the transactions for the months overlapping the **active
date-range window** (`useDateRangeStore` range, default last 30 days → spans 1–2
months) plus the partial month they begin in (so the §4.5 partial-month sum works),
via the extended `GET /accounts/{id}/transactions?from=...&to=...`. When the
user shifts the window to months not yet downloaded, fetch those months on demand
(checkpoints first, then filtered transactions). Keep the existing pagination
loop pattern (200/page) from `decrypt-transactions.ts` for the chosen range.

### 5.3 Software-fail / restore-missing (reconciliation)

Triggered by §5.4. **Scope (user decision: from-first-missing):** find the
earliest checkpoint month that is missing **or** whose `tx_count` mismatches,
call it `F`. Recompute from `F` forward:
1. Download **all** transactions for the account with `time < end of F`**only
   for the seed** (to get the true sum into `F`-1), then all transactions from
   `F` through the current month. (Simplification allowed: to avoid the seed
   download, use the prior non-stale checkpoint (`F`-1 month) as the base — only
   recompute `F` and later. This is correct **provided** `F`-1 is itself
   verified-non-stale; if `F` is the earliest checkpoint month, fall back to a
   full download for the seed. Agent: implement the "use prior verified
   checkpoint as base, else full seed download" variant.)
2. Rebuild contiguous checkpoints for `F..current`, upserting via §3.2.

### 5.4 Staleness check (catches server-side rule fires)

Rule Scheduler creates transactions **server-side** without the frontend, and
the server cannot decrypt them (they are encrypted with the user's X25519 public
key). Therefore a closed-month checkpoint can be silently invalidated when a rule
fires a transaction dated in/before that closed month. Detection:

- POST `/accounts/{id}/checkpoints/verify` with the `checkpoint_month` list you
  have (§3.3). For each response `tx_count`, compare to the `tx_count` stored
  inside the **encrypted** checkpoint blob you decrypted. Any mismatch (or any
  missing month between the first checkpoint month and the current month) → run
  §5.3 from the first offending month.

Cost: one round trip per account; the server count is over plain-text columns
only.

## 6. Frontend migration (client-side, per user)

Use the existing pending-migrations mechanism
(`frontend/src/stores/migration-store.ts`, `backend/src/migrations/0015` + the
`pending_migrations` table). New migration key:
`build_checkpoints_and_move_opening_balance`, seeded `pending` for all existing
users in the DB migration (§2.0-seed below).

Runner `migrateBuildCheckpointsAndMoveOpeningBalance(userId)`:

For each account the user has the key for (mirror the `add_category_id` runner's
account loop and 200/page transaction pagination):

1. Download **all** transactions (paginated, AES-GCM and `1|` ECIES both
   decrypted, exactly like the existing runner).
2. Identify transactions whose decrypted payload has `category === "Opening
   Balance"` (NB: some old payloads may now only have `category_id`; the
   `add_category_id` migration excluded Opening Balance from `category` removal,
   so Opening Balance payloads still carry `category === "Opening Balance"` —
   rely on that). Sum their `effectiveAmount` → `opening_balance_cents` (× 100,
   signed).
3. **Soft-delete** each of those Opening Balance transactions via
   `DELETE /api/v1/transactions/{id}` (so they no longer contribute to future
   checkpoints).
4. Write `encrypted_metadata = encryptAccountMetadata({opening_balance_cents})`
   for the account via `PUT /api/v1/accounts/{id}`.
5. Build contiguous monthly checkpoints from the account's **first transaction
   month** (after removing OB) through the **current month**, even for empty
   months (so RangeSum across gaps works). For each month:
   `balance = opening_balance_cents/100 + Σ effectiveAmount(tx) with
   txMonth <= month`; `tx_count = count(tx with txMonth <= month)`.
   Encrypt each with the account key.
6. Bulk-PUT all checkpoints via §3.2 (`PUT /accounts/{id}/checkpoints`).
7. On any error, do NOT mark complete; the migration infra already marks
   `failed` and keeps it pending for retry. Make the whole runner idempotent
   (re-running after a partial success re-sums from the then-current state).

Seed SQL (append to `0019_add_checkpoints.sql`):
```sql
INSERT INTO pending_migrations (user_id, migration_key, status)
SELECT id, 'build_checkpoints_and_move_opening_balance', 'pending'
FROM users
ON CONFLICT (user_id, migration_key) DO NOTHING;
```

## 7. Ripple changes from removing the Opening Balance transaction

The string `"Opening Balance"` and the epoch-`time` OB transaction are referenced
in many places. After migration they must stop appearing. Tasks:

- `frontend/src/pages/dashboard/DashboardPage.tsx`: remove OB exclusions from the
  income/expense/category-filters and counters (the `category !== "Opening
  Balance"` guards). Balances now come from checkpoints + metadata.
- `frontend/src/pages/accounts/AccountDetailPage.tsx`: same OB-related filters;
  the Opening Balance edit UI now edits metadata (§4.2), and its computed
  `openingBalance` reads from decrypted metadata instead of summing OB
  transactions.
- `frontend/src/stores/migration-store.ts`: existing `add_category_id` runner's
  `if (payload.category === "Opening Balance") continue;` guard is now
  technically obsolete but **leave it** (harmless; defends against un-migrated
  accounts during a staggered rollout).
- `frontend/src/lib/decrypt-transactions.ts` & `crypto-transaction.ts`: no OB
  special-casing exists here; ensure the new paginated + date-filtered fetch path
  still works.
- `backend/src/migrations/0007_add_rules.sql` plaintext `balance` column:
  unchanged (rule preconditions only).
- Data management (`frontend/src/lib/data-management.ts`,
  `backend/.../user_data_repository.go` dump/restore): include
  `transactions_checkpoints` rows and `accounts.encrypted_metadata` in both dump
  and restore, preserving IDs. Add them to the `UserDump` model.

## 8. Testing requirements (per AGENTS §7)

- **Backend unit/integration (testcontainers):** checkpoint endpoints happy +
  access-denied; verify counts correct across month boundaries; bulk upsert
  conflict behaviour; sync push fan-out of checkpoint/metadata to joint members;
  transactions `from/to` filter.
- **Frontend unit (Vitest):** `parseLocaleNumber`-style round-trips aside — test
  the new crypto-checkpoint helpers (encrypt → decrypt round trip), the
  month-bucketing function (UTC), the propagation recompute (edit a Jan tx updates
  Jan→current checkpoints), and the staleness diff logic (mismatch → recompute
  scope).
- **Frontend component/E2E:** editing opening balance updates metadata and shifts
  checkpoints; the dashboard pre-window opening balance matches the old
  full-scan result before and after migration.
- **Migration:** integration test of the client runner against a fresh schema
  with a synthetic account that has an OB transaction + several months of txs,
  asserting OB is removed, metadata set, checkpoints contiguous and correct.

Do not delete or disable existing tests to make the suite pass.

## 9. Open questions (ask before/while implementing)

1. **New accounts after rollout** have no transactions and no checkpoints until
   the user adds the first transaction. Until then, opening balance lives in
   metadata and balance = opening balance (no checkpoint row). Confirm: do we
   create a current-month checkpoint with `tx_count:0` on account creation, or
   only on first transaction? Spec assumes: create on first transaction add
   (§4.4), and treat "no checkpoint row" as balance = metadata opening balance.
   Implement that; flag if a simpler "always create empty current-month
   checkpoint at creation" is preferred.
2. **Float vs cents in the encrypted `balance`:** spec stores a float
   (consistency with `effectiveAmount`). If the agent prefers, store integer
   cents and convert at display time — both are acceptable; pick one and stay
   consistent, and document it in the `checkpoint-store` JSDoc.
3. **LWW for propagated checkpoints:** confirm whether incoming-synced
   checkpoints use `updated_at` LWW or "incoming always wins" (§3.5). Prefer
   LWW.
4. **Verify round trip batch limit:** a user with years of history has many
   checkpoint months; the `/verify` and `/checkpoints` calls return all of them.
   Add `from/to` filtering to `/verify` too if this becomes large; for now the
   agent may cap the request to 36 months back and page. Confirm acceptable.