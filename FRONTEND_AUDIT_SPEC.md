# Frontend Audit — Spec for Builder

> **Branch:** `review/frontend-audit`  
> **Audit against:** `AGENTS.md` (Revision 2)  
> **Date:** 2026-06-11  

This document catalogs every bug, spec violation, and missing feature found in the frontend. Items are grouped by severity. Each item includes: what the bug is, where in the code it lives, what AGENTS.md says vs what exists, and the exact fix required.

---

## P0 — Blocker (broken UX, data loss, security)

### P0.1 — Create Account button returns 405 Method Not Allowed

**What's wrong:** The "Create Account" dialog submits to `POST /api/v1/accounts` (no trailing slash) but the backend registers `POST /v1/accounts/` (**with** trailing slash). Since the protected subrouter is mounted at `/api/`, the effective path is `/api/v1/accounts/` — the mismatch causes a 405.

Additionally, fetching accounts (`GET /api/v1/accounts`) fails because **no `GET` handler for listing accounts exists** in `main.go`. The protected routes only register:
- `POST   /v1/accounts/` — create
- `DELETE /v1/accounts/{id}` — delete

No `GET /v1/accounts` or `GET /v1/accounts/` handler is present.

**Files:**
- Frontend: `frontend/src/lib/constants.ts` line 13 — `accounts: \`${API_BASE}/accounts\`` → resolves to `/api/v1/accounts`
- Backend: `backend/src/cmd/budgeteer-backend/main.go` line 78 — `"POST   /v1/accounts/"` (trailing slash)  
- Backend: `backend/src/cmd/budgeteer-backend/main.go` — missing `GET /v1/accounts` handler entirely

**Fix:**
1. Add a `GET /v1/accounts` handler in the backend protected routes (calls `handler.ListAccounts`).
2. Implement `ListAccounts` handler + service that returns accounts for the authenticated user where `deleted_at IS NULL`.
3. Decide on trailing-slash convention: either remove trailing slash from backend route (`POST /v1/accounts` → `POST /v1/accounts`) and also fix the GET route, OR leave it and change the frontend. Either way **both sides must match**.

---

### P0.2 — Password change generates NEW keypair instead of re-encrypting existing one

**What's wrong:** When the user changes their password, `SettingsPage.tsx` calls `generateKeyPair()` and encrypts the **new** private key with the new password. This destroys the user's ability to decrypt any data previously encrypted under the old keypair (all transactions, account keys, etc.). The user effectively loses all their historical data.

**AGENTS.md (Section 4):**  
> "Accepts new `encrypted_private_key` (re-encrypted with new password-derived key)."

The spec says to **re-encrypt** the existing private key, not generate a new one.

**File:** `frontend/src/pages/settings/SettingsPage.tsx` lines 25-29

**Fix:**  
The correct flow is:
1. Retrieve the current `encrypted_private_key` from the auth store (`user.encrypted_private_key`).
2. Decrypt it client-side using the **current password**: `await decryptWithPassword(encrypted_private_key, currentPassword)`.
3. Re-encrypt it using the **new password**: `await encryptWithPassword(plaintextKey, newPassword)`.
4. Send the re-encrypted key to `PUT /api/v1/auth/password`.

```typescript
// Correct approach:
const encryptedPrivateKey = user?.encrypted_private_key; // from store
const plaintextKey = await decryptWithPassword(encryptedPrivateKey, currentPassword);
const newEncryptedKey = await encryptWithPassword(plaintextKey, newPassword);

await apiFetch(ENDPOINTS.changePassword, {
  method: "PUT",
  body: JSON.stringify({
    password: currentPassword,
    new_encrypted_private_key: newEncryptedKey,
  }),
});
```

---

### P0.3 — "Not logged in" shown after page refresh even when authenticated

**What's wrong:** The auth store initializes:
```typescript
token: getToken(),   // rehydrated from localStorage
user: null,          // NEVER persisted
```
On page refresh, `token` is restored but `user` is always `null`. The `Header.tsx` renders `user?.email ?? "Not logged in"`, so every refresh shows "Not logged in" even for valid sessions.

**Files:**
- `frontend/src/stores/auth-store.ts` line 19 — `user: null` hardcoded
- `frontend/src/components/layout/Header.tsx` line 10 — `{user?.email ?? "Not logged in"}`
- `frontend/src/pages/auth/LoginPage.tsx` line 40 — fabricated `as User` cast with only `email` and `encrypted_private_key`

