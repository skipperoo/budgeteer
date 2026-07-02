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

function getStoredLocale(): string {
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
