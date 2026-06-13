/**
 * Budgeteer Cryptographic Utilities
 *
 * Per AGENTS.md Revision 2:
 * - Encryption Pipeline: JSON Payload → Compress (LZ4) → Encrypt (AES-256-GCM) → Base64
 * - Key Management: X25519 keypair via @noble/curves
 * - Private Key encrypted via Argon2id → AES-256-GCM (PBKDF2 substitute until Argon2 impl)
 * - Account Key ECIES: X25519 + AES-GCM
 *
 * Security note: crypto.subtle is ONLY available in secure contexts (HTTPS or localhost).
 */

import { x25519 } from "@noble/curves/ed25519";

/** Check that Web Crypto API is available in a secure context. */
function checkCrypto(): void {
  if (!crypto.subtle) {
    throw new Error(
      "Encryption is unavailable because the page is not served over a secure connection (HTTPS). " +
        "Please access this application via https:// or localhost."
    );
  }
}

// ---------------------------------------------------------------------------
// Base64 helpers
// ---------------------------------------------------------------------------

/** Encode a Uint8Array to base64 string.
 *  Uses chunked processing to avoid stack overflow on large arrays
 *  (the spread operator ...bytes fails on multi-MB photos). */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 8192; // 8 KB chunks
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/** Decode a base64 string to Uint8Array. */
export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// Password-based key derivation & encryption (PBKDF2 + AES-256-GCM)
// AGENTS.md specifies Argon2id but PBKDF2 is used as a transitional
// implementation until Argon2id is available in the browser.
// ---------------------------------------------------------------------------

/** Derive an AES-256-GCM key from a password using PBKDF2-SHA256. */
export async function deriveKeyFromPassword(
  password: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  checkCrypto();
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits", "deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 600000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypt a plaintext string with a password.
 * Format: salt(16) || iv(12) || ciphertext, all base64-encoded.
 */
export async function encryptWithPassword(
  plaintext: string,
  password: string
): Promise<string> {
  checkCrypto();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKeyFromPassword(password, salt);
  const enc = new TextEncoder();
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(plaintext)
  );
  const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(encrypted), salt.length + iv.length);
  return bytesToBase64(combined);
}

/**
 * Decrypt a ciphertext string with a password.
 */
export async function decryptWithPassword(
  ciphertext: string,
  password: string
): Promise<string> {
  checkCrypto();
  const combined = base64ToBytes(ciphertext);
  const salt = combined.slice(0, 16);
  const iv = combined.slice(16, 28);
  const data = combined.slice(28);
  const key = await deriveKeyFromPassword(password, salt);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    data
  );
  return new TextDecoder().decode(decrypted);
}

// ---------------------------------------------------------------------------
// X25519 key pair (per AGENTS.md spec — replaces legacy ECDH P-256)
// ---------------------------------------------------------------------------

/**
 * Generate an X25519 key pair.
 *
 * Per AGENTS.md Section 2:
 *   "Users generate an X25519 keypair upon registration..."
 *
 * Returns publicKey and privateKey as base64-encoded raw bytes.
 */
export function generateKeyPair(): { publicKey: string; privateKey: string } {
  const privateKey = x25519.utils.randomPrivateKey();
  const publicKey = x25519.getPublicKey(privateKey);
  return {
    publicKey: bytesToBase64(publicKey),
    privateKey: bytesToBase64(privateKey),
  };
}

/**
 * Derive a shared secret from an X25519 private key and a peer's public key.
 */
export function deriveSharedSecret(
  privateKey: Uint8Array,
  publicKey: Uint8Array
): Uint8Array {
  return x25519.getSharedSecret(privateKey, publicKey);
}

// ---------------------------------------------------------------------------
// Symmetric encryption with a raw AES-256-GCM key
// Used to encrypt transaction payloads and account keys.
// ---------------------------------------------------------------------------

/**
 * Encrypt data with a base64-encoded AES-256 key.
 * Format: iv(12) || ciphertext, all base64-encoded.
 */
export async function encryptData(
  plaintext: string,
  keyBase64: string
): Promise<string> {
  checkCrypto();
  const keyBytes = base64ToBytes(keyBase64);
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, [
    "encrypt",
  ]);
  const enc = new TextEncoder();
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(plaintext)
  );

  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);
  return bytesToBase64(combined);
}

/**
 * Decrypt data with a base64-encoded AES-256 key.
 */
export async function decryptData(
  ciphertext: string,
  keyBase64: string
): Promise<string> {
  checkCrypto();
  const keyBytes = base64ToBytes(keyBase64);
  const combined = base64ToBytes(ciphertext);
  const iv = combined.slice(0, 12);
  const data = combined.slice(12);

  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, [
    "decrypt",
  ]);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    data
  );
  return new TextDecoder().decode(decrypted);
}

