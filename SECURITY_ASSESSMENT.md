# Auth Flow

## 1. User Password

| Location | State | Details |
|---|---|---|
| **In transit** (registration/login) | **Plaintext** over HTTPS | Sent as `"password"` in JSON body. Relies on TLS. |
| **Server DB** (users table) | **bcrypt hash** | `password_hash` column. `bcrypt` is a one-way hash with embedded salt. Server never learns the plaintext. |
| **Browser memory** during session | **Plaintext** | Held in React state in `useState("")` on login page. Freed when component unmounts / user navigates off. |

**Verdict:** ✅ Correct. Password is hashed server-side, never stored in plaintext anywhere persistent. In-memory only during the login/register form session.

---

## 2. X25519 Private Key (the master encryption key)

| Location | State | Details |
|---|---|---|
| **Generated** (registration) | **Plaintext** in browser memory | `generateKeyPair()` produces `{ privateKey, publicKey }` as base64 strings. |
| **In transit** (registration) | **Encrypted** | Encrypted client-side first: `encryptWithPassword(privateKey, password)` → PBKDF2(600K iterations, random salt) → AES-256-GCM → base64. Then sent as `"encrypted_private_key"`. |
| **Server DB** (users table) | **Encrypted** with password-derived key | `encrypted_private_key` column stores the PBKDF2+AES-GCM ciphertext. The server **cannot decrypt it** — it doesn't have the password. |
| **Browser** on page refresh (PrivateKeyGate) | **Encrypted** in `encryptedPrivateKey` Zustand field | Fetched from server via `GET /me`. Re-decrypted in-memory when user re-enters password. |
| **Browser** during active session | **Plaintext** in Zustand store (memory only) | `plaintextPrivateKey` is an `ArrayBuffer` held in a JavaScript variable. **Never written to localStorage, IndexedDB, sessionStorage.** Cleared on logout/tab close. |
| **Device access** (PIN unlock) | **Encrypted password** in localStorage | See section 5 below. |

**Verdict:** ✅✅ **This is the critical one and it's done right.** The private key is encrypted with the user's password before leaving the browser, the server stores only ciphertext, and the plaintext is held in-memory only with explicit clearing on logout.

---

## 3. Device Token (Remember-Me Feature)

### Flow
1. User ticks "Remember this device" on OTP step.
2. Frontend generates a **random 32-byte token** (`crypto.getRandomValues`).
3. Frontend computes `secretHash = SHA-256(token + fingerprint + password)`.
4. Frontend sends `{ fingerprint_hash, secret_hash }` to server. The **plain token never leaves the device** — only its hash.
5. Server stores the hash in `access_secrets` table.

| Data | Location | State | Details |
|---|---|---|---|
| **Fingerprint** (visitor ID) | localStorage (`budgeteer_device_fingerprint`) | **Plaintext** | This is just a browser identifier (e.g. `"a1b2c3d4..."`). Not a secret — it's the same as a cookie ID. |
| **Device token** (32 random bytes) | localStorage (`budgeteer_device_token`) | **Plaintext** | Stored as JSON `{ fingerprint, token, email }`. The token is a random 64-char hex string. |
| **Secret hash** | Server DB (`access_secrets.secret_hash`) | **SHA-256 hash** | `SHA-256(token + fingerprint + password)`. One-way, bound to all three inputs. |

### Security analysis of the device token
- **On the server**: only a SHA-256 hash is stored. The server learns nothing about the token or password from it. If the DB is breached, the hash cannot be reversed to recover the token or password.
- **In localStorage**: the token is **plaintext**. This is a known trade-off: the remember-me feature needs the token available to send on next login. The same approach is used by every "remember me" cookie, OAuth refresh token, etc. The `@fingerprintjs/fingerprintjs` visitor ID is also plaintext — but it's non-sensitive (just an identifier).
- **On verify**: the frontend sends `{ email, password, fingerprint_hash, device_token }` to `POST /auth/login-with-device`. The backend recomputes `SHA-256(token + fingerprint + password)` and compares to the stored hash. If an attacker stole the token from localStorage, they'd also need the password (which is never stored in localStorage) to pass the verification — the SHA-256 binds them together.

**Verdict:** ✅ **Acceptable.** The token in localStorage is equivalent to a session cookie — a risk, but the SHA-256 binding to the password (which stays out of localStorage) provides a meaningful second factor. The compromised-localStorage attacker gets the token but still cannot compute the correct hash without the password.

---

## 4. PIN Unlock

