import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useAuthStore } from "@/stores/auth-store";
import { storePinData, clearPinData } from "@/lib/utils";
import PrivateKeyGate from "./PrivateKeyGate";

// Mock crypto.ts — avoid browser crypto.subtle dependency
vi.mock("@/lib/crypto", () => ({
  decryptWithPassword: vi.fn(async (_ciphertext: string, _password: string) => {
    if (_password === "correct-password" || _password === "correct-pin-decrypted") {
      return "plaintext-private-key";
    }
    throw new Error("Incorrect password");
  }),
  base64ToBytes: vi.fn(() => new Uint8Array(32)),
  encryptWithPassword: vi.fn(async (plaintext: string, _key: string) => {
    return "encrypted-" + plaintext;
  }),
}));

// Mock the auth store with a logged-in state
function setupAuthStore() {
  useAuthStore.setState({
    token: "test-token",
    user: {
      id: "user-1",
      email: "test@test.com",
      public_key: "pk",
      encrypted_private_key: "encrypted-key",
      is_verified: true,
      preferences: { accent_color: "slate" },
    },
    encryptedPrivateKey: "encrypted-key",
    plaintextPrivateKey: null,
    hydrating: false,
  });
}

beforeEach(() => {
  localStorage.clear();
  useAuthStore.setState({
    token: null,
    user: null,
    encryptedPrivateKey: null,
    plaintextPrivateKey: null,
    hydrating: false,
  });
});

