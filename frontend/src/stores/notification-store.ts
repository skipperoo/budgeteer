import { create } from "zustand";
import { apiFetch } from "@/lib/api";
import { ENDPOINTS } from "@/lib/constants";

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  data?: string;
  is_read: boolean;
  created_at: string;
}

export interface NotificationData {
  invitation_id?: string;
  rule_id?: string;
  account_id?: string;
  invited_by?: string;
}

interface NotificationStore {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  error: string | null;

  fetchNotifications: () => Promise<void>;
  fetchUnreadCount: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
}

export const useNotificationStore = create<NotificationStore>((set) => ({
  notifications: [],
  unreadCount: 0,
  loading: false,
  error: null,

  fetchNotifications: async () => {
    set({ loading: true, error: null });
    try {
      const data = await apiFetch<Notification[]>(ENDPOINTS.notifications);
      set({ notifications: data, loading: false });
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to fetch notifications";
      set({ error: msg, loading: false });
    }
  },

  fetchUnreadCount: async () => {
    try {
      const data = await apiFetch<{ count: number }>(
        ENDPOINTS.notificationCount,
      );
      set({ unreadCount: data.count });
    } catch {
      // silently fail
    }
  },

  markRead: async (id) => {
    try {
      await apiFetch<void>(ENDPOINTS.notificationRead(id), {
        method: "PUT",
      });
      set((s) => ({
        notifications: s.notifications.map((n) =>
          n.id === id ? { ...n, is_read: true } : n,
        ),
        unreadCount: Math.max(0, s.unreadCount - (s.notifications.find((n) => n.id === id && !n.is_read) ? 1 : 0)),
      }));
    } catch {
      // silently fail
    }
  },
}));
