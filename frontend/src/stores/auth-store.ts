import { create } from "zustand";
import { getToken, setToken, removeToken } from "@/lib/api";
import type { User } from "@/types";

interface AuthState {
  token: string | null;
  user: User | null;
  encryptedPrivateKey: string | null;
  plaintextPrivateKey: ArrayBuffer | null;
  setAuth: (token: string, user: User, encryptedKey: string) => void;
  setPrivateKey: (key: ArrayBuffer) => void;
  clearPrivateKey: () => void;
  logout: () => void;
  isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: getToken(),
  user: null,
  encryptedPrivateKey: null,
  plaintextPrivateKey: null,

  setAuth: (token, user, encryptedKey) => {
    setToken(token);
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
}));
