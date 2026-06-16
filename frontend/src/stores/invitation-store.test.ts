import { describe, it, expect, vi, beforeEach } from "vitest";
import { apiFetch } from "@/lib/api";
import { useInvitationStore, Invitation } from "./invitation-store";

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}));

const mockInvitation: Invitation = {
  id: "inv-1",
  entity_type: "account",
  entity_id: "account-1",
  invited_by: "user-2",
  invited_email: "test@example.com",
  status: "pending",
  created_at: "2026-01-01T00:00:00Z",
  expires_at: "2026-02-01T00:00:00Z",
};

const mockRuleInvitation: Invitation = {
  id: "inv-2",
  entity_type: "rule",
  entity_id: "rule-1",
  invited_by: "user-2",
  invited_email: "other@example.com",
  status: "pending",
  created_at: "2026-01-01T00:00:00Z",
  expires_at: "2026-02-01T00:00:00Z",
};

describe("invitation store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useInvitationStore.setState({
      invitations: [],
      loading: false,
      error: null,
    });
  });

  it("should initialize with empty state", () => {
    const state = useInvitationStore.getState();
    expect(state.invitations).toEqual([]);
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
  });

  it("fetchInvitations should set invitations", async () => {
    vi.mocked(apiFetch).mockResolvedValue([mockInvitation, mockRuleInvitation]);

    await useInvitationStore.getState().fetchInvitations();

    const state = useInvitationStore.getState();
    expect(state.invitations).toHaveLength(2);
    expect(state.invitations[0].id).toBe("inv-1");
    expect(state.invitations[1].id).toBe("inv-2");
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
  });

  it("fetchInvitations should handle error", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error("Server error"));

    await useInvitationStore.getState().fetchInvitations();

    const state = useInvitationStore.getState();
    expect(state.invitations).toEqual([]);
    expect(state.loading).toBe(false);
    expect(state.error).toBe("Server error");
  });

  it("acceptInvitation should remove invitation from list", async () => {
    useInvitationStore.setState({
      invitations: [mockInvitation, mockRuleInvitation],
    });
    vi.mocked(apiFetch).mockResolvedValue(undefined);

    await useInvitationStore.getState().acceptInvitation("inv-1");

    const state = useInvitationStore.getState();
    expect(state.invitations).toHaveLength(1);
    expect(state.invitations[0].id).toBe("inv-2");
    expect(state.loading).toBe(false);
  });

  it("acceptInvitation with encryptedAccount should send it in body", async () => {
    useInvitationStore.setState({
      invitations: [mockInvitation],
    });
    const mockFetch = vi.mocked(apiFetch).mockResolvedValue(undefined);

    const encryptedAccount = "encrypted-account-key-data";
    await useInvitationStore.getState().acceptInvitation("inv-1", encryptedAccount);

    expect(mockFetch).toHaveBeenCalledWith("/api/v1/invitations/inv-1/accept", {
      method: "POST",
      body: JSON.stringify({ encrypted_account: encryptedAccount }),
    });

    // Verify invitation was removed
    expect(useInvitationStore.getState().invitations).toHaveLength(0);
  });

  it("acceptInvitation should handle error", async () => {
    useInvitationStore.setState({
      invitations: [mockInvitation],
    });
    vi.mocked(apiFetch).mockRejectedValue(new Error("Accept failed"));

    await expect(
      useInvitationStore.getState().acceptInvitation("inv-1"),
    ).rejects.toThrow("Accept failed");

    const state = useInvitationStore.getState();
    expect(state.loading).toBe(false);
    expect(state.error).toBe("Accept failed");
    // Invitation should still be in the list
    expect(state.invitations).toHaveLength(1);
  });

  it("declineInvitation should remove invitation from list", async () => {
    useInvitationStore.setState({
      invitations: [mockInvitation, mockRuleInvitation],
    });
    vi.mocked(apiFetch).mockResolvedValue(undefined);

    await useInvitationStore.getState().declineInvitation("inv-1");

    const state = useInvitationStore.getState();
    expect(state.invitations).toHaveLength(1);
    expect(state.invitations[0].id).toBe("inv-2");
    expect(state.loading).toBe(false);
  });

  it("declineInvitation should handle error", async () => {
    useInvitationStore.setState({
      invitations: [mockInvitation],
    });
    vi.mocked(apiFetch).mockRejectedValue(new Error("Decline failed"));

    await expect(
      useInvitationStore.getState().declineInvitation("inv-1"),
    ).rejects.toThrow("Decline failed");

    const state = useInvitationStore.getState();
    expect(state.loading).toBe(false);
    expect(state.error).toBe("Decline failed");
    expect(state.invitations).toHaveLength(1);
  });
});
