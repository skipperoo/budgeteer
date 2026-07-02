import { describe, it, expect } from "vitest";
import {
  isTransferPayload,
  getTransferPairId,
  stripTransferFields,
  effectiveAmount,
  type TransactionPayload,
} from "./crypto-transaction";

describe("isTransferPayload", () => {
  it("should return true for a valid transfer payload", () => {
    const payload: TransactionPayload = {
      amount: -100,
      category: "Transfer",
      notes: "",
      counterparty: "Account A → Account B",
      is_transfer: true,
      transfer_pair_id: "abc-123",
    };
    expect(isTransferPayload(payload)).toBe(true);
  });

  it("should return false when is_transfer is missing", () => {
    const payload: TransactionPayload = {
      amount: -100,
      category: "Food",
      notes: "",
      counterparty: "Store",
    };
    expect(isTransferPayload(payload)).toBe(false);
  });

  it("should return false when is_transfer is false", () => {
    const payload: TransactionPayload = {
      amount: -100,
      category: "Food",
      notes: "",
      counterparty: "Store",
      is_transfer: false,
    };
    expect(isTransferPayload(payload)).toBe(false);
  });

  it("should return false when transfer_pair_id is missing", () => {
    const payload: TransactionPayload = {
      amount: -100,
      category: "Transfer",
      notes: "",
      counterparty: "A → B",
      is_transfer: true,
      // no transfer_pair_id
    };
    expect(isTransferPayload(payload)).toBe(false);
  });

  it("should return true for income-side transfer payload", () => {
    const payload: TransactionPayload = {
      amount: 100,
      category: "Transfer",
      notes: "",
      counterparty: "Account A → Account B",
      is_transfer: true,
      transfer_pair_id: "abc-123",
    };
    expect(isTransferPayload(payload)).toBe(true);
  });
});

describe("getTransferPairId", () => {
  it("should return the pair ID for a transfer payload", () => {
    const payload: TransactionPayload = {
      amount: -100,
      category: "Transfer",
      notes: "",
      counterparty: "A → B",
      is_transfer: true,
      transfer_pair_id: "pair-456",
    };
    expect(getTransferPairId(payload)).toBe("pair-456");
  });

  it("should return null when payload is not a transfer", () => {
    const payload: TransactionPayload = {
      amount: -50,
      category: "Groceries",
      notes: "",
      counterparty: "Shop",
    };
    expect(getTransferPairId(payload)).toBeNull();
  });

  it("should return null when is_transfer is true but pair_id is missing", () => {
    const payload: TransactionPayload = {
      amount: -100,
      category: "Transfer",
      notes: "",
      counterparty: "A → B",
      is_transfer: true,
    };
    expect(getTransferPairId(payload)).toBeNull();
  });
});

describe("stripTransferFields", () => {
  it("should remove all transfer-specific fields from a payload", () => {
    const payload: TransactionPayload = {
      amount: -100,
      category: "Transfer",
      notes: "test",
      counterparty: "A → B",
      commission: 5,
      is_transfer: true,
      transfer_pair_id: "pair-789",
      transfer_source_account_id: "src-1",
      transfer_target_account_id: "tgt-2",
      transfer_source_account_name: "Account A",
      transfer_target_account_name: "Account B",
    };
    const stripped = stripTransferFields(payload);
    expect(stripped.amount).toBe(-100);
    expect(stripped.category).toBe("Transfer");
    expect(stripped.notes).toBe("test");
    expect(stripped.counterparty).toBe("A → B");
    expect(stripped.commission).toBe(5);
    // Transfer fields should be removed
    expect((stripped as any).is_transfer).toBeUndefined();
    expect((stripped as any).transfer_pair_id).toBeUndefined();
    expect((stripped as any).transfer_source_account_id).toBeUndefined();
    expect((stripped as any).transfer_target_account_id).toBeUndefined();
    expect((stripped as any).transfer_source_account_name).toBeUndefined();
    expect((stripped as any).transfer_target_account_name).toBeUndefined();
  });

  it("should preserve non-transfer fields when stripping", () => {
    const payload: TransactionPayload = {
      amount: 200,
      category: "Salary",
      notes: "Monthly pay",
      counterparty: "Employer",
      commission: 10,
      interest_amount: 0,
    };
    const stripped = stripTransferFields(payload);
    expect(stripped.amount).toBe(200);
    expect(stripped.category).toBe("Salary");
    expect(stripped.notes).toBe("Monthly pay");
    expect(stripped.counterparty).toBe("Employer");
    expect(stripped.commission).toBe(10);
    expect(stripped.interest_amount).toBe(0);
  });

  it("should handle payload without transfer fields", () => {
    const payload: TransactionPayload = {
      amount: -50,
      category: "Food",
      notes: "",
      counterparty: "Restaurant",
    };
    const stripped = stripTransferFields(payload);
    expect(stripped).toEqual(payload);
  });
});

describe("effectiveAmount", () => {
  it("should compute expense with commission", () => {
    const payload: TransactionPayload = {
      amount: -100,
      category: "Food",
      notes: "",
      counterparty: "Shop",
      commission: 5,
    };
    expect(effectiveAmount(payload)).toBe(-105);
  });

  it("should compute income with commission", () => {
    const payload: TransactionPayload = {
      amount: 200,
      category: "Salary",
      notes: "",
      counterparty: "Employer",
      commission: 10,
    };
    expect(effectiveAmount(payload)).toBe(190);
  });

  it("should handle transfer payloads correctly", () => {
    const payload: TransactionPayload = {
      amount: -100,
      category: "Transfer",
      notes: "",
      counterparty: "A → B",
      is_transfer: true,
      transfer_pair_id: "pair-xyz",
    };
    expect(effectiveAmount(payload)).toBe(-100);
  });
});
