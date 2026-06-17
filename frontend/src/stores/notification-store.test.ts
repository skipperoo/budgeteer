import { describe, it, expect, vi, beforeEach } from "vitest";
import { apiFetch } from "@/lib/api";
import { useNotificationStore, Notification } from "./notification-store";

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}));

const mockNotification: Notification = {
  id: "notif-1",
  user_id: "user-1",
  type: "invitation",
  title: "New invitation",
  body: "You have been invited to an account",
  is_read: false,
  created_at: "2026-01-01T00:00:00Z",
};

describe("notification store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useNotificationStore.setState({
      notifications: [],
      unreadCount: 0,
      loading: false,
      error: null,
    });
  });

  it("should initialize with empty state", () => {
    const state = useNotificationStore.getState();
    expect(state.notifications).toEqual([]);
    expect(state.unreadCount).toBe(0);
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
  });

  it("fetchNotifications should set loading state", async () => {
    vi.mocked(apiFetch).mockResolvedValue([mockNotification]);

    const fetchPromise = useNotificationStore.getState().fetchNotifications();

    // Should be loading during the request
    expect(useNotificationStore.getState().loading).toBe(true);

    await fetchPromise;

    const state = useNotificationStore.getState();
    expect(state.loading).toBe(false);
    expect(state.notifications).toHaveLength(1);
    expect(state.notifications[0]).toEqual(mockNotification);
    expect(state.error).toBeNull();
  });

  it("fetchNotifications should handle error", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error("Network error"));

    await useNotificationStore.getState().fetchNotifications();

    const state = useNotificationStore.getState();
    expect(state.loading).toBe(false);
    expect(state.notifications).toEqual([]);
    expect(state.error).toBe("Network error");
  });

  it("fetchUnreadCount should set unread count", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ count: 5 });

    await useNotificationStore.getState().fetchUnreadCount();

    expect(useNotificationStore.getState().unreadCount).toBe(5);
  });

  it("fetchUnreadCount should not set error on failure", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error("fail"));

    await useNotificationStore.getState().fetchUnreadCount();

    // Error should remain null per store implementation (silently fail)
    expect(useNotificationStore.getState().unreadCount).toBe(0);
    expect(useNotificationStore.getState().error).toBeNull();
  });

  it("markRead should update notification and decrement count", async () => {
    // Set initial state with one unread notification
    useNotificationStore.setState({
      notifications: [mockNotification],
      unreadCount: 1,
    });

    vi.mocked(apiFetch).mockResolvedValue(undefined);

    await useNotificationStore.getState().markRead("notif-1");

    const state = useNotificationStore.getState();
    expect(state.notifications[0].is_read).toBe(true);
    expect(state.unreadCount).toBe(0);
  });

  it("markRead should handle error silently", async () => {
    useNotificationStore.setState({
      notifications: [mockNotification],
      unreadCount: 1,
    });

    vi.mocked(apiFetch).mockRejectedValue(new Error("fail"));

    await useNotificationStore.getState().markRead("notif-1");

    // State should remain unchanged on error
    const state = useNotificationStore.getState();
    expect(state.notifications[0].is_read).toBe(false);
    expect(state.unreadCount).toBe(1);
  });
});
