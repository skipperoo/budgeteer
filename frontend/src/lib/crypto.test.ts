import { describe, it, expect } from "vitest";
import {
  encryptWithPassword,
  decryptWithPassword,
  generateKeyPair,
  encryptData,
  decryptData,
  generateAccountKey,
  generateSalt,
  bytesToBase64,
  base64ToBytes,
  deriveSharedSecret,
  compress,
  decompress,
  encryptAccountKeyForRecipient,
  decryptAccountKeyForRecipient,
} from "./crypto";

describe("base64 helpers", () => {
  it("should round-trip bytes to base64 and back", () => {
    const original = new Uint8Array([0, 1, 2, 3, 255, 128, 64]);
    const b64 = bytesToBase64(original);
    const decoded = base64ToBytes(b64);
    expect(decoded).toEqual(original);
  });

  it("should handle empty byte array", () => {
    const original = new Uint8Array(0);
    const b64 = bytesToBase64(original);
    const decoded = base64ToBytes(b64);
    expect(decoded).toEqual(original);
    expect(b64).toBe("");
  });
});

describe("password-based encryption", () => {
  it("should encrypt and decrypt with a password", async () => {
    const plaintext = "Hello, Budgeteer!";
    const password = "my-secure-password-123!";

    const ciphertext = await encryptWithPassword(plaintext, password);
    expect(ciphertext).toBeTruthy();
    expect(ciphertext).not.toBe(plaintext);

    const decrypted = await decryptWithPassword(ciphertext, password);
    expect(decrypted).toBe(plaintext);
  });

  it("should produce different ciphertexts for same plaintext", async () => {
    const plaintext = "same message";
    const password = "password";

    const c1 = await encryptWithPassword(plaintext, password);
    const c2 = await encryptWithPassword(plaintext, password);
    expect(c1).not.toBe(c2);
  });

  it("should fail to decrypt with wrong password", async () => {
    const plaintext = "secret data";
    const ciphertext = await encryptWithPassword(plaintext, "correct-password");

    await expect(
      decryptWithPassword(ciphertext, "wrong-password")
    ).rejects.toThrow();
  });
});

describe("key pair generation (X25519)", () => {
  it("should generate a public and private key", () => {
    const keyPair = generateKeyPair();
    expect(keyPair.publicKey).toBeTruthy();
    expect(keyPair.privateKey).toBeTruthy();
    expect(keyPair.publicKey).not.toBe(keyPair.privateKey);
  });

  it("should generate valid base64 keys", () => {
    const keyPair = generateKeyPair();
    // X25519 public key is 32 bytes → 44 base64 chars with padding
    expect(() => base64ToBytes(keyPair.publicKey)).not.toThrow();
    expect(() => base64ToBytes(keyPair.privateKey)).not.toThrow();
    expect(base64ToBytes(keyPair.publicKey).length).toBe(32);
    expect(base64ToBytes(keyPair.privateKey).length).toBe(32);
  });

  it("should generate different key pairs each time", () => {
    const kp1 = generateKeyPair();
    const kp2 = generateKeyPair();
    expect(kp1.publicKey).not.toBe(kp2.publicKey);
    expect(kp1.privateKey).not.toBe(kp2.privateKey);
  });
});

describe("X25519 shared secret derivation", () => {
  it("should derive a shared secret between two parties", () => {
    const alice = generateKeyPair();
    const bob = generateKeyPair();

    const alicePriv = base64ToBytes(alice.privateKey);
    const bobPub = base64ToBytes(bob.publicKey);
    const bobPriv = base64ToBytes(bob.privateKey);
    const alicePub = base64ToBytes(alice.publicKey);

    const secretFromAlice = deriveSharedSecret(alicePriv, bobPub);
    const secretFromBob = deriveSharedSecret(bobPriv, alicePub);

    expect(secretFromAlice).toEqual(secretFromBob);
    expect(secretFromAlice.length).toBe(32);
  });

  it("should produce different secrets for different pairs", () => {
    const alice = generateKeyPair();
    const bob = generateKeyPair();
    const carol = generateKeyPair();

    const secretAB = deriveSharedSecret(
      base64ToBytes(alice.privateKey),
      base64ToBytes(bob.publicKey)
    );
    const secretAC = deriveSharedSecret(
      base64ToBytes(alice.privateKey),
      base64ToBytes(carol.publicKey)
    );

    expect(secretAB).not.toEqual(secretAC);
  });
});

describe("ECIES account key encryption", () => {
  it("should encrypt and decrypt an account key for a recipient", async () => {
    const accountKey = generateAccountKey();
    const recipient = generateKeyPair();

    const encrypted = await encryptAccountKeyForRecipient(
      accountKey,
      recipient.publicKey
    );

    expect(encrypted.ephemeralPublicKey).toBeTruthy();
    expect(encrypted.ciphertext).toBeTruthy();

    const decrypted = await decryptAccountKeyForRecipient(
      encrypted.ciphertext,
      encrypted.ephemeralPublicKey,
      recipient.privateKey
    );

    expect(decrypted).toBe(accountKey);
  });

  it("should fail to decrypt with wrong private key", async () => {
    const accountKey = generateAccountKey();
    const alice = generateKeyPair();
    const bob = generateKeyPair();

    const encrypted = await encryptAccountKeyForRecipient(
      accountKey,
      alice.publicKey
    );

    // Bob tries to decrypt Alice's encrypted key — should fail
    await expect(
      decryptAccountKeyForRecipient(
        encrypted.ciphertext,
        encrypted.ephemeralPublicKey,
        bob.privateKey
      )
    ).rejects.toThrow();
  });

  it("should produce different ciphertexts for the same key", async () => {
    const accountKey = generateAccountKey();
    const recipient = generateKeyPair();

    const e1 = await encryptAccountKeyForRecipient(accountKey, recipient.publicKey);
    const e2 = await encryptAccountKeyForRecipient(accountKey, recipient.publicKey);

    // Different ephemeral keys → different ciphertexts
    expect(e1.ephemeralPublicKey).not.toBe(e2.ephemeralPublicKey);
    expect(e1.ciphertext).not.toBe(e2.ciphertext);
  });
});

