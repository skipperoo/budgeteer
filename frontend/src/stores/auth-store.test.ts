import { describe, it, expect, beforeEach } from "vitest";
import { useAuthStore } from "./auth-store";

beforeEach(() => {
  localStorage.clear();
  useAuthStore.setState({
    token: null,
    user: null,
    encryptedPrivateKey: null,
    plaintextPrivateKey: null,
  });
});

describe("auth store", () => {
  it("should start unauthenticated", () => {
    expect(useAuthStore.getState().isAuthenticated()).toBe(false);
  });

  it("should set auth state", () => {
    const store = useAuthStore.getState();
    store.setAuth("test-token", {
      id: "user-1",
      email: "test@test.com",
      public_key: "pk",
      encrypted_private_key: "ek",
      is_verified: true,
    }, "encrypted-key");

    const state = useAuthStore.getState();
    expect(state.token).toBe("test-token");
    expect(state.user?.email).toBe("test@test.com");
    expect(state.encryptedPrivateKey).toBe("encrypted-key");
    expect(state.isAuthenticated()).toBe(true);
  });

  it("should persist token to localStorage", () => {
    const store = useAuthStore.getState();
    store.setAuth("persisted-token", {
      id: "user-2",
      email: "persist@test.com",
      public_key: "pk",
      encrypted_private_key: "ek",
      is_verified: true,
    }, "ek");

    expect(localStorage.getItem("budgeteer_token")).toBe("persisted-token");
  });

  it("should set and clear private key", () => {
    const store = useAuthStore.getState();
    const key = new ArrayBuffer(32);
    store.setPrivateKey(key);
    expect(useAuthStore.getState().plaintextPrivateKey).toBe(key);

    store.clearPrivateKey();
    expect(useAuthStore.getState().plaintextPrivateKey).toBeNull();
  });

  it("should clear everything on logout", () => {
    const store = useAuthStore.getState();
    store.setAuth("token", {
      id: "u1",
      email: "logout@test.com",
      public_key: "pk",
      encrypted_private_key: "ek",
      is_verified: true,
    }, "ek");
    store.setPrivateKey(new ArrayBuffer(32));

    store.logout();

    const state = useAuthStore.getState();
    expect(state.token).toBeNull();
    expect(state.user).toBeNull();
    expect(state.encryptedPrivateKey).toBeNull();
    expect(state.plaintextPrivateKey).toBeNull();
    expect(state.isAuthenticated()).toBe(false);
    expect(localStorage.getItem("budgeteer_token")).toBeNull();
  });

  it("should be authenticated when token exists", () => {
    const store = useAuthStore.getState();
    store.setAuth("valid-token", {
      id: "u1",
      email: "auth@test.com",
      public_key: "pk",
      encrypted_private_key: "ek",
      is_verified: true,
    }, "ek");
    expect(useAuthStore.getState().isAuthenticated()).toBe(true);
  });
});
