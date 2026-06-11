import { create } from "zustand";
import { apiFetch } from "@/lib/api";
import { ENDPOINTS } from "@/lib/constants";
import { generateAccountKey, encryptAccountKeyForRecipient } from "@/lib/crypto";
import type { Account, AccountUser, CreateAccountRequest } from "@/types";

interface AccountState {
  accounts: Account[];
  currentAccount: Account | null;
  accountUsers: AccountUser[];
  loading: boolean;
  error: string | null;
  fetchAccounts: () => Promise<void>;
  createAccount: (currency: string, type: string) => Promise<Account | void>;
  updateAccount: (id: string, currency: string, type: string) => Promise<void>;
  deleteAccount: (id: string) => Promise<void>;
  fetchAccountUsers: (id: string) => Promise<void>;
  inviteUser: (accountId: string, userEmail: string, encryptedKey: string) => Promise<void>;
  removeUser: (accountId: string, userId: string) => Promise<void>;
}

export const useAccountStore = create<AccountState>((set, get) => ({
  accounts: [],
  currentAccount: null,
  accountUsers: [],
  loading: false,
  error: null,

  fetchAccounts: async () => {
    set({ loading: true, error: null });
    try {
      const data = await apiFetch<Account[]>(ENDPOINTS.accounts);
      set({ accounts: data ?? [], loading: false });
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  },

  createAccount: async (currency, type) => {
    set({ loading: true, error: null });
    try {
      // Generate an account key and encrypt it for the current user
      const { useAuthStore } = await import("@/stores/auth-store");
      const user = useAuthStore.getState().user;
      let encryptedAccountKey = "";
      if (user?.public_key) {
        const accountKey = generateAccountKey();
        const enc = await encryptAccountKeyForRecipient(accountKey, user.public_key);
        encryptedAccountKey = `${enc.ephemeralPublicKey}:${enc.ciphertext}`;
      }

      await apiFetch(ENDPOINTS.accounts, {
        method: "POST",
        body: JSON.stringify({ currency, type, encrypted_account_key: encryptedAccountKey } as CreateAccountRequest),
      });
      await get().fetchAccounts();
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  },

  updateAccount: async (id, currency, type) => {
    set({ loading: true, error: null });
    try {
      const updated = await apiFetch<Account>(ENDPOINTS.account(id), {
        method: "PUT",
        body: JSON.stringify({ currency, type }),
      });
      set((s) => ({
        accounts: s.accounts.map((a) => (a.id === id ? updated : a)),
        currentAccount: s.currentAccount?.id === id ? updated : s.currentAccount,
        loading: false,
      }));
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  },

  deleteAccount: async (id) => {
    set({ loading: true, error: null });
    try {
      await apiFetch(ENDPOINTS.account(id), { method: "DELETE" });
      set((s) => ({ accounts: s.accounts.filter((a) => a.id !== id), loading: false }));
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  },

  fetchAccountUsers: async (id) => {
    set({ loading: true, error: null });
    try {
      const users = await apiFetch<AccountUser[]>(ENDPOINTS.accountUsers(id));
      set({ accountUsers: users, loading: false });
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  },

  inviteUser: async (accountId, userEmail, encryptedKey) => {
    set({ loading: true, error: null });
    try {
      await apiFetch(ENDPOINTS.accountInvite(accountId), {
        method: "POST",
        body: JSON.stringify({ user_email: userEmail, encrypted_account_key: encryptedKey }),
      });
      set({ loading: false });
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  },

  removeUser: async (accountId, userId) => {
    set({ loading: true, error: null });
    try {
      await apiFetch(ENDPOINTS.accountUser(accountId, userId), { method: "DELETE" });
      set((s) => ({
        accountUsers: s.accountUsers.filter((u) => u.user_id !== userId),
        loading: false,
      }));
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  },
}));