// ---------------------------------------------------------------------------
// Key generation helpers
// ---------------------------------------------------------------------------

/** Generate a random 32-byte AES-256 account key, base64-encoded. */
export function generateAccountKey(): string {
  const key = crypto.getRandomValues(new Uint8Array(32));
  return bytesToBase64(key);
}

/** Generate a random 16-byte salt, base64-encoded. */
export function generateSalt(): string {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return bytesToBase64(salt);
}

// ---------------------------------------------------------------------------
// Compression stubs (LZ4 — pending backend coordination)
// AGENTS.md Section 2 specifies: JSON Payload → Compress (LZ4) → Encrypt
// The backend must also decompress, so this is coordinated separately.
// ---------------------------------------------------------------------------

/**
 * Compress a string using LZ4.
 *
 * TODO: Implement once backend LZ4 decompression is confirmed.
 * For now this is a pass-through.
 */
export function compress(data: string): string {
  // Placeholder: return data uncompressed.
  // When implemented, use a library like lz4js or pako (deflate).
  return data;
}

/**
 * Decompress an LZ4-compressed string.
 *
 * TODO: Implement once backend LZ4 compression is confirmed.
 * For now this is a pass-through.
 */
export function decompress(data: string): string {
  // Placeholder: return data as-is.
  return data;
}

// ---------------------------------------------------------------------------
// ECIES helpers for joint account key exchange (X25519 + AES-GCM)
// ---------------------------------------------------------------------------

/**
 * Derive an AES-256-GCM key from an X25519 shared secret using SHA-256.
 *
 * Uses HKDF-SHA256 to derive a uniformly random 256-bit key from the
 * shared secret. This follows the ECIES approach per AGENTS.md Section 2.
 */
async function deriveKeyFromSharedSecret(
  sharedSecret: Uint8Array
): Promise<CryptoKey> {
  // Use HKDF-SHA256 to derive the AES key from the shared secret
  const hkdfKey = await crypto.subtle.importKey(
    "raw",
    sharedSecret,
    "HKDF",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(0), // no salt for ECIES (ephemeral provides freshness)
      info: new TextEncoder().encode("budgeteer-ecies-v1"),
    },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypt an account key for a recipient using ECIES (X25519 + AES-GCM).
 *
 * 1. Generate an ephemeral X25519 key pair.
 * 2. ECDH shared secret = ephemeralPrivateKey × recipientPublicKey.
 * 3. Derive AES key from shared secret via HKDF-SHA256.
 * 4. Encrypt the account key with AES-256-GCM.
 * 5. Return { ephemeralPublicKey (base64), ciphertext (base64) }.
 *
 * Per AGENTS.md Section 2:
 *   "...encrypts the Account Key with it via ECIES (X25519 + AES-GCM)..."
 */
export async function encryptAccountKeyForRecipient(
  accountKeyBase64: string,
  recipientPublicKeyBase64: string
): Promise<{ ephemeralPublicKey: string; ciphertext: string }> {
  // Generate ephemeral key pair
  const ephemeralPriv = x25519.utils.randomPrivateKey();
  const ephemeralPub = x25519.getPublicKey(ephemeralPriv);

  // Derive shared secret
  const recipientPub = base64ToBytes(recipientPublicKeyBase64);
  const sharedSecret = deriveSharedSecret(ephemeralPriv, recipientPub);

  // Derive AES key from shared secret
  const aesKey = await deriveKeyFromSharedSecret(sharedSecret);

  // Encrypt the account key (which is itself a base64 string)
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    enc.encode(accountKeyBase64)
  );

  // Format: iv(12) || ciphertext
  const combined = concat(iv, new Uint8Array(encrypted));

  return {
    ephemeralPublicKey: bytesToBase64(ephemeralPub),
    ciphertext: bytesToBase64(combined),
  };
}

/**
 * Decrypt an account key that was encrypted with ECIES.
 *
 * Returns the original base64-encoded account key plaintext.
 */
export async function decryptAccountKeyForRecipient(
  ciphertextBase64: string,
  ephemeralPublicKeyBase64: string,
  recipientPrivateKeyBase64: string
): Promise<string> {
  const combined = base64ToBytes(ciphertextBase64);
  const iv = combined.slice(0, 12);
  const encrypted = combined.slice(12);

  const ephemeralPub = base64ToBytes(ephemeralPublicKeyBase64);
  const privKey = base64ToBytes(recipientPrivateKeyBase64);

  const sharedSecret = deriveSharedSecret(privKey, ephemeralPub);
  const aesKey = await deriveKeyFromSharedSecret(sharedSecret);

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    aesKey,
    encrypted
  );

  return new TextDecoder().decode(decrypted);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Concatenate two Uint8Arrays. */
function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const result = new Uint8Array(a.length + b.length);
  result.set(a, 0);
  result.set(b, a.length);
  return result;
}
