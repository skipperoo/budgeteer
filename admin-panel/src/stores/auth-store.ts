import { create } from "zustand";
import { apiFetch, setToken, removeToken, getToken, API_BASE } from "@/lib/api";

interface AdminUser {
  id: string;
  email: string;
  display_name: string;
}

interface AuthState {
  token: string | null;
  admin: AdminUser | null;
  mustChangePassword: boolean;
  setAuth: (token: string, admin: AdminUser, mustChange: boolean) => void;
  logout: () => void;
  login: (email: string, password: string) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: getToken(),
  admin: null,
  mustChangePassword: false,

  setAuth: (token, admin, mustChange) => {
    setToken(token);
    set({ token, admin, mustChangePassword: mustChange });
  },

  logout: () => {
    removeToken();
    set({ token: null, admin: null, mustChangePassword: false });
  },

  login: async (email, password) => {
    const resp = await apiFetch<{
      token: string;
      must_change_password: boolean;
      display_name: string;
    }>(`${API_BASE}/admin/auth/login`, {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setToken(resp.token);
    set({
      token: resp.token,
      admin: { id: "", email, display_name: resp.display_name },
      mustChangePassword: resp.must_change_password,
    });
  },
}));
