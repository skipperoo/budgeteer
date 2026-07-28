# Performance: Monthly Balance Checkpointing — Remaining Work (specs2)

> Companion to `/spec.md`. The bulk of the implementation is **done** on
> `perf/checkpointing` (8 commits, backend + frontend build clean, 183 tests
> pass). This file lists the **verified remaining gaps** so a resume can pick
> up exactly where it stopped. Each item has exact file:line refs and a
> prescriptive fix.

## State as of pausing

8 commits on `perf/checkpointing` ahead of `develop`:

```
4d29d4b perf(checkpoints): include checkpoints + encrypted_metadata in dump/restore
e2c17d2 perf(checkpoints): rewire dashboard + account-detail to use checkpoints, OB->metadata
2186a56 perf(checkpoints): account-store updateAccount supports encrypted_metadata
46e459d perf(checkpoints): migration runner — build checkpoints, move OB to metadata
cfd3801 perf(checkpoints): recompute engine + propagation verifier
5aa0a8e perf(checkpoints): frontend infra — types, crypto helpers, checkpoint store, tests
159fe92 perf(checkpoints): backend — checkpoints table, endpoints, OB metadata, sync fan-out
14f6f98 spec(perf): add detailed monthly-checkpointing spec for contract agent
```

Done: backend migration 0019 + model/repo/service/handler + routes; tx `from/to`
filter; sync **push** fan-out for `checkpoint`/`account_metadata`; frontend
crypto + checkpoint store + recompute engine + migration runner; dashboard &
account-detail rewired to consume checkpoints; OB moved to `encrypted_metadata`
on account creation + edit; dump/restore round-trips metadata + checkpoints.

---

## Remaining gaps (in priority order)

### Gap 1 — CRITICAL: sync PULL receive-side isn't wired (joint-account checkpoints never arrive)

**Problem.** The backend now fans checkpoint/account_metadata updates out to
joint members via `sync_queue` (sync_service.go `Push` + the new
`checkpoint_month`/`source_updated_at` columns). But the frontend
`sync-store.ts pull()` **only stashes items in state** — it never *applies*
them. The checkpoint store already exposes `applyRemote(accountId, entry)`
(LWW by `updated_at`) but **nothing calls it**. So when member B edits a
transaction in a joint account, member A's checkpoints never update on pull.

`frontend/src/stores/sync-store.ts` (entire file is ~45 lines) — the `pull`
action must, after fetching items, iterate them and dispatch by `entity_type`:

```ts
// inside pull(), after set({items: ...}):
await applySyncedItems(res.items);
```

Where `applySyncedItems` (new helper, e.g. in `sync-store.ts` or
`frontend/src/lib/sync-apply.ts`) does:

- `entity_type === "checkpoint"`: build a `CheckpointEntry` from the item
  (`encrypted_payload` -> `encrypted_balance`, `checkpoint_month`,
  `source_updated_at` -> `updated_at`, blob stays null — **do not decrypt on
  the sync path**; instead mark the local entry stale so a later
  `loadCheckpoints`/verify reconciles, OR decrypt with the account key if
  available and call `useCheckpointStore.getState().applyRemote(accountId,
  entry)`). Simplest correct: call `applyRemote` with the raw encrypted
  blob (blob=null) and then trigger `loadCheckpoints(accountId)` to
  re-fetch+decrypt the canonical server row. LWW handled server-side by
  `updated_at`; the `applyRemote` LWW check uses `source_updated_at`.
- `entity_type === "account_metadata"`: the `encrypted_payload` is the new
  `encrypted_metadata` blob. Update `useAccountStore`'s `accounts` entry for
  `account_id` so `account.encrypted_metadata` reflects it (the member can
  decrypt it with the shared account key on next account-detail open).

Files:
- `frontend/src/stores/sync-store.ts` — add the apply loop.
- `frontend/src/stores/checkpoint-store.ts` — `applyRemote` already exists
  (revision `d` commit); confirm it accepts `blob: null` entries and that a
  subsequent `loadCheckpoints` overwrites them with decrypted blobs.
