import { create } from "zustand";
import { getToken, setToken, removeToken } from "@/lib/api";
import { apiFetch } from "@/lib/api";
import { ENDPOINTS } from "@/lib/constants";
import { syncLocaleFromPreferences } from "@/lib/format";
import type { User } from "@/types";

// Persist minimal user info to localStorage so the header can show the email
// immediately on refresh while /me loads in the background.
const USER_STORAGE_KEY = "budgeteer_user";

interface PersistedUser {
  email: string;
}

function getUser(): PersistedUser | null {
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setUser(user: PersistedUser): void {
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
}

function removeStoredUser(): void {
  localStorage.removeItem(USER_STORAGE_KEY);
}

interface AuthState {
  token: string | null;
  user: User | null;
  encryptedPrivateKey: string | null;
  plaintextPrivateKey: ArrayBuffer | null;
  /** True while a session hydration request is in-flight. */
  hydrating: boolean;
  setAuth: (token: string, user: User, encryptedKey: string) => void;
  setPrivateKey: (key: ArrayBuffer) => void;
  clearPrivateKey: () => void;
  logout: () => void;
  isAuthenticated: () => boolean;
  /** Fetch full user profile from /me and populate the store. */
  hydrate: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: getToken(),
  user: null,
  encryptedPrivateKey: null,
  plaintextPrivateKey: null,
  hydrating: false,

  setAuth: (token, user, encryptedKey) => {
    setToken(token);
    setUser({ email: user.email });
    syncLocaleFromPreferences(user.preferences?.locale);
    set({ token, user, encryptedPrivateKey: encryptedKey });
  },

  setPrivateKey: (key) => {
    set({ plaintextPrivateKey: key });
  },

  clearPrivateKey: () => {
    set({ plaintextPrivateKey: null });
  },

  logout: () => {
    removeToken();
    removeStoredUser();
    set({
      token: null,
      user: null,
      encryptedPrivateKey: null,
      plaintextPrivateKey: null,
    });
  },

  isAuthenticated: () => {
    return get().token !== null;
  },

  hydrate: async () => {
    const tok = get().token;
    if (!tok) return;

    set({ hydrating: true });
    try {
      const user = await apiFetch<User>(ENDPOINTS.me, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      setUser({ email: user.email });
      syncLocaleFromPreferences(user.preferences?.locale);
      set({ user, encryptedPrivateKey: user.encrypted_private_key });
    } catch {
      // Token is invalid — clear auth state
      removeToken();
      removeStoredUser();
      set({ token: null, user: null, encryptedPrivateKey: null });
    } finally {
      set({ hydrating: false });
    }
  },
}));