**Fix options (pick one):**
1. **Persist `user` to localStorage** alongside `token`. Serialize/deserialize JSON in `setAuth`/init. Simplest, but `public_key` and `id` would be stale.
2. **Fetch user data on app mount** by calling `GET /api/v1/auth/keys` (which returns `encrypted_private_key`) or a new `/me` endpoint. This is the cleanest approach.
3. **At minimum**, store `email` alongside `token` in localStorage so the header can display it. But the real `User` object needs `id` and `public_key`.

**Recommended fix:**  
- Add a `GET /api/v1/auth/me` backend endpoint returning `{ id, email, public_key, encrypted_private_key, is_verified }`.
- In `App.tsx` (or a wrapper component), call this endpoint on mount if `token` exists but `user` is null.
- Update the auth store to populate `user` from the response.
- Remove the fabricated `as User` cast in `LoginPage.tsx`.

---

### P0.4 — Account invite uses hardcoded placeholder key (no real ECIES encryption)

**What's wrong:** In `AccountDetailPage.tsx`, the `encryptedKey` sent to the invite endpoint is always:
```typescript
btoa(String.fromCharCode(...new Uint8Array(new TextEncoder().encode("account-key-placeholder"))));
```
This is a static base64 string, **not** an actual AES-256 Account Key encrypted with the invitee's X25519 public key via ECIES.

**AGENTS.md (Section 2):**  
> "To invite a user, the inviter fetches the invitee's Public Key, encrypts the Account Key with it via ECIES (X25519 + AES-GCM), and stores the result in the `account_users` table."

**File:** `frontend/src/pages/accounts/AccountDetailPage.tsx` (the invite flow)

**Fix:**  
Implement the real ECIES flow:
1. Generate (or retrieve) an AES-256 Account Key for the account via `generateAccountKey()` from `crypto.ts`.
2. Fetch the invitee's public key: `GET /api/v1/users/lookup?email=<invitee_email>` → returns `{ public_key }`.
3. Import the invitee's X25519 public key.
4. Generate an ephemeral X25519 keypair, perform ECDH to derive a shared secret.
5. Derive an AES key from the shared secret (via HKDF or simply use the raw bytes).
6. Encrypt the Account Key with the derived AES key + AES-GCM.
7. Send the ephemeral public key + ciphertext to the backend as the encrypted account key.

For now (before X25519 is implemented — see P1.2 below), use the native Web Crypto API with ECDH P-256 as a temporary measure, but wrap it so the interface can be swapped to X25519 later.

---

## P1 — High Priority (spec violations, broken features)

### P1.1 — Backend missing `GET /v1/accounts` and `GET /v1/accounts/{id}` handlers

**What's wrong:** The frontend calls `fetchAccounts()` which does `GET /api/v1/accounts`, but no backend handler exists for this route. Same for `GET /api/v1/accounts/{id}` (account detail).

**This is the root cause** of the account list being empty (or returning 404). Fix P0.1 first (add the GET route), but this item tracks the handler implementation itself.

**Files:**
- Backend `main.go` — missing routes
- Need new handler: `handler.ListAccounts` (GET), `handler.GetAccount` (GET by id)
- Need new service/repository methods: `ListByUserID(userID)`, `GetByID(accountID, userID)`

**Fix:**  
Add routes and implement the full handler-service-repository chain for listing accounts. The repository query should filter `WHERE deleted_at IS NULL` and join `account_users` to verify the user has access.

---

### P1.2 — Wrong crypto curve: ECDH P-256 instead of X25519

**What's wrong:** `generateKeyPair()` in `crypto.ts` uses:
```typescript
crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, ...)
```
But AGENTS.md specifies **X25519**. The `@noble/curves` package (which provides `x25519`) is installed but completely unused.

**AGENTS.md (Section 3):**  
> "Crypto Libraries: Native WebCrypto API for AES-GCM; `@noble/ciphers` and `@noble/curves` for X25519/Ed25519 (audited, zero-dependency)."

**File:** `frontend/src/lib/crypto.ts` lines 86-93

**Fix:**  
Replace the ECDH P-256 key generation with X25519 from `@noble/curves`:

