import { create } from "zustand";
import { apiFetch } from "@/lib/api";
import { ENDPOINTS } from "@/lib/constants";

export interface Rule {
  id: string;
  created_by: string;
  name: string;
  encrypted_payload: string;
  frequency: "daily" | "weekly" | "monthly" | "yearly";
  next_occurrence: string;
  end_date?: string;
  max_occurrences?: number;
  occurrences_so_far: number;
  last_triggered_at?: string;
  is_active: boolean;
  status: "pending_accepted" | "active";
  target_email?: string;
  target_account_encrypted?: string;
  alert_offset?: string; // e.g. "1 hour", "2 days"
  created_at: string;
  updated_at: string;
}

export interface CreateRuleRequest {
  name: string;
  encrypted_payload: string;
  frequency: string;
  next_occurrence: string;
  end_date?: string;
  max_occurrences?: number;
  target_email?: string;
  alert_offset?: string;
}

export interface UpdateRuleRequest {
  name?: string;
  encrypted_payload?: string;
  frequency?: string;
  next_occurrence?: string;
  end_date?: string | null;
  max_occurrences?: number;
  is_active?: boolean;
  alert_offset?: string | null; // null = clear the offset
}

interface RuleStore {
  rules: Rule[];
  serverPublicKey: string | null;
  loading: boolean;
  error: string | null;

  fetchServerPublicKey: () => Promise<string>;
  fetchRules: () => Promise<void>;
  createRule: (req: CreateRuleRequest) => Promise<Rule>;
  updateRule: (id: string, req: UpdateRuleRequest) => Promise<Rule>;
  deleteRule: (id: string) => Promise<void>;
}

export const useRuleStore = create<RuleStore>((set, get) => ({
  rules: [],
  serverPublicKey: null,
  loading: false,
  error: null,

  fetchServerPublicKey: async () => {
    try {
      const data = await apiFetch<{ public_key: string }>(
        "/api/v1/rules/public-key",
      );
      set({ serverPublicKey: data.public_key });
      return data.public_key;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to fetch server public key";
      set({ error: msg });
      throw err;
    }
  },

  fetchRules: async () => {
    set({ loading: true, error: null });
    try {
      const rules = await apiFetch<Rule[]>("/api/v1/rules");
      set({ rules, loading: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to fetch rules";
      set({ error: msg, loading: false });
    }
  },

  createRule: async (req) => {
    set({ loading: true, error: null });
    try {
      const rule = await apiFetch<Rule>("/api/v1/rules", {
        method: "POST",
        body: JSON.stringify(req),
      });
      set((s) => ({ rules: [rule, ...s.rules], loading: false }));
      return rule;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create rule";
      set({ error: msg, loading: false });
      throw err;
    }
  },

  updateRule: async (id, req) => {
    set({ loading: true, error: null });
    try {
      const rule = await apiFetch<Rule>(`/api/v1/rules/${id}`, {
        method: "PUT",
        body: JSON.stringify(req),
      });
      set((s) => ({
        rules: s.rules.map((r) => (r.id === id ? rule : r)),
        loading: false,
      }));
      return rule;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update rule";
      set({ error: msg, loading: false });
      throw err;
    }
  },

  deleteRule: async (id) => {
    set({ loading: true, error: null });
    try {
      await apiFetch<void>(`/api/v1/rules/${id}`, { method: "DELETE" });
      set((s) => ({
        rules: s.rules.filter((r) => r.id !== id),
        loading: false,
      }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to delete rule";
      set({ error: msg, loading: false });
      throw err;
    }
  },
}));
