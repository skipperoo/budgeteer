/**
 * Locale-aware date formatting.
 * Reads the user's stored locale from localStorage ("budgeteer_locale")
 * and formats dates consistently throughout the UI.
 */

const STORAGE_KEY = "budgeteer_locale";

/**
 * Sync the user's locale preference (loaded from the server) into localStorage
 * so formatting functions pick it up. Call this when user data loads.
 */
export function syncLocaleFromPreferences(locale?: string) {
  if (locale) {
    try { localStorage.setItem(STORAGE_KEY, locale); } catch { /* ignore */ }
  }
}

export function getStoredLocale(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "en";
  } catch {
    return "en";
  }
}

export const CURRENCIES = [
  { code: "EUR", symbol: "€", name: "Euro" },
  { code: "USD", symbol: "$", name: "US Dollar" },
  { code: "GBP", symbol: "£", name: "British Pound" },
  { code: "CHF", symbol: "Fr", name: "Swiss Franc" },
  { code: "JPY", symbol: "¥", name: "Japanese Yen" },
  { code: "CAD", symbol: "CA$", name: "Canadian Dollar" },
  { code: "AUD", symbol: "A$", name: "Australian Dollar" },
  { code: "BRL", symbol: "R$", name: "Brazilian Real" },
  { code: "CNY", symbol: "¥", name: "Chinese Yuan" },
  { code: "SEK", symbol: "kr", name: "Swedish Krona" },
  { code: "NOK", symbol: "kr", name: "Norwegian Krone" },
  { code: "DKK", symbol: "kr", name: "Danish Krone" },
  { code: "PLN", symbol: "zł", name: "Polish Zloty" },
  { code: "CZK", symbol: "Kč", name: "Czech Koruna" },
  { code: "HUF", symbol: "Ft", name: "Hungarian Forint" },
  { code: "INR", symbol: "₹", name: "Indian Rupee" },
  { code: "MXN", symbol: "Mex$", name: "Mexican Peso" },
] as const;

export function getCurrencySymbol(code: string): string {
  return CURRENCIES.find((c) => c.code === code)?.symbol || code;
}

/**
 * Parse a locale-formatted number string into a JavaScript number.
 *
 * Detects the decimal separator by probing the user's stored locale:
 *   - en → decimal is ".", thousand separator is ","
 *   - it → decimal is ",", thousand separator is "."
 *
 * Strips thousand separators and replaces the locale decimal separator
 * with "." before passing to parseFloat.
 *
 * Returns 0 for empty or unparseable input.
 */
export function parseLocaleNumber(text: string): number {
  if (!text) return 0;
  const locale = getStoredLocale();
  let cleaned = text.trim().replace(/\s/g, "");
  if (!cleaned) return 0;

  // Detect decimal separator from locale by formatting a known value
  const testFormat = (1.1).toLocaleString(locale);
  const decimalSep = testFormat.includes(",") ? "," : ".";
  const thousandSep = decimalSep === "." ? "," : ".";

  // Remove thousand separators
  cleaned = cleaned.split(thousandSep).join("");
  // Replace locale decimal separator with JS standard
  if (decimalSep !== ".") {
    cleaned = cleaned.replace(decimalSep, ".");
  }

  const result = parseFloat(cleaned);
  return isNaN(result) ? 0 : result;
}

/**
 * Evaluate a locale-aware arithmetic expression like "10,50 + 20" (IT) or
 * "10.50 + 20" (EN). Supports + - * / and parentheses with standard
 * precedence, e.g. "(10 + 15) * 2" → 50.
 *
 * Thousand separators are stripped and the locale decimal separator is
 * normalised to "." before tokenising, so IT input "1.000,50 + 5" →
 * 1000.50 + 5 and EN "1,000.50 + 5" → 1000.50 + 5.
 *
 * Returns the evaluated number, or null if the expression is not a valid
 * arithmetic expression.
 */
export function parseLocaleExpression(text: string): number | null {
  if (!text || !text.trim()) return null;
  const locale = getStoredLocale();
  const testFormat = (1.1).toLocaleString(locale);
  const decimalSep = testFormat.includes(",") ? "," : ".";
  const thousandSep = decimalSep === "." ? "," : ".";

  let expr = text.trim();
  // Strip thousand separators (they are never meaningful inside an
  // expression operand; e.g. EN "1,000" → "1000").
  expr = expr.split(thousandSep).join("");
  // Normalise the locale decimal separator to ".".
  if (decimalSep !== ".") {
    expr = expr.split(decimalSep).join(".");
  }
  // Allow only digits, operators, parens, dots and spaces.
  if (!/^[\d\s+\-*/().]+$/.test(expr)) return null;

  try {
    const parser = new ExprParser(expr);
    const value = parser.parse();
    if (!parser.atEnd()) return null; // trailing garbage
    return Number.isFinite(value) ? round2(value) : null;
  } catch {
    return null;
  }
}

/** Minimal recursive-descent arithmetic parser (no eval). */
class ExprParser {
  private i = 0;
  constructor(private src: string) {}

  atEnd(): boolean {
    this.skipWs();
    return this.i >= this.src.length;
  }