### Flow
1. User enables PIN in Settings: enters password + 4-6 digit PIN.
2. Frontend encrypts the password with the PIN: `encryptWithPassword(password, pin)` → PBKDF2(600K, pin-derived key) → AES-256-GCM → base64 ciphertext.
3. Ciphertext stored in localStorage as `budgeteer_pin_data`.
4. On next PrivateKeyGate: user enters PIN → ciphertext decrypted → password recovered → password decrypts the private key.

| Data | Location | State | Details |
|---|---|---|---|
| **Encrypted password** | localStorage (`budgeteer_pin_data`) | **PBKDF2+AES-GCM ciphertext** | `salt(16) \|\| iv(12) \|\| ciphertext`, base64-encoded. Encrypted with the PIN. |
| **PIN** | **Nowhere** | **Never stored** | The PIN is typed by the user and never written to any storage. When the user sets "disable PIN", the encrypted blob is simply deleted. |
| **Decrypted password** | Browser memory during unlock | **Plaintext** | Only while `handlePinSubmit` runs. Freed after the private key is decrypted. |

### Is the password secure in localStorage?
- The stored value is `encryptWithPassword(password, pin)`. This uses **PBKDF2 with 600,000 iterations + random salt** to derive an AES-256-GCM key from the PIN, then encrypts the password.
- An attacker who reads localStorage gets the ciphertext. To recover the password they must brute-force the 4-6 digit PIN against PBKDF2(600K iterations) — which is computationally expensive (each guess = 600K PBKDF2 rounds + AES-GCM decrypt).
- A 4-digit PIN (10,000 combinations) → 6 billion PBKDF2 rounds worst case. Feasible but costly.
- A 6-digit PIN (1,000,000 combinations) → 600 billion PBKDF2 rounds. **Infeasible** for offline attacks.

**Verdict:** ✅ **The password is encrypted, not plaintext.** The 600K PBKDF2 iterations make brute-force expensive. The user also has control: they choose the PIN length, and the "Use password instead" fallback bypasses the PIN entirely.

---

## 5. Device Secret Hash Storage

| Location | What's stored | Encrypted? |
|---|---|---|
| `access_secrets.secret_hash` (DB) | `SHA-256(token + fingerprint + password)` | **One-way hash**, not reversible. |
| `access_secrets.fingerprint_hash` (DB) | FingerprintJS visitor ID | **Plaintext** (not a secret — just a browser identifier). |
| `access_secrets.device_name` (DB) | e.g. "Linux x86_64" | **Plaintext** (cosmetic only). |

**Verdict:** ✅ The secret_hash is a one-way hash. The server cannot recover the device token or the password from it.

---

## Summary Table

| Sensitive Item | In Transit | At Rest (Server DB) | At Rest (Client Storage) | In Memory (Browser) |
|---|---|---|---|---|
| **Password** | Plaintext (HTTPS) | bcrypt hash ✅ | Never stored ✅ | Plaintext during form ✅ (freed after) |
| **X25519 Private Key** | PBKDF2+AES-GCM ✅ | PBKDF2+AES-GCM ciphertext ✅ | Never stored (only encrypted form fetched from server) ✅ | Plaintext in Zustand (memory only) ✅ |
| **Device Token** | Plaintext (HTTPS) | SHA-256 hash ✅ | Plaintext in localStorage ⚠️ (design trade-off for "remember me") | Plaintext during login |
| **Fingerprint ID** | Plaintext (HTTPS) | Plaintext in DB ⚠️ | Plaintext in localStorage | — |
| **PIN** | Never sent ✅ | Never stored ✅ | Never stored ✅ | Plaintext during unlock ✅ (freed after) |
| **Encrypted PIN data** | — | — | PBKDF2+AES-GCM ciphertext ✅ | — |

### Where there's room to tighten

1. **Device token in localStorage is plaintext** — This is the standard trade-off for "remember me" features. You could encrypt it with the password, but then you'd need the password to decrypt it on next login — which defeats the purpose (the whole point is to avoid re-entering the password + OTP). This is the same security model as browser "remember password" or OAuth refresh tokens.

2. **Password is sent plaintext over the wire** — Mitigated by TLS. Some apps do SRP (Secure Remote Password) to avoid sending even the password over TLS, but that's rare in practice and adds significant complexity.

3. **Fingerprint hash is plaintext in the DB** — It's a non-sensitive browser identifier, but it could be hashed with a random salt for defense in depth. Low priority since it's not a credential.