describe("PrivateKeyGate", () => {
  it("should render children when private key is already decrypted", () => {
    useAuthStore.setState({
      token: "test-token",
      user: { id: "1", email: "test@test.com", public_key: "pk", encrypted_private_key: "ek", is_verified: true, preferences: { accent_color: "slate" } },
      encryptedPrivateKey: "ek",
      plaintextPrivateKey: new ArrayBuffer(32),
      hydrating: false,
    });

    render(
      <PrivateKeyGate>
        <div data-testid="content">Protected Content</div>
      </PrivateKeyGate>
    );

    expect(screen.getByTestId("content")).toBeDefined();
  });

  it("should show password unlock form when private key is not decrypted", () => {
    setupAuthStore();

    render(
      <PrivateKeyGate>
        <div>Protected Content</div>
      </PrivateKeyGate>
    );

    expect(screen.getByText("Enter your password")).toBeDefined();
    expect(screen.getByPlaceholderText("Enter your password")).toBeDefined();
  });

  it("should NOT show PIN form on a fresh device (no PIN data in localStorage)", () => {
    // localStorage is cleared in beforeEach — simulates a new device
    setupAuthStore();

    render(
      <PrivateKeyGate>
        <div>Protected Content</div>
      </PrivateKeyGate>
    );

    // Should show password form, NOT PIN form
    expect(screen.getByText("Enter your password")).toBeDefined();
    expect(screen.queryByText("Enter your PIN")).toBeNull();
    expect(screen.queryByText("Back to PIN")).toBeNull();
  });

  it("should unlock with correct password", async () => {
    setupAuthStore();
    const setPrivateKeySpy = vi.spyOn(useAuthStore.getState(), "setPrivateKey");

    render(
      <PrivateKeyGate>
        <div data-testid="content">Protected Content</div>
      </PrivateKeyGate>
    );

    const input = screen.getByPlaceholderText("Enter your password");
    const button = screen.getByText("Unlock");

    await userEvent.type(input, "correct-password");
    await userEvent.click(button);

    await waitFor(() => {
      expect(setPrivateKeySpy).toHaveBeenCalled();
    });

    // After unlocking, children should render
    await waitFor(() => {
      expect(screen.getByTestId("content")).toBeDefined();
    });
  });

  it("should show error with incorrect password", async () => {
    setupAuthStore();

    render(
      <PrivateKeyGate>
        <div>Protected Content</div>
      </PrivateKeyGate>
    );

    const input = screen.getByPlaceholderText("Enter your password");
    const button = screen.getByText("Unlock");

    await userEvent.type(input, "wrong-password");
    await userEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText("Incorrect password")).toBeDefined();
    });
  });

  it("should show PIN unlock form when PIN is enabled", async () => {
    setupAuthStore();
    storePinData("encrypted-password-value", "test@test.com");

    render(
      <PrivateKeyGate>
        <div>Protected Content</div>
      </PrivateKeyGate>
    );

    // Should show PIN input by default
    expect(screen.getByText("Enter your PIN")).toBeDefined();
    expect(screen.getByPlaceholderText("Enter your PIN")).toBeDefined();
    expect(screen.getByText("Use password instead")).toBeDefined();
  });

  it("should NOT show PIN form when PIN data belongs to a different user", () => {
    // Simulate user A's PIN data still in localStorage
    storePinData("encrypted-password-user-a", "user-a@test.com");

    // But the current auth store is for user B (email: test@test.com)
    setupAuthStore();

    render(
      <PrivateKeyGate>
        <div>Protected Content</div>
      </PrivateKeyGate>
    );

    // Should show password form, NOT PIN form
    expect(screen.getByText("Enter your password")).toBeDefined();
    expect(screen.queryByText("Enter your PIN")).toBeNull();
    expect(screen.queryByText("Back to PIN")).toBeNull();
  });

  it("should unlock with correct PIN", async () => {
    setupAuthStore();
    // Store encrypted password that decrypts to the correct password when PIN is entered
    storePinData("encrypted-password-value", "test@test.com");

    // decryptWithPassword mock will succeed when password is "correct-pin-decrypted"
    // which is the result of decrypting "encrypted-password-value" with the correct PIN
    // We need to make the mock return the correct password

    // Actually the flow is:
    // 1. User enters PIN "1234"
    // 2. decryptWithPassword("encrypted-password-value", "1234") -> "correct-password"
    // 3. decryptWithPassword("encrypted-key", "correct-password") -> "plaintext-private-key"
    // This should work with the mocks as set up

    // Override the mock for the first call to return the correct password
    const decryptMock = vi.mocked(await import("@/lib/crypto")).decryptWithPassword;
    decryptMock.mockImplementation(async (ciphertext: string, secret: string) => {
      if (ciphertext === "encrypted-password-value" && secret === "1234") {
        return "correct-password";
      }
      if (ciphertext === "encrypted-key" && secret === "correct-password") {
        return "plaintext-private-key";
      }
      throw new Error("Incorrect password");
    });

    render(
      <PrivateKeyGate>
        <div data-testid="content">Protected Content</div>
      </PrivateKeyGate>
    );

    const input = screen.getByPlaceholderText("Enter your PIN");
    const button = screen.getByText("Unlock with PIN");

    await userEvent.type(input, "1234");
    await userEvent.click(button);

    await waitFor(() => {
      expect(screen.getByTestId("content")).toBeDefined();
    });
  });

  it("should switch to password form when clicking 'Use password instead'", async () => {
    setupAuthStore();
    storePinData("encrypted-password-value", "test@test.com");

    render(
      <PrivateKeyGate>
        <div>Protected Content</div>
      </PrivateKeyGate>
    );

    // Click "Use password instead"
    await userEvent.click(screen.getByText("Use password instead"));

    expect(screen.getByText("Enter your password")).toBeDefined();
    expect(screen.getByPlaceholderText("Enter your password")).toBeDefined();
    // Should also show "Back to PIN" button
    expect(screen.getByText("Back to PIN")).toBeDefined();
  });

  it("should show loading state during hydrating", () => {
    useAuthStore.setState({ hydrating: true });

    render(
      <PrivateKeyGate>
        <div>Protected Content</div>
      </PrivateKeyGate>
    );

    expect(screen.getByText("Loading...")).toBeDefined();
  });

  it("should show encryption key missing when no encryptedPrivateKey", () => {
    useAuthStore.setState({
      token: "test-token",
      user: { id: "1", email: "test@test.com", public_key: "pk", encrypted_private_key: "ek", is_verified: true, preferences: { accent_color: "slate" } },
      encryptedPrivateKey: null,
      plaintextPrivateKey: null,
      hydrating: false,
    });

    render(
      <PrivateKeyGate>
        <div>Protected Content</div>
      </PrivateKeyGate>
    );

    expect(screen.getByText("Encryption Key Missing")).toBeDefined();
  });
});