describe("key-based encryption", () => {
  it("should encrypt and decrypt with a key", async () => {
    const plaintext = "transaction data";
    const key = generateAccountKey();

    const ciphertext = await encryptData(plaintext, key);
    expect(ciphertext).toBeTruthy();

    const decrypted = await decryptData(ciphertext, key);
    expect(decrypted).toBe(plaintext);
  });

  it("should produce different ciphertexts for same data with same key", async () => {
    const plaintext = "same data";
    const key = generateAccountKey();

    const c1 = await encryptData(plaintext, key);
    const c2 = await encryptData(plaintext, key);
    expect(c1).not.toBe(c2);
  });

  it("should fail to decrypt with wrong key", async () => {
    const plaintext = "secret";
    const key1 = generateAccountKey();
    const key2 = generateAccountKey();

    const ciphertext = await encryptData(plaintext, key1);
    await expect(decryptData(ciphertext, key2)).rejects.toThrow();
  });
});

describe("account key generation", () => {
  it("should generate a 32-byte base64 key", () => {
    const key = generateAccountKey();
    expect(key).toBeTruthy();
    const decoded = base64ToBytes(key);
    expect(decoded.length).toBe(32);
  });

  it("should generate unique keys", () => {
    const k1 = generateAccountKey();
    const k2 = generateAccountKey();
    expect(k1).not.toBe(k2);
  });
});

describe("salt generation", () => {
  it("should generate a 16-byte base64 salt", () => {
    const salt = generateSalt();
    expect(salt).toBeTruthy();
    const decoded = base64ToBytes(salt);
    expect(decoded.length).toBe(16);
  });
});

describe("change password re-encryption roundtrip", () => {
  it("should decrypt with old password, re-encrypt with new password, and decrypt with new password", async () => {
    // Simulate the change password flow:
    // 1. Private key encrypted with old password on the server
    // 2. User decrypts it with old password (login flow)
    // 3. User re-encrypts the same private key with new password
    // 4. New encrypted blob is stored on the server
    // 5. User can decrypt it with new password on next login

    const privateKey = "my-super-secret-x25519-private-key-data";
    const oldPassword = "old-password-123!";
    const newPassword = "new-password-456!";

    // Step 1: Simulate the existing encrypted blob on the server
    const oldEncryptedKey = await encryptWithPassword(privateKey, oldPassword);

    // Step 2: Decrypt with old password (simulates first-time login or current session)
    const decryptedKey = await decryptWithPassword(oldEncryptedKey, oldPassword);
    expect(decryptedKey).toBe(privateKey);

    // Step 3: Re-encrypt the SAME private key with the new password
    const newEncryptedKey = await encryptWithPassword(decryptedKey, newPassword);
    expect(newEncryptedKey).not.toBe(oldEncryptedKey);

    // Step 4: Verify the new encrypted blob is different from the old one
    // (different salt+iv ensures ciphertext uniqueness even with same password,
    // but here we also changed the password so it MUST be different)
    expect(newEncryptedKey.length).toBeGreaterThan(0);

    // Step 5: Decrypt with new password (simulates next login with new password)
    const reDecrypted = await decryptWithPassword(newEncryptedKey, newPassword);
    expect(reDecrypted).toBe(privateKey);
  });

  it("should fail to decrypt the new encrypted key with the old password", async () => {
    // Ensures that after a password change, the old password cannot
    // decrypt the new encrypted private key (key separation)
    const privateKey = "another-private-key";
    const oldPassword = "old-pass";
    const newPassword = "new-pass";

    const oldEncrypted = await encryptWithPassword(privateKey, oldPassword);
    const plaintext = await decryptWithPassword(oldEncrypted, oldPassword);
    const newEncrypted = await encryptWithPassword(plaintext, newPassword);

    // Decrypting the new blob with the old password should fail
    await expect(
      decryptWithPassword(newEncrypted, oldPassword)
    ).rejects.toThrow();
  });

  it("should fail to decrypt the old encrypted key with the new password", async () => {
    // Ensures that after re-encryption, the old encrypted blob
    // is no longer usable with the new password
    const privateKey = "yet-another-key";
    const oldPassword = "old-secret";
    const newPassword = "new-secret";

    const oldEncrypted = await encryptWithPassword(privateKey, oldPassword);

    // Decrypting the old blob with the new password should fail
    await expect(
      decryptWithPassword(oldEncrypted, newPassword)
    ).rejects.toThrow();
  });
});

describe("compression stubs", () => {
  it("compress should be a pass-through for now", () => {
    const data = "test data for compression";
    expect(compress(data)).toBe(data);
  });

  it("decompress should be a pass-through for now", () => {
    const data = "test data for decompression";
    expect(decompress(data)).toBe(data);
  });
});
