import { describe, it, expect, vi, beforeEach } from "vitest";
import { apiFetch } from "@/lib/api";
import { useRuleStore, Rule, CreateRuleRequest, UpdateRuleRequest } from "./rule-store";

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}));

const mockRule: Rule = {
  id: "rule-1",
  created_by: "user-1",
  name: "Monthly Rent",
  encrypted_payload: "1|encrypted-data",
  frequency: "monthly",
  next_occurrence: "2026-02-01T00:00:00Z",
  occurrences_so_far: 0,
  is_active: true,
  status: "active",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const mockRule2: Rule = {
  id: "rule-2",
  created_by: "user-1",
  name: "Netflix Subscription",
  encrypted_payload: "1|encrypted-data-2",
  frequency: "monthly",
  next_occurrence: "2026-02-15T00:00:00Z",
  occurrences_so_far: 3,
  is_active: true,
  status: "active",
  created_at: "2026-01-05T00:00:00Z",
  updated_at: "2026-01-05T00:00:00Z",
};

describe("rule store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useRuleStore.setState({
      rules: [],
      serverPublicKey: null,
      loading: false,
      error: null,
    });
  });

  it("should initialize with empty state", () => {
    const state = useRuleStore.getState();
    expect(state.rules).toEqual([]);
    expect(state.serverPublicKey).toBeNull();
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
  });

  it("fetchServerPublicKey should set the key", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ public_key: "server-pub-key-value" });

    const result = await useRuleStore.getState().fetchServerPublicKey();

    expect(result).toBe("server-pub-key-value");
    expect(useRuleStore.getState().serverPublicKey).toBe("server-pub-key-value");
  });

  it("fetchServerPublicKey should handle error", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error("Key fetch failed"));

    await expect(
      useRuleStore.getState().fetchServerPublicKey(),
    ).rejects.toThrow("Key fetch failed");

    expect(useRuleStore.getState().error).toBe("Key fetch failed");
    expect(useRuleStore.getState().serverPublicKey).toBeNull();
  });

  it("fetchRules should set rules", async () => {
    vi.mocked(apiFetch).mockResolvedValue([mockRule, mockRule2]);

    await useRuleStore.getState().fetchRules();

    const state = useRuleStore.getState();
    expect(state.rules).toHaveLength(2);
    expect(state.rules[0].id).toBe("rule-1");
    expect(state.rules[1].id).toBe("rule-2");
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
  });

  it("fetchRules should handle error", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error("Fetch failed"));

    await useRuleStore.getState().fetchRules();

    const state = useRuleStore.getState();
    expect(state.rules).toEqual([]);
    expect(state.loading).toBe(false);
    expect(state.error).toBe("Fetch failed");
  });

  it("createRule should add rule to list", async () => {
    const newRule: Rule = {
      ...mockRule,
      id: "rule-new",
    };
    vi.mocked(apiFetch).mockResolvedValue(newRule);

    const req: CreateRuleRequest = {
      name: "New Rule",
      encrypted_payload: "1|encrypted",
      frequency: "monthly",
      next_occurrence: "2026-03-01T00:00:00Z",
    };

    const result = await useRuleStore.getState().createRule(req);

    expect(result).toEqual(newRule);
    expect(useRuleStore.getState().rules).toHaveLength(1);
    expect(useRuleStore.getState().rules[0].id).toBe("rule-new");
    expect(useRuleStore.getState().loading).toBe(false);
  });

  it("createRule should prepend rule to existing list", async () => {
    useRuleStore.setState({ rules: [mockRule] });

    const newRule: Rule = { ...mockRule2, id: "rule-new" };
    vi.mocked(apiFetch).mockResolvedValue(newRule);

    const req: CreateRuleRequest = {
      name: "New Rule",
      encrypted_payload: "1|encrypted",
      frequency: "weekly",
      next_occurrence: "2026-03-01T00:00:00Z",
    };

    await useRuleStore.getState().createRule(req);

    const state = useRuleStore.getState();
    expect(state.rules).toHaveLength(2);
    // New rule should be prepended (at index 0)
    expect(state.rules[0].id).toBe("rule-new");
    expect(state.rules[1].id).toBe("rule-1");
  });

  it("createRule should handle error", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error("Create failed"));

    const req: CreateRuleRequest = {
      name: "Fail Rule",
      encrypted_payload: "1|encrypted",
      frequency: "monthly",
      next_occurrence: "2026-03-01T00:00:00Z",
    };

    await expect(useRuleStore.getState().createRule(req)).rejects.toThrow(
      "Create failed",
    );

    const state = useRuleStore.getState();
    expect(state.loading).toBe(false);
    expect(state.error).toBe("Create failed");
    expect(state.rules).toEqual([]);
  });

  it("updateRule should update rule in list", async () => {
    useRuleStore.setState({ rules: [mockRule, mockRule2] });

    const updatedRule: Rule = {
      ...mockRule,
      name: "Updated Rent",
      occurrences_so_far: 1,
    };
    vi.mocked(apiFetch).mockResolvedValue(updatedRule);

    const req: UpdateRuleRequest = { name: "Updated Rent", is_active: true };
    const result = await useRuleStore.getState().updateRule("rule-1", req);

    expect(result).toEqual(updatedRule);

    const state = useRuleStore.getState();
    expect(state.rules).toHaveLength(2);
    expect(state.rules[0].name).toBe("Updated Rent");
    expect(state.rules[0].occurrences_so_far).toBe(1);
    // Second rule should be unchanged
    expect(state.rules[1].id).toBe("rule-2");
    expect(state.loading).toBe(false);
  });

  it("updateRule should handle error", async () => {
    useRuleStore.setState({ rules: [mockRule] });
    vi.mocked(apiFetch).mockRejectedValue(new Error("Update failed"));

    const req: UpdateRuleRequest = { name: "Should not update" };

    await expect(
      useRuleStore.getState().updateRule("rule-1", req),
    ).rejects.toThrow("Update failed");

    const state = useRuleStore.getState();
    expect(state.loading).toBe(false);
    expect(state.error).toBe("Update failed");
    // Rule should remain unchanged
    expect(state.rules[0].name).toBe("Monthly Rent");
  });

  it("deleteRule should remove rule from list", async () => {
    useRuleStore.setState({ rules: [mockRule, mockRule2] });
    vi.mocked(apiFetch).mockResolvedValue(undefined);

    await useRuleStore.getState().deleteRule("rule-1");

    const state = useRuleStore.getState();
    expect(state.rules).toHaveLength(1);
    expect(state.rules[0].id).toBe("rule-2");
    expect(state.loading).toBe(false);
  });

  it("deleteRule should handle error", async () => {
    useRuleStore.setState({ rules: [mockRule] });
    vi.mocked(apiFetch).mockRejectedValue(new Error("Delete failed"));

    await expect(
      useRuleStore.getState().deleteRule("rule-1"),
    ).rejects.toThrow("Delete failed");

    const state = useRuleStore.getState();
    expect(state.loading).toBe(false);
    expect(state.error).toBe("Delete failed");
    // Rule should remain in list
    expect(state.rules).toHaveLength(1);
  });
});
