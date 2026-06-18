import { describe, it, expect, beforeEach } from "vitest";
import {
  storeDeviceToken,
  getDeviceToken,
  clearDeviceToken,
  storePinData,
  getPinData,
  clearPinData,
  isPinEnabled,
  clearDeviceFingerprint,
} from "./utils";

beforeEach(() => {
  localStorage.clear();
});

describe("device token storage", () => {
  it("should store and retrieve a device token", () => {
    storeDeviceToken("fp123", "token-abc", "test@test.com");

    const result = getDeviceToken("test@test.com");
    expect(result).not.toBeNull();
    expect(result!.fingerprint).toBe("fp123");
    expect(result!.token).toBe("token-abc");
    expect(result!.email).toBe("test@test.com");
  });

  it("should return null for a different email", () => {
    storeDeviceToken("fp123", "token-abc", "user1@test.com");

    const result = getDeviceToken("user2@test.com");
    expect(result).toBeNull();
  });

  it("should return null when no token is stored", () => {
    const result = getDeviceToken("test@test.com");
    expect(result).toBeNull();
  });

  it("should clear the stored device token", () => {
    storeDeviceToken("fp123", "token-abc", "test@test.com");
    expect(getDeviceToken("test@test.com")).not.toBeNull();

    clearDeviceToken();
    expect(getDeviceToken("test@test.com")).toBeNull();
  });
});

describe("PIN data storage", () => {
  it("should store and retrieve PIN data", () => {
    storePinData("encrypted-password-value");

    const data = getPinData();
    expect(data).not.toBeNull();
    expect(data!.encrypted_password).toBe("encrypted-password-value");
  });

  it("should return null when no PIN data is stored", () => {
    expect(getPinData()).toBeNull();
  });

  it("should clear PIN data", () => {
    storePinData("encrypted-password-value");
    expect(getPinData()).not.toBeNull();

    clearPinData();
    expect(getPinData()).toBeNull();
  });

  it("isPinEnabled should reflect PIN data existence", () => {
    expect(isPinEnabled()).toBe(false);

    storePinData("encrypted-password-value");
    expect(isPinEnabled()).toBe(true);

    clearPinData();
    expect(isPinEnabled()).toBe(false);
  });
});

describe("clearDeviceFingerprint", () => {
  it("should not throw when called", () => {
    localStorage.setItem("budgeteer_device_fingerprint", "test-fp");
    clearDeviceFingerprint();
    expect(localStorage.getItem("budgeteer_device_fingerprint")).toBeNull();
  });
});
