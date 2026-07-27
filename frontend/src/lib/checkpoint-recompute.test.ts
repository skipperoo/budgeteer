import { describe, it, expect } from "vitest";
import { buildCheckpointsFromTxs } from "./checkpoint-recompute";
import { transactionMonthEnd } from "./crypto-transaction";
import type { TransactionPayload } from "./crypto-transaction";

function tx(time: string, amount: number, extra: Partial<TransactionPayload> = {}): {
  time: string;
  payload: TransactionPayload;
} {
  return {
    time,
    payload: {
      amount,
      category: "General",
      notes: "",
      counterparty: "",
      ...extra,
    },
  };
}

describe("buildCheckpointsFromTxs", () => {
  it("produces a contiguous prefix-sum across months incl. empty months", () => {
    const txs = [
      tx("2025-01-10T00:00:00Z", 100),
      tx("2025-01-20T00:00:00Z", 50),
      tx("2025-03-05T00:00:00Z", -30), // February is empty
    ];
    const out = buildCheckpointsFromTxs(txs, 1000, "2025-01-31", "2025-03-31");
    expect(out).toEqual([
      { checkpoint_month: "2025-01-31", blob: { balance: 1150, tx_count: 2 } },
      { checkpoint_month: "2025-02-28", blob: { balance: 1150, tx_count: 2 } },
      { checkpoint_month: "2025-03-31", blob: { balance: 1120, tx_count: 3 } },
    ]);
  });

  it("factoring commission into effectiveAmount", () => {
    const txs = [tx("2025-07-15T00:00:00Z", -100, { commission: 5 })]; // -105
    const out = buildCheckpointsFromTxs(txs, 500, "2025-07-31", "2025-07-31");
    expect(out).toEqual([
      { checkpoint_month: "2025-07-31", blob: { balance: 395, tx_count: 1 } },
    ]);
  });

  it("uses the prior verified checkpoint as opening balance + base tx_count", () => {
    // Jan already had a verified checkpoint of balance 1150, count 2 (prior base).
    // February has two new txs.
    const txs = [
      tx("2025-02-03T00:00:00Z", -200),
      tx("2025-02-25T00:00:00Z", 50),
      tx("2025-03-10T00:00:00Z", 100),
    ];
    const out = buildCheckpointsFromTxs(txs, 1150, "2025-02-28", "2025-03-31", 2);
    expect(out).toEqual([
      { checkpoint_month: "2025-02-28", blob: { balance: 1000, tx_count: 4 } },
      { checkpoint_month: "2025-03-31", blob: { balance: 1100, tx_count: 5 } },
    ]);
  });

  it("no transactions in range yields opening balance carried through", () => {
    const out = buildCheckpointsFromTxs([], 750, "2025-05-31", "2025-06-30");
    expect(out).toEqual([
      { checkpoint_month: "2025-05-31", blob: { balance: 750, tx_count: 0 } },
      { checkpoint_month: "2025-06-30", blob: { balance: 750, tx_count: 0 } },
    ]);
  });

  it("filters txs outside the requested range (before fromMonthEnd)", () => {
    const txs = [
      tx("2024-12-15T00:00:00Z", 999), // before the fromMonthEnd window
      tx("2025-01-10T00:00:00Z", 100),
    ];
    const out = buildCheckpointsFromTxs(txs, 1000, "2025-01-31", "2025-01-31");
    expect(out).toEqual([
      { checkpoint_month: "2025-01-31", blob: { balance: 1100, tx_count: 1 } },
    ]);
  });

  it("transactionMonthEnd UTC bucketing matches UTC dates", () => {
    // A tx on 2025-01-31 at 23:59 UTC is still January.
    expect(transactionMonthEnd("2025-01-31T23:59:59Z")).toBe("2025-01-31");
    // A tx on 2025-02-01 at 00:00 UTC is February.
    expect(transactionMonthEnd("2025-02-01T00:00:00Z")).toBe("2025-02-28");
  });
});