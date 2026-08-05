import { describe, it, expect, beforeEach } from "vitest";
import {
  formatNumber,
  formatCurrency,
  formatDate,
  formatDateLabel,
  formatDateTime,
  syncLocaleFromPreferences,
  parseLocaleExpression,
  parseLocaleNumber,
} from "./format";

const STORAGE_KEY = "budgeteer_locale";

beforeEach(() => {
  localStorage.clear();
});

describe("syncLocaleFromPreferences", () => {
  it("should store locale in localStorage", () => {
    syncLocaleFromPreferences("it");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("it");
  });

  it("should not store when locale is undefined", () => {
    syncLocaleFromPreferences(undefined);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("should not store when locale is empty", () => {
    syncLocaleFromPreferences("");
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});

describe("formatNumber", () => {
  it("should format number with default locale (en)", () => {
    // No locale set — defaults to "en"
    const result = formatNumber(1234.5);
    // en uses comma as thousands separator
    expect(result).toBe("1,234.50");
  });

  it("should format number with stored locale", () => {
    localStorage.setItem(STORAGE_KEY, "de");
    const result = formatNumber(1234.5);
    // German uses comma as decimal separator
    expect(result).toContain(",");
  });

  it("should format number with Italian locale", () => {
    localStorage.setItem(STORAGE_KEY, "it");
    // Italian uses comma as decimal separator
    const result = formatNumber(1234.5);
    expect(result).toContain(",");
  });

  it("should handle zero", () => {
    const result = formatNumber(0);
    expect(result).toBe("0.00");
  });

  it("should handle negative numbers", () => {
    const result = formatNumber(-567.89);
    expect(result).toBe("-567.89");
  });

  it("should fall back to en for unknown locale", () => {
    localStorage.setItem(STORAGE_KEY, "xx-UNKNOWN");
    const result = formatNumber(1000);
    expect(result).toBe("1,000.00"); // en fallback
  });
});

describe("formatCurrency", () => {
  it("should format positive amount without plus sign by default", () => {
    const result = formatCurrency(100.5, "USD");
    expect(result).toContain("$");
    expect(result).not.toContain("+");
    expect(result).not.toContain("-");
  });

  it("should format negative amount with minus sign", () => {
    const result = formatCurrency(-50, "EUR");
    expect(result).toContain("-");
    expect(result).toContain("€");
  });

  it("should show plus sign when requested", () => {
    const result = formatCurrency(25, "USD", true);
    expect(result).toContain("+$");
  });

  it("should use stored locale for number formatting", () => {
    localStorage.setItem(STORAGE_KEY, "de");
    const result = formatCurrency(1234.5, "EUR");
    // German: "1.234,50"
    expect(result).toContain("€");
    expect(result).toMatch(/[\d.]+,\d{2}/); // dot-thousands, comma-decimal
  });
});

describe("formatDate", () => {
  it("should format date with stored locale", () => {
    localStorage.setItem(STORAGE_KEY, "it");
    const result = formatDate("2024-06-15T12:00:00Z");
    // Italian: "15 giu 2024"
    expect(result).toContain("giu");
  });

  it("should format date with en locale", () => {
    const result = formatDate("2024-06-15T12:00:00Z");
    expect(result).toContain("Jun 15, 2024");
  });

  it("should pass through options", () => {
    const result = formatDate("2024-06-15T12:00:00Z", {
      month: "long",
      day: "numeric",
    });
    expect(result).toContain("June 15");
  });
});

describe("formatDateLabel", () => {
  it("should format date range with stored locale", () => {
    localStorage.setItem(STORAGE_KEY, "it");
    const result = formatDateLabel("2024-06-01", "2024-07-02");
    expect(result).toContain("giu");
    expect(result).toContain("–");
    expect(result).toContain("lug");
  });

  it("should format date range with en locale", () => {
    const result = formatDateLabel("2024-06-01", "2024-07-02");
    expect(result).toBe("Jun 1 – Jul 2");
  });
});

describe("formatDateTime", () => {
  it("should format date with time", () => {
    const result = formatDateTime("2024-06-15T14:30:00Z");
    // en locale, shows something like "Jun 15, 2024, 2:30 PM"
    expect(result).toContain("2024");
    expect(result).toMatch(/\d/); // contains digits for time
  });
});

describe("parseLocaleExpression", () => {
  it("parses simple addition (EN dot locale)", () => {
    localStorage.setItem(STORAGE_KEY, "en");
    expect(parseLocaleExpression("10 + 15")).toBe(25);
    expect(parseLocaleExpression("10.50 + 20")).toBe(30.5);
  });

  it("parses with comma decimal separator (IT locale)", () => {
    localStorage.setItem(STORAGE_KEY, "it");
    expect(parseLocaleExpression("10,50 + 20")).toBe(30.5);
    expect(parseLocaleExpression("10,50 + 20,25")).toBe(30.75);
  });

  it("supports + - * / and parentheses with precedence", () => {
    localStorage.setItem(STORAGE_KEY, "en");
    expect(parseLocaleExpression("(10 + 15) * 2")).toBe(50);
    expect(parseLocaleExpression("10 + 5 * 3")).toBe(25);
    expect(parseLocaleExpression("20 / 4 - 1")).toBe(4);
    expect(parseLocaleExpression("2 + 3 * 4 - 1")).toBe(13);
  });

  it("strips thousand separators per locale", () => {
    localStorage.setItem(STORAGE_KEY, "en");
    expect(parseLocaleExpression("1,000 + 5")).toBe(1005);
    localStorage.setItem(STORAGE_KEY, "it");
    expect(parseLocaleExpression("1.000 + 5")).toBe(1005);
  });

  it("returns null for invalid expressions", () => {
    localStorage.setItem(STORAGE_KEY, "en");
    expect(parseLocaleExpression("hello")).toBeNull();
    expect(parseLocaleExpression("10 +")).toBeNull();
    expect(parseLocaleExpression("(10 + 15")).toBeNull();
    expect(parseLocaleExpression("")).toBeNull();
    expect(parseLocaleExpression("10 + 15 +")).toBeNull();
  });
});

describe("expression result round-trips through parseLocaleNumber", () => {
  it("IT: evaluated '100,5 + 20 - 10' survives parseLocaleNumber without becoming 1105", () => {
    localStorage.setItem(STORAGE_KEY, "it");
    const result = parseLocaleExpression("100,5 + 20 - 10");
    expect(result).toBe(110.5);
    // The form saves formatNumber(result); the parent parses it back.
    const saved = formatNumber(result!); // "110,50" in IT
    expect(parseLocaleNumber(saved)).toBe(110.5);
  });

  it("EN: same expression round-trips too", () => {
    localStorage.setItem(STORAGE_KEY, "en");
    const result = parseLocaleExpression("100.5 + 20 - 10");
    const saved = formatNumber(result!); // "110.50" in EN
    expect(parseLocaleNumber(saved)).toBe(110.5);
  });

  it("integer results keep value through the round-trip", () => {
    localStorage.setItem(STORAGE_KEY, "it");
    const result = parseLocaleExpression("10 + 15");
    expect(result).toBe(25);
    expect(parseLocaleNumber(formatNumber(result!))).toBe(25);
  });
});