```typescript
import { x25519 } from "@noble/curves/ed25519";

export function generateKeyPair(): { publicKey: string; privateKey: string } {
  const privateKey = x25519.utils.randomPrivateKey();
  const publicKey = x25519.getPublicKey(privateKey);
  return {
    publicKey: bytesToBase64(publicKey),
    privateKey: bytesToBase64(privateKey),
  };
}
```

Also implement ECDH shared secret derivation for joint account invites:
```typescript
export function deriveSharedSecret(privateKey: Uint8Array, publicKey: Uint8Array): Uint8Array {
  return x25519.getSharedSecret(privateKey, publicKey);
}
```

Remove the dead `@noble/ciphers` dependency if `@noble/curves` is the only one needed (X25519 comes from `@noble/curves`).

---

### P1.3 — Currency input is a plain text field instead of a dropdown

**What's wrong:** The account creation dialog has a free-text `<Input maxLength={3}>` for currency. Users must manually type "USD", "EUR", etc. There is no visual feedback (currency symbol, flag, full name) and no guard against invalid codes.

**AGENTS.md (Section 3):**  
> "Create/delete accounts (set default currency)."

While the spec doesn't mandate a dropdown UX, a free-text 3-char input with no validation is poor UX and will cause "currency" values like "usd" (lowercase), "US " (with space), or "ABC" (invalid) to be stored in the database.

**File:** `frontend/src/pages/accounts/AccountListPage.tsx` lines 47-53

**Fix:**  
Replace `<Input>` with a **currency select dropdown** using the `@radix-ui/react-select` package (already installed!):

```tsx
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
// ... or use a native <select> styled consistently with Shadcn

const CURRENCIES = [
  { code: "EUR", symbol: "€", name: "Euro" },
  { code: "USD", symbol: "$", name: "US Dollar" },
  { code: "GBP", symbol: "£", name: "British Pound" },
  { code: "CHF", symbol: "Fr", name: "Swiss Franc" },
  // ... add all common currencies
];
```

If the `@radix-ui/react-select` is not wired into a Shadcn `select.tsx` component, either create one or use a styled native `<select>` (which already exists in the same form for account type).

---

### P1.4 — Settings page missing most features

**What's wrong:** The Settings page only has:
- Read-only email display (no way to change)
- Password change form (broken — see P0.2)
- Default currency placeholder text with NO actual selector

