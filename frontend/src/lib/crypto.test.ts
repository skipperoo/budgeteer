import { describe, it, expect } from "vitest";
import {
  encryptWithPassword,
  decryptWithPassword,
  generateKeyPair,
  encryptData,
  decryptData,
  generateAccountKey,
  generateSalt,
} from "./crypto";

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

describe("key pair generation", () => {
  it("should generate a public and private key", async () => {
    const keyPair = await generateKeyPair();
    expect(keyPair.publicKey).toBeTruthy();
    expect(keyPair.privateKey).toBeTruthy();
    expect(keyPair.publicKey).not.toBe(keyPair.privateKey);
  });

  it("should generate different key pairs each time", async () => {
    const [kp1, kp2] = await Promise.all([generateKeyPair(), generateKeyPair()]);
    expect(kp1.publicKey).not.toBe(kp2.publicKey);
    expect(kp1.privateKey).not.toBe(kp2.privateKey);
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
    const decoded = atob(key);
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
    const decoded = atob(salt);
    expect(decoded.length).toBe(16);
  });
});
