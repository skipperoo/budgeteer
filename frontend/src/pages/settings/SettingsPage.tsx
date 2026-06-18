import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { apiFetch } from "@/lib/api";
import { API_BASE, ENDPOINTS } from "@/lib/constants";
import { useAuthStore } from "@/stores/auth-store";
import { decryptWithPassword, encryptWithPassword } from "@/lib/crypto";
import PinSetupSection from "@/components/auth/PinSetupSection";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { useAccent, type ThemeKey } from "@/hooks/use-accent";
import { isPinEnabled, storePinData, clearPinData, getPinData, clearDeviceFingerprint } from "@/lib/utils";
import type { UserPreferences } from "@/types";

const CURRENCIES = [
  { code: "EUR", symbol: "€", name: "Euro" },
  { code: "USD", symbol: "$", name: "US Dollar" },
  { code: "GBP", symbol: "£", name: "British Pound" },
  { code: "CHF", symbol: "Fr", name: "Swiss Franc" },
  { code: "JPY", symbol: "¥", name: "Japanese Yen" },
  { code: "CAD", symbol: "CA$", name: "Canadian Dollar" },
  { code: "BRL", symbol: "R$", name: "Brazilian Real" },
];

const LOCALES = [
  { code: "en", name: "English" },
  { code: "it", name: "Italiano" },
  { code: "de", name: "Deutsch" },
  { code: "fr", name: "Français" },
  { code: "es", name: "Español" },
  { code: "pt", name: "Português" },
];

