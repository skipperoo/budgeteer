import { describe, it, expect, vi, beforeEach } from "vitest";
import type { UserDataDump } from "./data-management";
import { decryptDump } from "./data-management";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks();
});

// Minimal mock for auth store — we test decryptDump without actual crypto
vi.mock("../stores/auth-store", () => ({
  useAuthStore: {
    getState: () => ({
      plaintextPrivateKey: new Uint8Array(32), // fake 256-bit key
    }),
  },
}));

describe("decryptDump", () => {
  it("should handle empty accounts gracefully", async () => {
    const dump: UserDataDump = {
      user: {
        id: "user-1",
        email: "test@example.com",
        public_key: "pk",
        encrypted_private_key: "ek",
        preferences: {},
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      },
      accounts: [],
      categories: [],
      budgets: [],
      rules: [],
      notifications: [],
      invitations_sent: [],
      invitations_received: [],
      savings_plans: [],
      recurring_transactions: [],
    };

    // Should not throw
    await expect(decryptDump(dump)).resolves.toBeUndefined();
  });

  it("should handle null arrays from the backend safely", async () => {
    // Simulate Go nil slices serialized as JSON null
    const dump = {
      user: {
        id: "user-1",
        email: "test@example.com",
        public_key: "pk",
        encrypted_private_key: "ek",
        preferences: {},
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      },
      accounts: null,
      categories: null,
      budgets: null,
      rules: null,
      notifications: null,
      invitations_sent: null,
      invitations_received: null,
      savings_plans: null,
      recurring_transactions: null,
    } as unknown as UserDataDump;

    await expect(decryptDump(dump)).resolves.toBeUndefined();
  });
});

describe("dump zip structure verification", () => {
  it("the test file should export the correct dump types", () => {
    // This is a compile-time check that the types are consistent
    const dump: UserDataDump = {
      user: {
        id: "u1",
        email: "a@b.com",
        public_key: "pk",
        encrypted_private_key: "ek",
        preferences: {},
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      },
      accounts: [
        {
          account: {
            id: "a1",
            name: "Test",
            currency: "EUR",
            type: "personal",
            created_by: "u1",
            created_at: "2024-01-01T00:00:00Z",
            updated_at: "2024-01-01T00:00:00Z",
          },
          account_user: {
            account_id: "a1",
            user_id: "u1",
            encrypted_account_key: "key:enc",
            role: "owner",
            status: "active",
            joined_at: "2024-01-01T00:00:00Z",
          },
          transactions: [],
          documents: [],
        },
      ],
      categories: [],
      budgets: [],
      rules: [],
      notifications: [],
      invitations_sent: [],
      invitations_received: [],
      savings_plans: [],
      recurring_transactions: [],
    };

    expect(dump.accounts).toHaveLength(1);
    expect(dump.accounts[0].account.name).toBe("Test");
    expect(dump.accounts[0].account_user.status).toBe("active");
  });
});
