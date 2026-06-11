import { describe, it, expect, beforeEach } from "vitest";
import { useAuthStore } from "./auth-store";

const TEST_USER = {
  id: "user-1",
  email: "test@test.com",
  public_key: "pk",
  encrypted_private_key: "ek",
  is_verified: true,
};

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

describe("auth store", () => {
  it("should start unauthenticated", () => {
    expect(useAuthStore.getState().isAuthenticated()).toBe(false);
  });

  it("should set auth state", () => {
    const store = useAuthStore.getState();
    store.setAuth("test-token", TEST_USER, "encrypted-key");

    const state = useAuthStore.getState();
    expect(state.token).toBe("test-token");
    expect(state.user?.email).toBe("test@test.com");
    expect(state.encryptedPrivateKey).toBe("encrypted-key");
    expect(state.isAuthenticated()).toBe(true);
  });

  it("should persist token and user email to localStorage", () => {
    const store = useAuthStore.getState();
    store.setAuth("persisted-token", TEST_USER, "ek");

    expect(localStorage.getItem("budgeteer_token")).toBe("persisted-token");
    const persisted = JSON.parse(localStorage.getItem("budgeteer_user")!);
    expect(persisted.email).toBe("test@test.com");
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
    store.setAuth("token", TEST_USER, "ek");
    store.setPrivateKey(new ArrayBuffer(32));

    store.logout();

    const state = useAuthStore.getState();
    expect(state.token).toBeNull();
    expect(state.user).toBeNull();
    expect(state.encryptedPrivateKey).toBeNull();
    expect(state.plaintextPrivateKey).toBeNull();
    expect(state.isAuthenticated()).toBe(false);
    expect(localStorage.getItem("budgeteer_token")).toBeNull();
    expect(localStorage.getItem("budgeteer_user")).toBeNull();
  });

  it("should be authenticated when token exists", () => {
    const store = useAuthStore.getState();
    store.setAuth("valid-token", TEST_USER, "ek");
    expect(useAuthStore.getState().isAuthenticated()).toBe(true);
  });
});
