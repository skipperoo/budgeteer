import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TransactionCard } from "./TransactionCard";
import type { TransactionPayload } from "@/lib/crypto-transaction";

function makePayload(overrides: Partial<TransactionPayload> = {}): TransactionPayload {
  return {
    amount: -100,
    category: "Food",
    notes: "",
    counterparty: "Test Vendor",
    ...overrides,
  };
}

describe("TransactionCard", () => {
  it("should render counterparty and amount", () => {
    render(
      <TransactionCard
        transaction={{
          id: "tx-1",
          time: "2024-06-15T12:00:00Z",
          payload: makePayload(),
        }}
        currency="USD"
      />,
    );
    expect(screen.getByText("Test Vendor")).toBeInTheDocument();
    expect(screen.getByText(/\$100\.00/)).toBeInTheDocument();
  });

  it("should render income amount in positive", () => {
    render(
      <TransactionCard
        transaction={{
          id: "tx-2",
          time: "2024-06-15T12:00:00Z",
          payload: makePayload({ amount: 200 }),
        }}
        currency="USD"
      />,
    );
    expect(screen.getByText(/\$200\.00/)).toBeInTheDocument();
  });

  it("should show commission when present", () => {
    render(
      <TransactionCard
        transaction={{
          id: "tx-3",
          time: "2024-06-15T12:00:00Z",
          payload: makePayload({ commission: 2.50 }),
        }}
        currency="USD"
      />,
    );
    expect(screen.getByText(/\$2\.50 fee/)).toBeInTheDocument();
  });

  it("should show interest_amount when present", () => {
    render(
      <TransactionCard
        transaction={{
          id: "tx-4",
          time: "2024-06-15T12:00:00Z",
          payload: makePayload({ interest_amount: 15.75 }),
        }}
        currency="USD"
      />,
    );
    expect(screen.getByText(/\$15\.75 interest/)).toBeInTheDocument();
  });

  it("should not show zero interest_amount", () => {
    render(
      <TransactionCard
        transaction={{
          id: "tx-5",
          time: "2024-06-15T12:00:00Z",
          payload: makePayload({ interest_amount: 0 }),
        }}
        currency="USD"
      />,
    );
    expect(screen.queryByText(/interest/)).not.toBeInTheDocument();
  });

  it("should show category badge", () => {
    render(
      <TransactionCard
        transaction={{
          id: "tx-6",
          time: "2024-06-15T12:00:00Z",
          payload: makePayload({ category: "Groceries" }),
        }}
        currency="USD"
      />,
    );
    expect(screen.getByText("Groceries")).toBeInTheDocument();
  });

  it("should show decrypt error when payload is null", () => {
    render(
      <TransactionCard
        transaction={{
          id: "tx-7",
          time: "2024-06-15T12:00:00Z",
          payload: null,
          decryptError: "Key not available",
        }}
        currency="USD"
      />,
    );
    expect(screen.getByText("Key not available")).toBeInTheDocument();
  });

  it("should show notes when present", () => {
    render(
      <TransactionCard
        transaction={{
          id: "tx-8",
          time: "2024-06-15T12:00:00Z",
          payload: makePayload({ notes: "Monthly payment" }),
        }}
        currency="USD"
      />,
    );
    expect(screen.getByText("Monthly payment")).toBeInTheDocument();
  });
});
