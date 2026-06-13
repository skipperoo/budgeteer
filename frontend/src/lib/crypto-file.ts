/**
 * File encryption helpers for transaction document uploads.
 *
 * Documents are encrypted with the same AES-256 account key used for
 * transaction payloads. The encrypted data is uploaded to the server
 * and stored in the transaction_documents table.
 *
 * Pipeline: File → ArrayBuffer → Encrypt (AES-256-GCM) → Base64 → Upload
 *           Download → Base64 → Decrypt → Blob → Display/Download
 */

import { base64ToBytes, bytesToBase64 } from "./crypto";

/**
 * Encrypt a File using an AES-256-GCM account key.
 *
 * Returns the encrypted data as base64 plus metadata needed to
 * reconstruct the file after decryption.
 */
export async function encryptFile(
  file: File,
  accountKeyBase64: string,
): Promise<{
  encryptedData: string;
  mimeType: string;
  fileName: string;
  fileSize: number;
}> {
  const fileBytes = await file.arrayBuffer();
  const encryptedBase64 = await encryptBytes(
    new Uint8Array(fileBytes),
    accountKeyBase64,
  );

  return {
    encryptedData: encryptedBase64,
    mimeType: file.type || "application/octet-stream",
    fileName: file.name,
    fileSize: fileBytes.byteLength,
  };
}

/**
 * Decrypt an encrypted document file.
 *
 * @param encryptedBase64 - base64 of iv(12) || ciphertext (AES-256-GCM output)
 * @param accountKeyBase64 - base64-encoded AES-256 key
 * @param mimeType - original MIME type of the file
 * @returns A Blob that can be displayed or downloaded
 */
export async function decryptFile(
  encryptedBase64: string,
  accountKeyBase64: string,
  mimeType: string,
): Promise<Blob> {
  const plainBytes = await decryptBytes(encryptedBase64, accountKeyBase64);
  return new Blob([plainBytes], { type: mimeType });
}

// ---------------------------------------------------------------------------
// Internal: encrypt/decrypt raw bytes with AES-256-GCM
// ---------------------------------------------------------------------------

/**
 * Encrypt a Uint8Array with AES-256-GCM.
 *
 * Format: base64( iv(12) || ciphertext )
 */
async function encryptBytes(
  plaintext: Uint8Array,
  keyBase64: string,
): Promise<string> {
  assertCrypto();
  const keyBytes = base64ToBytes(keyBase64);
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, [
    "encrypt",
  ]);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    plaintext,
  );

  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);
  return bytesToBase64(combined);
}

/**
 * Decrypt a Uint8Array encrypted with AES-256-GCM.
 *
 * Input format: base64( iv(12) || ciphertext )
 * Returns the original plaintext bytes.
 */
async function decryptBytes(
  encryptedBase64: string,
  keyBase64: string,
): Promise<Uint8Array> {
  assertCrypto();
  const keyBytes = base64ToBytes(keyBase64);
  const combined = base64ToBytes(encryptedBase64);
  const iv = combined.slice(0, 12);
  const data = combined.slice(12);

  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, [
    "decrypt",
  ]);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    data,
  );
  return new Uint8Array(decrypted);
}

/**
 * Check that Web Crypto API is available.
 */
function assertCrypto(): void {
  if (!crypto.subtle) {
    throw new Error(
      "Encryption is unavailable because the page is not served over a " +
        "secure connection (HTTPS). Please access via https:// or localhost.",
    );
  }
}
