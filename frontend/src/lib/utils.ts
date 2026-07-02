import FingerprintJS from "@fingerprintjs/fingerprintjs";
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ---------------------------------------------------------------------------
// Device fingerprint (for remember-device feature)
// Uses @fingerprintjs/fingerprintjs for stable browser fingerprinting.
// ---------------------------------------------------------------------------

const DEVICE_FINGERPRINT_KEY = "budgeteer_device_fingerprint";

let fpAgent: Awaited<ReturnType<typeof FingerprintJS.load>> | null = null;

async function getAgent(): Promise<Awaited<ReturnType<typeof FingerprintJS.load>>> {
  if (!fpAgent) {
    fpAgent = await FingerprintJS.load();
  }
  return fpAgent;
}

/**
 * Generate a stable device fingerprint using FingerprintJS.
 * The result is cached in localStorage to avoid recomputing it
 * on every page load.
 */
export async function getDeviceFingerprint(): Promise<string> {
  try {
    const cached = localStorage.getItem(DEVICE_FINGERPRINT_KEY);
    if (cached) return cached;

    const agent = await getAgent();
    const result = await agent.get();
    const visitorId = result.visitorId;

    localStorage.setItem(DEVICE_FINGERPRINT_KEY, visitorId);
    return visitorId;
  } catch {
    // Fallback: use a random identifier per session
    const fallback = Math.random().toString(36).substring(2, 10);
    return fallback;
  }
}

/**
 * Clear the cached device fingerprint (e.g. on logout).
 */
export function clearDeviceFingerprint(): void {
  try {
    localStorage.removeItem(DEVICE_FINGERPRINT_KEY);
  } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Device token storage (encrypted device secret for remember-device)
// ---------------------------------------------------------------------------

const DEVICE_TOKEN_KEY = "budgeteer_device_token";

interface StoredDeviceToken {
  fingerprint: string;
  token: string;
  email: string;
}

/**
 * Store the device token (plaintext, used for device-based login) in localStorage.
 * The token is what gets sent to the server; the server has a bcrypt hash of
 * (token + fingerprint + password) for verification.
 */
export function storeDeviceToken(fingerprint: string, token: string, email: string): void {
  try {
    const data: StoredDeviceToken = { fingerprint, token, email };
    localStorage.setItem(DEVICE_TOKEN_KEY, JSON.stringify(data));
  } catch { /* ignore quota errors */ }
}

/**
 * Retrieve the stored device token for a given email.
 */
export function getDeviceToken(email: string): StoredDeviceToken | null {
  try {
    const raw = localStorage.getItem(DEVICE_TOKEN_KEY);
    if (!raw) return null;
    const data: StoredDeviceToken = JSON.parse(raw);
    if (data.email !== email) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Remove the stored device token (on logout or device removal).
 */
export function clearDeviceToken(): void {
  try {
    localStorage.removeItem(DEVICE_TOKEN_KEY);
  } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// PIN unlock helpers
// ---------------------------------------------------------------------------

const PIN_STORAGE_KEY = "budgeteer_pin_data";

interface PinData {
  /** The user's password, encrypted with the PIN via PBKDF2+AES-GCM */
  encrypted_password: string;
  /** The user email this PIN was set up for (prevents PIN prompt for wrong account) */
  email: string;
}

/**
 * Store the encrypted password (encrypted with the user's PIN).
 * The user's password is stored encrypted so the PIN can be used to
 * decrypt it later without requiring the original password again.
 *
 * @param encryptedPassword The user's password encrypted with the PIN
 * @param email The user's email — stored alongside to verify ownership
 */
export function storePinData(encryptedPassword: string, email: string): void {
  try {
    localStorage.setItem(PIN_STORAGE_KEY, JSON.stringify({
      encrypted_password: encryptedPassword,
      email,
    } as PinData));
  } catch { /* ignore quota errors */ }
}

/**
 * Get the stored encrypted password for PIN unlock.
 */
export function getPinData(): PinData | null {
  try {
    const raw = localStorage.getItem(PIN_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PinData;
  } catch {
    return null;
  }
}

/**
 * Remove the PIN data (when the user disables PIN or changes password).
 */
export function clearPinData(): void {
  try {
    localStorage.removeItem(PIN_STORAGE_KEY);
  } catch { /* ignore */ }
}

/**
 * Check whether PIN unlock is set up for this device.
 */
export function isPinEnabled(): boolean {
  return getPinData() !== null;
}
