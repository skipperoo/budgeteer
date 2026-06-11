/**
 * Locale-aware date formatting.
 * Reads the user's stored locale from localStorage ("budgeteer_locale")
 * and formats dates consistently throughout the UI.
 */

const STORAGE_KEY = "budgeteer_locale";

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
 * Format a number as currency with a symbol.
 */
export function formatCurrency(
  amount: number,
  currencyCode: string,
  showPlus = false
): string {
  const symbol = getCurrencySymbol(currencyCode);
  const isPositive = amount >= 0;
  const absAmount = Math.abs(amount).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const sign = isPositive ? (showPlus ? "+" : "") : "-";
  return `${sign}${symbol}${absAmount}`;
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