// Read a string setting from localStorage with a default.
function getSetting(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function setSetting(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch { /* ignore quota errors */ }
}

export default function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const encryptedPrivateKey = useAuthStore((s) => s.encryptedPrivateKey);

  // --- Password change ---
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState("");

  // --- Email change ---
  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailError, setEmailError] = useState("");
  const [emailSuccess, setEmailSuccess] = useState("");

  // --- Default currency (from DB preference, fallback to localStorage) ---
  const [defaultCurrency, setDefaultCurrency] = useState(() => {
    const fromPrefs = user?.preferences?.default_currency;
    if (fromPrefs) return fromPrefs;
    return getSetting("budgeteer_default_currency", "EUR");
  });

  // --- Default commission ---
  const [defaultCommission, setDefaultCommission] = useState(() => {
    try {
      return localStorage.getItem("budgeteer_default_commission") ?? "";
    } catch { return ""; }
  });

  // Sync from server preferences when user data loads
  useEffect(() => {
    const fromPrefs = user?.preferences?.default_commission;
    if (fromPrefs != null && fromPrefs > 0) {
      setDefaultCommission(String(fromPrefs));
    }
  }, [user?.preferences?.default_commission]);

  // --- Locale (from DB preference, fallback to localStorage) ---
  const [locale, setLocale] = useState(() => {
    const fromPrefs = user?.preferences?.locale;
    if (fromPrefs) return fromPrefs;
    return getSetting("budgeteer_locale", "en");
  });

  // --- Accent color ---
  const { themeKey, setAccent, presets } = useAccent();

  // Persist currency and locale to localStorage and DB on change
  useEffect(() => {
    setSetting("budgeteer_default_currency", defaultCurrency);
  }, [defaultCurrency]);

  useEffect(() => {
    setSetting("budgeteer_locale", locale);
    document.documentElement.lang = locale;
  }, [locale]);

  // Debounced save preferences to DB
  const [prefsSaving, setPrefsSaving] = useState(false);
  const savePreferences = useCallback(async (currency: string, loc: string) => {
    setPrefsSaving(true);
    try {
      const currentPrefs = user?.preferences ?? { accent_color: "slate" };
      await apiFetch(ENDPOINTS.preferences, {
        method: "PUT",
        body: JSON.stringify({
          preferences: {
            ...currentPrefs,
            default_currency: currency,
            locale: loc,
          } as UserPreferences,
        }),
      });
    } catch (err: any) {
      console.error("Failed to save preferences:", err);
    } finally {
      setPrefsSaving(false);
    }
  }, [user]);

  const prefsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (prefsTimerRef.current) clearTimeout(prefsTimerRef.current);
    prefsTimerRef.current = setTimeout(() => {
      savePreferences(defaultCurrency, locale);
    }, 1500);
    return () => {
      if (prefsTimerRef.current) clearTimeout(prefsTimerRef.current);
    };
  }, [defaultCurrency, locale, savePreferences]);

  // Save default commission to backend when it changes (debounced save)
  const [commissionSaving, setCommissionSaving] = useState(false);
  const saveCommission = useCallback(async (value: string) => {
    const numValue = value ? parseFloat(value) : 0;
    if (isNaN(numValue) || numValue < 0) return;
    setCommissionSaving(true);
    try {
      const currentPrefs = user?.preferences ?? { accent_color: "slate" };
      await apiFetch(ENDPOINTS.preferences, {
        method: "PUT",
        body: JSON.stringify({
          preferences: {
            ...currentPrefs,
            default_commission: numValue,
          } as UserPreferences,
        }),
      });
    } catch (err: any) {
      console.error("Failed to save default commission:", err);
    } finally {
      setCommissionSaving(false);
    }
  }, [user]);

  // Debounced save: trigger 1.5s after the user stops typing
  const commissionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (commissionTimerRef.current) clearTimeout(commissionTimerRef.current);
    commissionTimerRef.current = setTimeout(() => {
      saveCommission(defaultCommission);
    }, 1500);
    return () => {
      if (commissionTimerRef.current) clearTimeout(commissionTimerRef.current);
    };
  }, [defaultCommission, saveCommission]);

  // --- Password change (P0.2 fix) ---
  // Per AGENTS.md: re-encrypt the EXISTING private key with the new password,
  // rather than generating a new keypair (which would destroy access to past data).
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError("");
    setPwSuccess("");

    if (!encryptedPrivateKey) {
      setPwError("No private key found. Please log in again.");
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setPwError("New passwords do not match");
      return;
    }

    try {
      // 1. Decrypt the existing private key with the CURRENT password
      const plaintextKey = await decryptWithPassword(
        encryptedPrivateKey,
        currentPassword
      );

      // 2. Re-encrypt the SAME private key with the NEW password
      const newEncryptedKey = await encryptWithPassword(
        plaintextKey,
        newPassword
      );

      // 3. Send the re-encrypted key to the backend
      await apiFetch(ENDPOINTS.changePassword, {
        method: "PUT",
        body: JSON.stringify({
          password: currentPassword,
          new_encrypted_private_key: newEncryptedKey,
        }),
      });

      setPwSuccess("Password changed successfully. Please log in again.");
      setTimeout(() => logout(), 2000);
    } catch (err: any) {
      setPwError(err.message);
    }
  };

  // --- Email change (P3.3) ---
  const handleChangeEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError("");
    setEmailSuccess("");

    try {
      await apiFetch(`${API_BASE}/auth/email`, {
        method: "PUT",
        body: JSON.stringify({
          password: emailPassword,
          new_email: newEmail,
        }),
      });
      setEmailSuccess(
        "Verification email sent to the new address. Please check your inbox."
      );
      setNewEmail("");
      setEmailPassword("");
    } catch (err: any) {
      setEmailError(err.message);
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4">
      <h1 className="text-3xl font-bold mb-6">Settings</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: Account card (wider) */}
        <div className="lg:col-span-2">
          <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium">Email</label>
            <p className="text-sm text-muted-foreground">{user?.email ?? "—"}</p>
          </div>

          <Separator />

          {/* Password Change */}
          <form onSubmit={handleChangePassword} className="space-y-4">
            <h3 className="text-sm font-medium">Change Password</h3>
            <div className="space-y-2">
              <label className="text-sm font-medium">Current Password</label>
              <Input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">New Password</label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Confirm New Password</label>
              <Input
                type="password"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>
            {pwError && <p className="text-sm text-destructive">{pwError}</p>}
            {pwSuccess && <p className="text-sm text-income">{pwSuccess}</p>}
            <Button type="submit">Change Password</Button>
          </form>

          <Separator />

          {/* PIN Unlock Setup */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium">PIN Unlock</h3>
            <p className="text-xs text-muted-foreground">
              Set a 4-6 digit PIN to unlock your encryption key without typing your full password.
              The PIN is never sent to the server and only stored locally.
            </p>
            <PinSetupSection />
          </div>

          <Separator />

          {/* Email Change */}
          <form onSubmit={handleChangeEmail} className="space-y-4">
            <h3 className="text-sm font-medium">Change Email</h3>
            <div className="space-y-2">
              <label className="text-sm font-medium">New Email</label>
              <Input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                required
                placeholder="new@example.com"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Current Password</label>
              <Input
                type="password"
                value={emailPassword}
                onChange={(e) => setEmailPassword(e.target.value)}
                required
              />
            </div>
            {emailError && <p className="text-sm text-destructive">{emailError}</p>}
            {emailSuccess && <p className="text-sm text-income">{emailSuccess}</p>}
            <Button type="submit">Change Email</Button>
          </form>
        </CardContent>
      </Card>
    </div>

        {/* Right column: Currency + Locale */}
        <div className="space-y-6 lg:col-span-1">
          {/* --- Default Currency Card --- */}
          <Card>
            <CardHeader>
              <CardTitle>Default Currency</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-3">
                Set your preferred default currency for new accounts.
              </p>
              <select
                value={defaultCurrency}
                onChange={(e) => setDefaultCurrency(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              >
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.symbol} {c.name}
                  </option>
                ))}
              </select>
            </CardContent>
          </Card>

          {/* --- Locale Card --- */}
          <Card>
            <CardHeader>
              <CardTitle>Locale</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-3">
                Choose your preferred language for formatting numbers, dates, and currency.
              </p>
              <select
                value={locale}
                onChange={(e) => setLocale(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              >
                {LOCALES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.name}
                  </option>
                ))}
              </select>
              <div className="mt-3 text-xs text-muted-foreground space-y-0.5">
                <p>
                  Date:{" "}
                  {new Intl.DateTimeFormat(locale || "en", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  }).format(new Date())}
                </p>
                <p>
                  Number:{" "}
                  {(1234567.89).toLocaleString(locale || "en", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* --- Default Commission Card --- */}
          <Card>
            <CardHeader>
              <CardTitle>Default Commission</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-3">
                Pre-fill the commission/fee field when creating new transactions.
              </p>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={defaultCommission}
                  onChange={(e) => setDefaultCommission(e.target.value)}
                  placeholder="0.00"
                  className="w-28"
                />
                <span className="text-sm text-muted-foreground">per transaction</span>
              </div>
            </CardContent>
          </Card>

          {/* --- Appearance Card (Theme + Accent Color) --- */}
          <Card>
            <CardHeader>
              <CardTitle>Appearance</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium block mb-2">Mode</label>
                <ThemeToggle />
              </div>
              <div>
                <label className="text-sm font-medium block mb-2">Accent Color</label>
                <p className="text-sm text-muted-foreground mb-3">
                  Choose your preferred accent color for buttons and highlights.
                </p>
                <div className="grid grid-cols-3 gap-2">
                {(Object.entries(presets) as [ThemeKey, typeof presets[ThemeKey]][]).map(([key, def]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setAccent(key)}
                    className={`
                      flex flex-col items-center gap-1.5 p-2 rounded-lg border transition-all duration-150 cursor-pointer
                      ${themeKey === key
                        ? "border-ring ring-1 ring-ring"
                        : "border-border hover:border-muted-foreground/30"
                      }
                    `}
                    title={def.label}
                  >
                    <span
                      className="w-6 h-6 rounded-full shrink-0"
                      style={{ backgroundColor: def.light.primary }}
                    />
                    <span className="text-[10px] font-medium text-muted-foreground leading-tight text-center">
                      {def.label}
                    </span>
                  </button>
                ))}
              </div>
              </div>
            </CardContent>
          </Card>
        </div>
    </div>
    </div>
  );
}
