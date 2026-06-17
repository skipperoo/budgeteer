import { describe, it, expect } from "vitest";
import { x25519 } from "@noble/curves/ed25519";
import { bytesToBase64, base64ToBytes } from "./crypto";
import {
  encryptForRecipient,
  decryptECIESPayload,
  isECIESPayload,
} from "./crypto-rules";

describe("isECIESPayload", () => {
  it("should return true for payload with 1| prefix", () => {
    expect(isECIESPayload("1|abc123")).toBe(true);
    expect(isECIESPayload("1|")).toBe(true);
  });

  it("should return false for payload without 1| prefix", () => {
    expect(isECIESPayload("abc")).toBe(false);
    expect(isECIESPayload("")).toBe(false);
    expect(isECIESPayload("2|data")).toBe(false);
  });
});

describe("encryptForRecipient", () => {
  it("should encrypt a payload and produce ECIES output", async () => {
    const privKey = x25519.utils.randomPrivateKey();
    const pubKey = x25519.getPublicKey(privKey);
    const pubKeyBase64 = bytesToBase64(pubKey);

    const payload = { amount: 100, currency: "USD" };
    const result = await encryptForRecipient(payload, pubKeyBase64);

    expect(result).toBeTruthy();
    expect(result.startsWith("1|")).toBe(true);

    // The part after "1|" should be valid base64
    const raw = result.slice(2);
    expect(() => base64ToBytes(raw)).not.toThrow();

    // Decode and verify length (32 ephemeral pub + 12 iv + >=16 ciphertext+tag)
    const decoded = base64ToBytes(raw);
    expect(decoded.length).toBeGreaterThanOrEqual(32 + 12 + 16);
  });
});

describe("decryptECIESPayload", () => {
  it("should decrypt what encryptForRecipient encrypted (roundtrip)", async () => {
    const privKey = x25519.utils.randomPrivateKey();
    const pubKey = x25519.getPublicKey(privKey);
    const pubKeyBase64 = bytesToBase64(pubKey);
    const privKeyBase64 = bytesToBase64(privKey);

    const payload = { message: "hello", value: 42 };
    const encrypted = await encryptForRecipient(payload, pubKeyBase64);

    const decrypted = await decryptECIESPayload<typeof payload>(
      encrypted,
      privKeyBase64,
    );

    expect(decrypted).toEqual(payload);
  });

  it("should decrypt a string payload roundtrip", async () => {
    const privKey = x25519.utils.randomPrivateKey();
    const pubKey = x25519.getPublicKey(privKey);
    const pubKeyBase64 = bytesToBase64(pubKey);
    const privKeyBase64 = bytesToBase64(privKey);

    const payload = "plain string data";
    const encrypted = await encryptForRecipient(payload, pubKeyBase64);
    const decrypted = await decryptECIESPayload<string>(encrypted, privKeyBase64);

    expect(decrypted).toBe(payload);
  });

  it("should fail without 1| prefix", async () => {
    const privKey = x25519.utils.randomPrivateKey();
    const privKeyBase64 = bytesToBase64(privKey);

    // Passing a plain string (no ECIES prefix) should throw
    await expect(
      decryptECIESPayload("not-an-ecies-payload", privKeyBase64),
    ).rejects.toThrow("not ECIES-encrypted");
  });

  it("should fail when payload is too short", async () => {
    const privKey = x25519.utils.randomPrivateKey();
    const privKeyBase64 = bytesToBase64(privKey);

    // "1|" + valid base64 of a very short byte array (< 32+12+16)
    const shortPayload = "1|" + bytesToBase64(new Uint8Array(10));

    await expect(
      decryptECIESPayload(shortPayload, privKeyBase64),
    ).rejects.toThrow("ECIES payload too short");
  });

  it("should fail when decrypting with wrong key", async () => {
    const senderPriv = x25519.utils.randomPrivateKey();
    const senderPub = x25519.getPublicKey(senderPriv);

    const wrongPriv = x25519.utils.randomPrivateKey();
    const wrongPubKeyBase64 = bytesToBase64(x25519.getPublicKey(wrongPriv));
    const wrongPrivKeyBase64 = bytesToBase64(wrongPriv);

    const payload = { secret: "data" };
    const encrypted = await encryptForRecipient(
      payload,
      bytesToBase64(senderPub),
    );

    // Decrypting with a completely unrelated keypair should fail (AES-GCM auth tag mismatch)
    await expect(
      decryptECIESPayload(encrypted, wrongPrivKeyBase64),
    ).rejects.toThrow();
  });
});