**AGENTS.md (Section 3 — Settings):**
> - Account management (password changes trigger re-encryption of the private key with the new password-derived key; see Section 4 API).
> - Key rotation (generates a new keypair and re-encrypts all Account Keys for the user's accounts).
> - UI customization and Locale settings.
> - Default currency settings.

**File:** `frontend/src/pages/settings/SettingsPage.tsx`

**Fix:**  
Add the following cards/sections to SettingsPage:

1. **Email Change** — form with current password + new email. Calls `PUT /api/v1/auth/email` (backedn endpoint needed too).
2. **Default Currency** — dropdown selector (same list as P1.3). Persisted to local state or a database setting.
3. **Locale** — language/region selector (e.g., `en`, `it`, `de`, `fr`). Persisted locally.
4. **Key Rotation** — button that generates a new X25519 keypair, re-encrypts all Account Keys for the user's accounts using the new key, and uploads the new `encrypted_private_key`.

---

### P1.5 — Backend missing GET /v1/auth/me endpoint

**What's wrong:** The frontend has no way to fetch the authenticated user's profile (id, email, public_key, etc.) after login. The `user` object is fabricated from minimal data. A `/me` endpoint is standard for SPAs to hydrate the user session on reload.

**AGENTS.md (API table):**  
Does not explicitly list a `/me` endpoint, but the spec says:
> "Returns the authenticated user's `encrypted_private_key` (for new device logins)."

The current `/api/v1/auth/keys` endpoint returns only `{ encrypted_private_key }` — not the full user profile.

**Fix:**  
Add `GET /api/v1/auth/me` returning:
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "public_key": "base64...",
  "encrypted_private_key": "base64...",
  "is_verified": true
}
```

In the frontend, call this endpoint on app mount (in `App.tsx` or a new layout wrapper) when `token` exists but `user` is null.

---

## P2 — Medium Priority (UX, correctness, dead code)

### P2.1 — Private key storage corruption on login

**What's wrong:** In `LoginPage.tsx` line 38:
```typescript
const keyBytes = new TextEncoder().encode(plaintextKey).buffer;
```
`decryptWithPassword` returns a **string** (the PEM/PKCS8 base64 text of the private key). `TextEncoder().encode()` then encodes that base64 **string** as UTF-8 bytes. The result is UTF-8-encoded base64 characters, NOT the raw binary private key.

When this `ArrayBuffer` is later used for decryption, it will produce garbage because:
1. The base64 string gets UTF-8 encoded (e.g., `"AQID"` → `[65, 81, 73, 68]` instead of `[0, 1, 2, 3]`)
2. The decoding functions in `crypto.ts` expect raw key bytes, not UTF-8 characters

**File:** `frontend/src/pages/auth/LoginPage.tsx` line 38

**Fix:**  
The `plaintextKey` string from `decryptWithPassword` is actually a base64-encoded PKCS8 DER blob. It needs to be **decoded** from base64 to binary, not UTF-8 encoded:

```typescript
const keyBytes = Uint8Array.from(atob(plaintextKey), (c) => c.charCodeAt(0)).buffer;
```

Or better, have `generateKeyPair` and `decryptWithPassword` use consistent formats. The cleanest approach:
- `generateKeyPair`: exports keys as base64 of raw bytes
- `encryptWithPassword` / `decryptWithPassword`: work with base64 strings
- On login, decode the base64 private key to ArrayBuffer:
  ```typescript
  const keyBuffer = Uint8Array.from(atob(plaintextKey), c => c.charCodeAt(0)).buffer;
  ```

---

### P2.2 — Missing LZ4 compression step in encryption pipeline

**AGENTS.md (Section 2):**  
> "Encryption Pipeline: `JSON Payload` → `Compress (LZ4)` → `Encrypt (AES-256-GCM)` → `Base64 Encode` (for JSON transport)."

**What's wrong:** The `encryptData`/`decryptData` functions in `crypto.ts` skip the LZ4 compression step entirely. They go straight to AES-256-GCM encryption.

**File:** `frontend/src/lib/crypto.ts` lines 104-121

**Fix:**  
Add LZ4 compression (or any lossless compression compatible with the backend) between serialization and encryption. For the browser, `pako` (deflate) or `lz4js` could be used. Since `@noble/ciphers` is already installed, check if it provides compression — if not, add a small deflate library.

However, since the backend would also need to decompress, **this should be coordinated with a backend change**. For now, at minimum add a `compress`/`decompress` function pair stubbed out with a TODO, so the pipeline structure is visible.

---

### P2.3 — Dead dependencies bloat the bundle

**What's wrong:** Several packages in `package.json` are never imported anywhere:

| Package | Installed | Used |
|---|---|---|
| `@noble/ciphers` | ^1.3.0 | **NO** |
| `@noble/curves` | ^1.9.0 | **NO** (but should be — see P1.2) |
| `@radix-ui/react-dropdown-menu` | ^2.1.11 | **NO** |
| `@radix-ui/react-select` | ^2.2.2 | **NO** |
| `@radix-ui/react-tabs` | ^1.1.8 | **NO** |
| `@radix-ui/react-toast` | ^1.2.11 | **NO** |
| `recharts` | ^3.8.1 | **NO** |

**Fix:**  
- Remove `@radix-ui/react-dropdown-menu`, `@radix-ui/react-tabs`, `@radix-ui/react-toast` unless they have a planned use in the immediate next sprint.
- Keep `@noble/ciphers` and `@noble/curves` — they will be used after P1.2 is implemented.
- Keep `@radix-ui/react-select` — it will be used for the currency dropdown (P1.3).
- Keep `recharts` — it will be used for dashboard charts (deferred to a later milestone, but acceptable to keep).

---

### P2.4 — No transaction, category, recurring, or savings plan UI

**What's wrong:** The database schema has full support for transactions (TimescaleDB hypertable), master categories, subcategories, recurring transactions, and savings plans. None of these have frontend pages or components.

**AGENTS.md (Section 3 — Views & Pages):**
> - Recent movements list.
> - Financial plots and charts (balance over time, spending by category).
> - Interactive time-range selector.
> - Manage income/expense subcategories (under fixed Master categories).
> - Setup recurring transactions.
> - **Savings Accounts:** Define savings plans that deduct from a selected account and track counter-value monthly.

**Fix:**  
This is a major feature gap. Prioritize:

1. **Transaction creation** (at minimum: amount, category, notes, counterparty, date) — both as a standalone page and as a form on the account detail page.
2. **Category management page** — CRUD for subcategories under the fixed master categories.
3. **Dashboard** — recent transactions list + spending chart (Recharts is already installed).

Recurring transactions and savings plans can be deferred.

---

### P2.5 — Fabricated user object on login

**What's wrong:** In `LoginPage.tsx` line 40:
```typescript
const user: User = { email, encrypted_private_key, is_verified: true } as User;
```

This creates an object that masquerades as a `User` but is missing `id` and `public_key`. The `as User` type assertion suppresses TypeScript errors but doesn't make the object conform to the interface. Any code that accesses `user.id` or `user.public_key` will get `undefined`.

**File:** `frontend/src/pages/auth/LoginPage.tsx` line 40

**Fix:**  
This is a consequence of missing the `/me` endpoint (P1.5). Once that exists, replace this with:
```typescript
const user = await apiFetch<User>(ENDPOINTS.me);
```

---

## P3 — Low Priority / Nice to Have

### P3.1 — Settings: UI customization / locale

**AGENTS.md:** "UI customization and Locale settings."

**Fix:**  
Add a locale selector (dropdown with common languages) and persist the choice to localStorage. Wire it to react-intl or a similar i18n library. For v1, a simple locale picker that sets `document.documentElement.lang` is acceptable.

### P3.2 — Settings: Key rotation

**AGENTS.md:** "Key rotation (generates a new keypair and re-encrypts all Account Keys for the user's accounts)."

**Fix:**  
Add a "Rotate Keys" button in Settings. On click:
1. Generate a new X25519 keypair.
2. For each account the user belongs to, decrypt the current Account Key (using the OLD private key), re-encrypt it with the NEW public key.
3. Upload the new `encrypted_private_key` (encrypted with the user's password-derived key).
4. Upload the re-encrypted Account Keys for each account.

### P3.3 — Backend: Add email change endpoint

**AGENTS.md API table:** Does not list an email change endpoint, but the Settings page should support it.

**Fix:**  
Add `PUT /api/v1/auth/email` backend endpoint accepting `{ password, new_email }`. Verifies password, updates email, queues a verification OTP to the new address.

### P3.4 — Login should reject unverified users

**What's wrong:** The backend login handler likely allows unverified users to log in, bypassing the OTP verification step. If `is_verified = false` users can get a JWT and access protected endpoints, the OTP flow is pointless.

**Fix:**  
In the backend login handler, after verifying credentials, check `is_verified`. If false, return `403 Forbidden` with error `"Email not verified"`. The frontend should handle this and redirect to `/verify-otp?email=<email>`.

---

## Summary — Implementation Order

| Priority | Item | Area | Effort |
|---|---|---|---|
| P0.1 | Fix 405 on account creation + add GET accounts route | Backend + Frontend | 1 day |
| P0.2 | Fix password change (re-encrypt, don't regenerate) | Frontend | 0.5 day |
| P0.3 | Fix "not logged in" after refresh | Frontend + Backend (new /me) | 0.5 day |
| P0.4 | Implement real ECIES for account invites | Frontend | 1 day |
| P1.1 | Implement GET /v1/accounts handler + service | Backend | 1 day |
| P1.2 | Replace P-256 with X25519 | Frontend | 0.5 day |
| P1.3 | Currency text field → dropdown | Frontend | 0.5 day |
| P1.4 | Settings page: email change, default currency, locale | Frontend + Backend | 1 day |
| P1.5 | Add GET /v1/auth/me endpoint | Backend | 0.5 day |
| P2.1 | Fix private key storage (base64 decode, not UTF-8 encode) | Frontend | 0.25 day |
| P2.2 | LZ4 compression in pipeline | Frontend | 0.5 day |
| P2.3 | Prune dead dependencies | Frontend | 0.25 day |
| P2.4 | Transaction + category UI | Frontend + Backend | 2-3 days |
| P2.5 | Remove fabricated `as User` cast | Frontend | 0.1 day |
| P3.x | Key rotation, locale, email change, unverified user guard | Various | 2-3 days |