  parse(): number {
    const v = this.parseExpression();
    this.skipWs();
    return v;
  }

  private skipWs(): void {
    while (this.i < this.src.length && /\s/.test(this.src[this.i])) this.i++;
  }

  private peek(): string {
    this.skipWs();
    return this.src[this.i] ?? "";
  }

  // expression := term (('+' | '-') term)*
  private parseExpression(): number {
    let left = this.parseTerm();
    for (;;) {
      const op = this.peek();
      if (op === "+" || op === "-") {
        this.i++;
        const right = this.parseTerm();
        left = op === "+" ? left + right : left - right;
      } else {
        return left;
      }
    }
  }

  // term := factor (('*' | '/') factor)*
  private parseTerm(): number {
    let left = this.parseFactor();
    for (;;) {
      const op = this.peek();
      if (op === "*" || op === "/") {
        this.i++;
        const right = this.parseFactor();
        left = op === "*" ? left * right : left / right;
      } else {
        return left;
      }
    }
  }

  // factor := number | '(' expression ')' | '-' factor | '+' factor
  private parseFactor(): number {
    this.skipWs();
    const ch = this.src[this.i] ?? "";
    if (ch === "(") {
      this.i++;
      const v = this.parseExpression();
      this.skipWs();
      if (this.src[this.i] !== ")") throw new Error("unbalanced parens");
      this.i++;
      return v;
    }
    if (ch === "-" || ch === "+") {
      this.i++;
      const v = this.parseFactor();
      return ch === "-" ? -v : v;
    }
    const start = this.i;
    while (this.i < this.src.length && /[\d.]/.test(this.src[this.i])) this.i++;
    if (start === this.i) throw new Error("expected number");
    const numStr = this.src.slice(start, this.i);
    const value = parseFloat(numStr);
    if (isNaN(value)) throw new Error("bad number");
    return value;
  }
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Format a number using the user's stored locale.
 * Falls back to "en" if the stored locale is not supported.
 */
export function formatNumber(
  value: number,
  options: Intl.NumberFormatOptions = {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }
): string {
  const locale = getStoredLocale();
  try {
    return value.toLocaleString(locale, options);
  } catch {
    return value.toLocaleString("en", options);
  }
}

/**
 * Format a number as currency with a symbol, using stored locale for digit grouping.
 */
export function formatCurrency(
  amount: number,
  currencyCode: string,
  showPlus = false
): string {
  const symbol = getCurrencySymbol(currencyCode);
  const isPositive = amount >= 0;
  const absAmount = formatNumber(Math.abs(amount));

  const sign = isPositive ? (showPlus ? "+" : "") : "-";
  return `${sign}${symbol}${absAmount}`;
}

/**
 * Format a short date range label like "Jun 2 – Jul 2" using stored locale.
 */
export function formatDateLabel(start: string, end: string): string {
  const locale = getStoredLocale();
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  try {
    const s = new Date(start + "T12:00:00").toLocaleDateString(locale, opts);
    const e = new Date(end + "T12:00:00").toLocaleDateString(locale, opts);
    return `${s} – ${e}`;
  } catch {
    const s = new Date(start + "T12:00:00").toLocaleDateString("en", opts);
    const e = new Date(end + "T12:00:00").toLocaleDateString("en", opts);
    return `${s} – ${e}`;
  }
}

/**
 * Format a date string using the user's stored locale preference.
 * Falls back gracefully if the locale isn't supported by the browser.
 */
export function formatDate(
  dateString: string,
  options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "numeric",
  }
): string {
  const locale = getStoredLocale();
  try {
    return new Date(dateString).toLocaleDateString(locale, options);
  } catch {
    // Fallback if the locale isn't supported
    return new Date(dateString).toLocaleDateString("en", options);
  }
}

/**
 * Format a date with time, using stored locale.
 */
export function formatDateTime(dateString: string): string {
  const locale = getStoredLocale();
  try {
    return new Date(dateString).toLocaleString(locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return new Date(dateString).toLocaleString("en", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
}

/**
 * Returns the local timezone offset string like "GMT+2" or "GMT-5".
 */
export function getGMTOffset(): string {
  const offset = -new Date().getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const hours = Math.floor(Math.abs(offset) / 60);
  const minutes = Math.abs(offset) % 60;
  return `GMT${sign}${hours}${minutes > 0 ? `:${String(minutes).padStart(2, "0")}` : ""}`;
}

/**
 * Formats a date string with both the local time and the GMT offset:
 * e.g. "Jun 16, 2026, 2:30 PM (GMT+2)"
 */
export function formatDateTimeWithOffset(dateString: string): string {
  const locale = getStoredLocale();
  try {
    const local = new Date(dateString).toLocaleString(locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    return `${local} (${getGMTOffset()})`;
  } catch {
    return formatDateTime(dateString);
  }
}

/**
 * Converts a UTC ISO string to a local datetime-local input value (YYYY-MM-DDTHH:MM).
 */
export function utcToLocalDatetime(utcStr: string): string {
  const d = new Date(utcStr);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}
