import { create } from "zustand";
import { apiFetch } from "@/lib/api";
import { ENDPOINTS } from "@/lib/constants";

export interface Invitation {
  id: string;
  entity_type: "rule" | "account";
  entity_id: string;
  invited_by: string;
  invited_email: string;
  invited_user_id?: string;
  encrypted_data?: string;
  status: string;
  created_at: string;
  expires_at: string;
}

interface InvitationStore {
  invitations: Invitation[];
  loading: boolean;
  error: string | null;

  fetchInvitations: () => Promise<void>;
  acceptInvitation: (id: string, encryptedAccount?: string) => Promise<void>;
  declineInvitation: (id: string) => Promise<void>;
}

export const useInvitationStore = create<InvitationStore>((set) => ({
  invitations: [],
  loading: false,
  error: null,

  fetchInvitations: async () => {
    set({ loading: true, error: null });
    try {
      const data = await apiFetch<Invitation[]>(ENDPOINTS.invitations);
      set({ invitations: data, loading: false });
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to fetch invitations";
      set({ error: msg, loading: false });
    }
  },

  acceptInvitation: async (id, encryptedAccount) => {
    set({ loading: true, error: null });
    try {
      const body: Record<string, string> = {};
      if (encryptedAccount) {
        body.encrypted_account = encryptedAccount;
      }
      await apiFetch<void>(ENDPOINTS.invitationAccept(id), {
        method: "POST",
        body: JSON.stringify(body),
      });
      set((s) => ({
        invitations: s.invitations.filter((inv) => inv.id !== id),
        loading: false,
      }));
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to accept invitation";
      set({ error: msg, loading: false });
      throw err;
    }
  },

  declineInvitation: async (id) => {
    set({ loading: true, error: null });
    try {
      await apiFetch<void>(ENDPOINTS.invitationDecline(id), {
        method: "POST",
      });
      set((s) => ({
        invitations: s.invitations.filter((inv) => inv.id !== id),
        loading: false,
      }));
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to decline invitation";
      set({ error: msg, loading: false });
      throw err;
    }
  },
}));
