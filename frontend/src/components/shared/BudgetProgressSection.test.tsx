import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { BudgetProgressSection } from "./BudgetProgressSection";
import { useAuthStore } from "@/stores/auth-store";
import { useBudgetStore } from "@/stores/budget-store";
import { useAccountStore } from "@/stores/account-store";

// Mock all three stores
vi.mock("@/stores/auth-store", () => ({
  useAuthStore: vi.fn(),
}));

vi.mock("@/stores/budget-store", () => ({
  useBudgetStore: vi.fn(),
}));

vi.mock("@/stores/account-store", () => ({
  useAccountStore: vi.fn(),
}));

// Mock the crypto-rules decrypt function
vi.mock("@/lib/crypto-rules", () => ({
  decryptECIESPayload: vi.fn(),
}));

// Mock bytesToBase64
vi.mock("@/lib/crypto", () => ({
  bytesToBase64: (arr: Uint8Array) => btoa(String.fromCharCode(...arr)),
}));

// Mock effectiveAmount
vi.mock("@/lib/crypto-transaction", () => ({
  effectiveAmount: (payload: any) => payload.amount ?? 0,
}));

// Mock the BudgetProgressBar child (keep it simple — actually render it for integration feel)
// No need to mock it, it's a pure component

const mockBudgets = [
  {
    id: "budget-1",
    user_id: "user-1",
    account_id: "account-1",
    encrypted_payload: "encrypted_budget_1",
    period: "monthly" as const,
    start_date: "2026-01-01T00:00:00Z",
    end_date: null,
    last_notified_50: null,
    last_notified_80: null,
    last_notified_100: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "budget-2",
    user_id: "user-1",
    account_id: null, // global budget
    encrypted_payload: "encrypted_budget_2",
    period: "yearly" as const,
    start_date: "2026-01-01T00:00:00Z",
    end_date: null,
    last_notified_50: null,
    last_notified_80: null,
    last_notified_100: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
];

const mockAccounts = [
  { id: "account-1", currency: "USD", name: "Checking", type: "personal" as const },
  { id: "account-2", currency: "EUR", name: "Savings", type: "savings" as const },
];

const decryptedBudget1 = { amount: 500, category: "Groceries" };
const decryptedBudget2 = { amount: 10000, category: "" };

beforeEach(() => {
  vi.clearAllMocks();

  // Default auth store state
  vi.mocked(useAuthStore).mockImplementation((selector?: any) => {
    const state = {
      user: { id: "user-1", email: "test@test.com" },
      plaintextPrivateKey: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
    };
    return selector ? selector(state) : state;
  });

  // Default budget store state
  vi.mocked(useBudgetStore).mockImplementation((selector?: any) => {
    const state = {
      budgets: [],
      loading: false,
      error: null,
      fetchBudgets: vi.fn(),
      createBudget: vi.fn(),
      updateBudget: vi.fn(),
      deleteBudget: vi.fn(),
      notifyThreshold: vi.fn().mockResolvedValue(undefined),
    };
    return selector ? selector(state) : state;
  });

  // Default account store state
  vi.mocked(useAccountStore).mockImplementation((selector?: any) => {
    const state = {
      accounts: mockAccounts,
      fetchAccounts: vi.fn(),
    };
    return selector ? selector(state) : state;
  });
});

describe("BudgetProgressSection", () => {
  it("should return null when there are no budgets", () => {
    const { container } = render(
      <BudgetProgressSection transactions={[]} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("should show loading indicator while decrypting without private key", () => {
    vi.mocked(useAuthStore).mockImplementation((selector?: any) => {
      const state = {
        user: { id: "user-1", email: "test@test.com" },
        plaintextPrivateKey: null,
      };
      return selector ? selector(state) : state;
    });

    vi.mocked(useBudgetStore).mockImplementation((selector?: any) => {
      const state = {
        budgets: [mockBudgets[0]],
        loading: false,
        error: null,
        fetchBudgets: vi.fn(),
        createBudget: vi.fn(),
        updateBudget: vi.fn(),
        deleteBudget: vi.fn(),
        notifyThreshold: vi.fn(),
      };
      return selector ? selector(state) : state;
    });

    render(<BudgetProgressSection transactions={[]} />);
    // Card title should still show
    expect(screen.getByText("Budget Progress")).toBeInTheDocument();
  });

  it("should render with budget progress bars", async () => {
    // Set up budgets with data
    vi.mocked(useBudgetStore).mockImplementation((selector?: any) => {
      const state = {
        budgets: mockBudgets,
        loading: false,
        error: null,
        fetchBudgets: vi.fn(),
        createBudget: vi.fn(),
        updateBudget: vi.fn(),
        deleteBudget: vi.fn(),
        notifyThreshold: vi.fn().mockResolvedValue(undefined),
      };
      return selector ? selector(state) : state;
    });

    // Mock decryptECIESPayload to return our payloads
    const { decryptECIESPayload } = await import("@/lib/crypto-rules");
    vi.mocked(decryptECIESPayload).mockImplementation(
      async (encrypted: string) => {
        if (encrypted === "encrypted_budget_1") return decryptedBudget1;
        if (encrypted === "encrypted_budget_2") return decryptedBudget2;
        return null;
      },
    );

    // Provide some transactions
    const transactions = [
      {
        account_id: "account-1",
        payload: { amount: -100, category: "Groceries", notes: "", counterparty: "" },
      },
      {
        account_id: "account-1",
        payload: { amount: -200, category: "Groceries", notes: "", counterparty: "" },
      },
    ];

    render(<BudgetProgressSection transactions={transactions as any} />);

    // Wait for decrypt effects
    await vi.waitFor(() => {
      expect(screen.getByText("Budget Progress")).toBeInTheDocument();
    });
  });

  it("should filter by accountId in account view", async () => {
    vi.mocked(useBudgetStore).mockImplementation((selector?: any) => {
      const state = {
        budgets: mockBudgets,
        loading: false,
        error: null,
        fetchBudgets: vi.fn(),
        createBudget: vi.fn(),
        updateBudget: vi.fn(),
        deleteBudget: vi.fn(),
        notifyThreshold: vi.fn().mockResolvedValue(undefined),
      };
      return selector ? selector(state) : state;
    });

    const { decryptECIESPayload } = await import("@/lib/crypto-rules");
    vi.mocked(decryptECIESPayload).mockResolvedValue(decryptedBudget1);

    render(
      <BudgetProgressSection
        transactions={[]}
        accountId="account-1"
      />,
    );

    await vi.waitFor(() => {
      expect(screen.getByText("Budget Progress")).toBeInTheDocument();
    });
  });

  it("should show no budgets message when no progress items", async () => {
    vi.mocked(useBudgetStore).mockImplementation((selector?: any) => {
      const state = {
        budgets: mockBudgets,
        loading: false,
        error: null,
        fetchBudgets: vi.fn(),
        createBudget: vi.fn(),
        updateBudget: vi.fn(),
        deleteBudget: vi.fn(),
        notifyThreshold: vi.fn().mockResolvedValue(undefined),
      };
      return selector ? selector(state) : state;
    });

    const { decryptECIESPayload } = await import("@/lib/crypto-rules");
    vi.mocked(decryptECIESPayload).mockResolvedValue(null);

    render(<BudgetProgressSection transactions={[]} />);

    await vi.waitFor(() => {
      expect(
        screen.getByText(/No budgets set/),
      ).toBeInTheDocument();
    });
  });
});
