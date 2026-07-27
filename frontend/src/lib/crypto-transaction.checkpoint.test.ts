import { describe, it, expect } from "vitest";
import {
  monthEndOf,
  transactionMonthEnd,
  currentMonthEnd,
  previousMonthEnd,
  iterMonthEnds,
  encryptCheckpointBlob,
  decryptCheckpointBlob,
} from "./crypto-transaction";
import { generateAccountKey } from "./crypto";

describe("checkpoint month bucketing (UTC)", () => {
  it("monthEndOf returns the last UTC day of the month", () => {
    expect(monthEndOf("2025-01-15T10:00:00Z")).toBe("2025-01-31");
    expect(monthEndOf("2025-02-10T10:00:00Z")).toBe("2025-02-28"); // non-leap 2025
    expect(monthEndOf("2024-02-10T10:00:00Z")).toBe("2024-02-29"); // leap year
    expect(monthEndOf("2025-07-31T23:59:59Z")).toBe("2025-07-31");
    expect(monthEndOf(new Date(Date.UTC(2025, 11, 15)))).toBe("2025-12-31");
  });

  it("transactionMonthEnd buckets by the UTC date of tx.time", () => {
    expect(transactionMonthEnd("2025-03-01T00:00:00Z")).toBe("2025-03-31");
    // Late evening UTC on the last day still lands in the same month.
    expect(transactionMonthEnd("2025-03-31T23:59:59Z")).toBe("2025-03-31");
    // 22:00 UTC on the 1st is still the 1st in UTC.
    expect(transactionMonthEnd("2025-04-01T22:00:00Z")).toBe("2025-04-30");
  });

  it("currentMonthEnd returns the end of the current UTC month", () => {
    const now = new Date();
    const expected = monthEndOf(now);
    expect(currentMonthEnd()).toBe(expected);
  });

  it("previousMonthEnd returns the end of the prior month", () => {
    expect(previousMonthEnd("2025-02-15T00:00:00Z")).toBe("2025-01-31");
    expect(previousMonthEnd("2025-01-15T00:00:00Z")).toBe("2024-12-31");
    expect(previousMonthEnd("2026-03-01T00:00:00Z")).toBe("2026-02-28");
  });

  it("iterMonthEnds yields every month-end inclusive, ascending", () => {
    const out = Array.from(iterMonthEnds("2025-01-31", "2025-04-30"));
    expect(out).toEqual(["2025-01-31", "2025-02-28", "2025-03-31", "2025-04-30"]);
  });

  it("iterMonthEnds handles a single-month range", () => {
    expect(Array.from(iterMonthEnds("2025-07-31", "2025-07-31"))).toEqual(["2025-07-31"]);
  });

  it("iterMonthEnds handles year boundaries", () => {
    const out = Array.from(iterMonthEnds("2024-11-30", "2025-02-28"));
    expect(out).toEqual(["2024-11-30", "2024-12-31", "2025-01-31", "2025-02-28"]);
  });
});

describe("checkpoint blob crypto", () => {
  it("encrypts and decrypts a checkpoint blob with the account key", async () => {
    const key = generateAccountKey();
    const blob = { balance: 12345.67, tx_count: 42 };
    const enc = await encryptCheckpointBlob(blob, key);
    expect(enc).not.toEqual(JSON.stringify(blob));
    const dec = await decryptCheckpointBlob(enc, key);
    expect(dec).toEqual(blob);
  });

  it("returns null when decryption fails (wrong key)", async () => {
    const key1 = generateAccountKey();
    const key2 = generateAccountKey();
    const enc = await encryptCheckpointBlob({ balance: 10, tx_count: 1 }, key1);
    const dec = await decryptCheckpointBlob(enc, key2);
    expect(dec).toBeNull();
  });

  it("round-trips zero / negative balances without loss", async () => {
    const key = generateAccountKey();
    for (const b of [
      { balance: 0, tx_count: 0 },
      { balance: -50.5, tx_count: 3 },
      { balance: 9999999.99, tx_count: 1000 },
    ]) {
      const enc = await encryptCheckpointBlob(b, key);
      expect(await decryptCheckpointBlob(enc, key)).toEqual(b);
    }
  });
});