- `frontend/src/types/index.ts` — `SyncQueueItem` already has
  `checkpoint_month` + `source_updated_at` (added in Phase 2).

Test: `frontend/src/stores/sync-store.checkpoint.test.ts` (new) — push a
synced checkpoint item, assert `applyRemote` called with LWW (older
`source_updated_at` does not overwrite newer local).

### Gap 2 — CRITICAL: new-account bootstrap doesn't create the first checkpoint

**Problem.** Q1 resolution (spec §9): "create the current-month checkpoint on
first transaction add (§4.4)". But
`frontend/src/lib/checkpoint-recompute.ts` `applyCheckpointUpdateAfterTxChange`
short-circuits when there are no checkpoints yet:

```ts
const entries = useCheckpointStore.getState().getEntries(accountId);
if (entries.length === 0) return; // nothing to propagate yet   <-- never bootstraps
```

So a brand-new account (created after rollout) that gets its first transaction
**never gets a checkpoint**. Its balance = metadata opening balance forever
(until the migration is somehow re-run, which it isn't for new users). Worse,
`verifyCheckpoints` returns `{stale:[], missing:[]}` when there are zero
entries, so staleness won't even detect it.

**Fix.** In `applyCheckpointUpdateAfterTxChange`, when `entries.length === 0`,
bootstrap instead of returning: read the account's `encrypted_metadata` opening
balance (decrypt with the account key) and call `recomputeFrom(accountId,
txMonthEnd, { seedOpeningBalance: metadataOB })`. `recomputeFrom` with no prior
verified checkpoint does a full-history seed download — fine here because
there's only the one (or few) new transactions.

Files:
- `frontend/src/lib/checkpoint-recompute.ts` — `applyCheckpointUpdateAfterTxChange`.
- Needs the account key + the account's `encrypted_metadata`: get the account
  from `useAccountStore.getState().accounts.find(a => a.id === accountId)`,
  decrypt metadata via `decryptAccountMetadata(blob, accountKey)`.
- Add a unit test in `checkpoint-recompute.test.ts` is hard (network); instead
  add an integration-style test that mocks `useCheckpointStore` empty +
  asserts `recomputeFrom` is called. Or simpler: extract the bootstrap
  decision into a tiny pure predicate and test that.

### Gap 3 — High: AccountListPage balances still download ALL transactions

**Problem.** `frontend/src/pages/accounts/AccountListPage.tsx` `fetchBalances`
(lines ~50-78) still calls `fetchAndDecryptTransactions(acc.id, ...)` per
account and sums all transactions to show the per-account balance on the
accounts **list** page. This is the exact O(n)-per-account launch cost the
checkpointing work is meant to eliminate, and it's the first screen users see
post-login. After migration, the balance = the live current-month checkpoint.

**Fix.** Replace the per-account full-download with:
1. `await useCheckpointStore.getState().loadCheckpoints(acc.id)` for each
   account (in parallel).
2. `newBalances[acc.id] =
   useCheckpointStore.getState().balanceThrough(acc.id, currentMonthEnd()) ?? 0`.
3. For accounts with NO checkpoint yet (un-migrated or new-user-before-first-tx
   with an opening balance), fall back to decrypting `encrypted_metadata`
   opening balance (not a full tx download). Only as a last resort (no
   metadata, no checkpoints) fall back to the old `fetchAndDecryptTransactions`
   sum.

Files:
- `frontend/src/pages/accounts/AccountListPage.tsx` — `fetchBalances`.
- import `useCheckpointStore`, `currentMonthEnd`, `decryptAccountMetadata`,
  `getAccountKey`.

### Gap 4 — High: backend integration tests missing (spec §8)

`backend/src/internal/handler/checkpoints_handler_test.go` (new file) mirroring
`budgets_handler_test.go` / `sync_handler_test.go`. Helpers to reuse:
`handlerSetupTest(t)`, `createHandlerTestUser`, `authenticatedContext`,
`request(method, target, body)`, `req.SetPathValue("id", ...)`,
`service.Accounts.Create`.

Tests to write (one Test* each):

1. `TestListCheckpointsHandler_Happy` — seed an account, insert 2 checkpoint
   rows directly via `database.Pool.Exec`, GET, assert 2 rows ascending.
2. `TestListCheckpointsHandler_AccessDenied` — account owned by user A, GET as
   user B -> 403.
3. `TestUpsertCheckpointsHandler_InsertThenUpdate` — PUT a checkpoint, PUT the
   same month with a new `encrypted_balance`, GET -> the updated value
   (verifies the `ON CONFLICT` update path).
4. `TestUpsertCheckpointsHandler_MaxRows` — PUT 401 rows -> 400 error.
5. `TestVerifyCheckpointsHandler_Counts` — insert 3 transactions in Feb/Mar/Apr
   (via `TransactionRepo` or direct insert), POST verify with months
   ["2025-02-28","2025-03-31","2025-04-30"], assert cumulative tx_counts
   (1, 2, 3). This validates the
   `date_trunc('month', time AT TIME ZONE 'UTC')` boundary logic.
6. `TestSyncPushHandler_CheckpointFanOut` — owner + member on a joint account
   (see `sync_handler_test.go` / `accounts_handler_test.go` for the
   joint-member setup via `service.Accounts.InviteUser` or direct
   `account_users` insert), push a `checkpoint` SyncOperation with
   `account_id` + `checkpoint_month` + `timestamp`, assert a sync_queue row
   was created targeting the other member with the right `checkpoint_month`
   + `source_updated_at`.
7. `TestListTransactionsHandler_FromToFilter` — insert txs in Jan/Feb/Mar,
   GET with `?from=<Feb 1>&to=<Feb 28>`, assert only Feb rows returned.

Cleanup: add `database.Pool.Exec(ctx, "DELETE FROM transactions_checkpoints")`
to the `handlerSetupTest` cleanup func in
`internal/handler/auth_handler_test.go` (before the existing
`DELETE FROM accounts` so it doesn't conflict; FK cascade already handles it
when accounts delete, but explicit is safer).

### Gap 5 — Medium: AccountDetailPage still excludes "Opening Balance" category

**Problem.** Phase 5b removed the `category !== "Opening Balance"` guards from
`DashboardPage.tsx` but **not** from `AccountDetailPage.tsx`. Remaining lines:

```
frontend/src/pages/accounts/AccountDetailPage.tsx:828  (expense chart)
frontend/src/pages/accounts/AccountDetailPage.tsx:851  (income chart)
frontend/src/pages/accounts/AccountDetailPage.tsx:936  (regularFilteredTxs)
frontend/src/pages/accounts/AccountDetailPage.tsx:950  (displayAccountTxs)
frontend/src/pages/accounts/AccountDetailPage.tsx:1002 (show-all overlay filter)
```

**Decision needed.** Spec §7 says "remove OB exclusions". But like the
`add_category_id` migration-store guard (which the spec explicitly says to
*leave* for defense during staggered rollout), these guards are **harmless
post-migration** (no OB txs exist) and **correct pre-migration** (OB txs still
present). So keeping them is a safe defense for users who haven't run the
client migration yet.

**Recommendation:** keep them (consistency with the migration-store guard
decision) — but update the comments to say "kept as a defense for un-migrated
accounts; no-op post-migration". If strict spec-compliance is preferred, remove
the `&& tx.payload.category !== "Opening Balance"` from each of the 5 lines
and drop the OB branch at line 1002. Either way, document the choice.

The `openingBalance` computation at line ~923-929 (summing legacy OB txs as a
fallback when `metadataOpeningBalance == null`) is **correct and required** for
un-migrated accounts — leave it.

### Gap 6 — Medium: AGENTS.md Revision 19 not written

The user explicitly requested keeping `AGENTS.md` updated. It currently ends at
**Revision 18**. Add a new Revision 19 block at the top describing:

- New `transactions_checkpoints` table (migration 0019): monthly encrypted
  balance prefix-sum, `(account_id, checkpoint_month)` PK, `encrypted_balance`
  AES-GCM(account-key) JSON `{balance, tx_count}`. `checkpoint_month` = last
  UTC day of the month; current-month checkpoint is live (= running balance).
- `accounts.encrypted_metadata` (TEXT, AES-GCM(account-key) JSON
  `{opening_balance_cents}`) replaces the legacy epoch-dated "Opening Balance"
  transaction.
- New `sync_queue.checkpoint_month` (DATE) + `source_updated_at` (TIMESTAMPTZ)
  columns for joint-member propagation with LWW.
- New endpoints: `GET/PUT /api/v1/accounts/{id}/checkpoints`,
  `POST /api/v1/accounts/{id}/checkpoints/verify`; `GET
  /accounts/{id}/transactions` gains `from`/`to` query params.
- Client-side migration `build_checkpoints_and_move_opening_balance` (seeded
  pending for all users by migration 0019): moves OB into metadata, soft-
  deletes OB transactions, builds contiguous checkpoints; idempotent.
- Dashboard/account-detail now derive the pre-window opening balance from a
  single checkpoint + the partial start month (RangeSum perf win), not the
  O(n) full-scan. Net worth and per-account balances read the live current-
  month checkpoint.
- Cross-references: Section 2 (checkpoint encryption model + OB-as-metadata),
  Section 3 (checkpoint-store, account-metadata, dashboard/account-detail
  balance derivation), Section 4 (new endpoints), Section 5 (migration 0019 +
  the client migration runner), Section 7 (testing requirements added).

Mirror the existing revision-block format (one `> **Revision N** — ...` line
with pointers to Sections).

### Gap 7 — Low: test cleanup for transactions_checkpoints

`internal/handler/auth_handler_test.go` `handlerSetupTest` cleanup deletes
most tables. `transactions_checkpoints` is covered by the accounts FK cascade,
but add an explicit `DELETE FROM transactions_checkpoints` line for safety and
clarity (before `DELETE FROM accounts`).

### Gap 8 — Low: verify endpoint when loadCheckpoints returns empty

`frontend/src/lib/checkpoint-recompute.ts` `verifyCheckpoints` returns
`{stale:[], missing:[]}` when `entries.length === 0`. For an account that
*should* have checkpoints (post-migration user) but the load silently failed
(e.g. account key unavailable), this masks the problem and no reconcile fires.

**Fix (optional).** Differentiate "no checkpoints exist legitimately" (new
account / no transactions) from "load failed": if `loadCheckpoints` threw or
returned entries but the account has transactions (server count > 0 via a
lightweight verify call with the current month), force a `recomputeFrom` from
the current month. Low priority; the staleness check on next successful load
will catch it. Document as a known minor.

---

## Verification checklist before merging into develop

1. `cd backend/src && go build ./... && go vet ./... && go test ./...`
2. `cd frontend && npx tsc --noEmit && npx vitest run` (expect 183 + new tests
   from Gaps 1, 2, 4)
3. Manual smoke (docker-compose up): register a user, create an account with
   an opening balance, add transactions across 2 months, confirm the dashboard
   balance chart traces correctly; edit the opening balance, confirm balances
   shift; delete a transaction in a past month, confirm checkpoints propagate;
   run the client migration on an account that still has legacy OB txs,
   confirm OB moves to metadata and checkpoints appear.
4. Joint account smoke: two users share an account; member A edits a tx;
   member B should see updated checkpoints after sync pull (validates Gap 1
   fix).

## Resolved spec §9 decisions (already locked in, do not re-litigate)

- Q1 new accounts: bootstrap checkpoint on first tx add (Gap 2 implements).
- Q2 balance unit: float (2-dp) in the encrypted blob.
- Q3 sync conflict: LWW by `updated_at` / `source_updated_at`.
- Q4 verify batching: return all months, no cap.
- Dashboard rendering: checkpoint + in-window tx (spec §4.5).
- Open-time verify: per-account lazy; reconcile blocks briefly when stale.
- PR scope: one branch, phased commits.
- Migration weight: run fully on first login with toast progress.