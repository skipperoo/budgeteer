/**
 * Crypto helpers for the rules system.
 *
 * Rule data is encrypted with the server's X25519 public key so that only
 * the server (which holds the private key) can read it.
 *
 * Generated transaction payloads are encrypted with the user's X25519 public
 * key using the same ECIES format ("1|" + base64), allowing the frontend to
 * detect and decrypt them via the user's private key.
 *
 * ECIES output format: "1|" + base64( ephemeral_pubkey(32) || iv(12) || ciphertext )
 * The "1|" prefix distinguishes ECIES from legacy account-key AES-GCM.
 */

import { base64ToBytes, bytesToBase64 } from "./crypto";
import { x25519 } from "@noble/curves/ed25519";

const ECIES_PREFIX = "1|";

/**
 * Encrypt a JSON-serializable payload with a recipient's X25519 public key.
 *
 * Uses ECIES (X25519 + HKDF-SHA256 + AES-256-GCM).
 *
 * @returns "1|" + base64( ephemeral_pubkey || iv || ciphertext )
 */
export async function encryptForRecipient(
  payload: unknown,
  recipientPublicKeyBase64: string,
): Promise<string> {
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const recipientPub = base64ToBytes(recipientPublicKeyBase64);

  // Generate ephemeral keypair
  const ephemeralPriv = x25519.utils.randomPrivateKey();
  const ephemeralPub = x25519.getPublicKey(ephemeralPriv);

  // ECDH shared secret
  const sharedSecret = x25519.getSharedSecret(ephemeralPriv, recipientPub);

  // Derive AES key via HKDF-SHA256
  const aesKey = await deriveKeyFromSharedSecret(sharedSecret);

  // AES-256-GCM encrypt
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    plaintext,
  );

  // Combine: ephemeralPub(32) || iv(12) || ciphertext
  const combined = new Uint8Array(
    32 + iv.length + ciphertext.byteLength,
  );
  combined.set(ephemeralPub, 0);
  combined.set(iv, 32);
  combined.set(new Uint8Array(ciphertext), 32 + iv.length);

  return ECIES_PREFIX + bytesToBase64(combined);
}

/**
 * Decrypt a payload that was encrypted with ECIES.
 *
 * Input format: "1|" + base64( ephemeral_pubkey || iv || ciphertext )
 * or legacy format (no prefix) for account-key AES-GCM.
 *
 * @returns the decrypted JSON payload
 */
export async function decryptECIESPayload<T = unknown>(
  payload: string,
  privateKeyBase64: string,
): Promise<T> {
  const privKey = base64ToBytes(privateKeyBase64);

  // Strip prefix if present (for ECIES-encrypted payloads)
  let raw: string;
  let isECIES: boolean;
  if (payload.startsWith(ECIES_PREFIX)) {
    raw = payload.slice(ECIES_PREFIX.length);
    isECIES = true;
  } else {
    // Legacy account-key AES-GCM — not supported here
    throw new Error(
      "Cannot decrypt: payload is not ECIES-encrypted (missing '1|' prefix)",
    );
  }

  const encrypted = base64ToBytes(raw);

  if (isECIES) {
    if (encrypted.length < 32 + 12 + 16) {
      throw new Error("ECIES payload too short");
    }
    const ephemeralPub = encrypted.slice(0, 32);
    const iv = encrypted.slice(32, 32 + 12);
    const ciphertext = encrypted.slice(32 + 12);

    // ECDH shared secret
    const sharedSecret = x25519.getSharedSecret(privKey, ephemeralPub);

    // Derive AES key
    const aesKey = await deriveKeyFromSharedSecret(sharedSecret);

    // Decrypt
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      aesKey,
      ciphertext,
    );

    return JSON.parse(new TextDecoder().decode(decrypted)) as T;
  }

  throw new Error("Unsupported encryption format");
}

/**
 * Check if a transaction's encrypted_payload is ECIES-encrypted
 * (vs legacy account-key AES-GCM).
 */
export function isECIESPayload(payload: string): boolean {
  return payload.startsWith(ECIES_PREFIX);
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

async function deriveKeyFromSharedSecret(
  sharedSecret: Uint8Array,
): Promise<CryptoKey> {
  const hkdfKey = await crypto.subtle.importKey(
    "raw",
    sharedSecret,
    "HKDF",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(0),
      info: new TextEncoder().encode("budgeteer-ecies-v1"),
    },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
