import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { apiFetch } from "@/lib/api";
import { API_BASE, ENDPOINTS } from "@/lib/constants";
import { useAuthStore } from "@/stores/auth-store";
import { decryptWithPassword, encryptWithPassword } from "@/lib/crypto";
import { ThemeToggle } from "@/components/shared/ThemeToggle";

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

  // --- Default currency ---
  const [defaultCurrency, setDefaultCurrency] = useState(() =>
    getSetting("budgeteer_default_currency", "EUR")
  );

  // --- Locale ---
  const [locale, setLocale] = useState(() =>
    getSetting("budgeteer_locale", "en")
  );

  // Persist currency and locale to localStorage on change
  useEffect(() => {
    setSetting("budgeteer_default_currency", defaultCurrency);
  }, [defaultCurrency]);

  useEffect(() => {
    setSetting("budgeteer_locale", locale);
    document.documentElement.lang = locale;
  }, [locale]);

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
            {pwSuccess && <p className="text-sm text-green-600">{pwSuccess}</p>}
            <Button type="submit">Change Password</Button>
          </form>

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
            {emailSuccess && <p className="text-sm text-green-600">{emailSuccess}</p>}
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
              <CardTitle>Locale / Language</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-3">
                Choose your preferred language. The UI will use this locale for
                formatting numbers and dates.
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
            </CardContent>
          </Card>

          {/* --- Theme Card --- */}
          <Card>
            <CardHeader>
              <CardTitle>Theme</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-3">
                Switch between light and dark mode.
              </p>
              <ThemeToggle />
            </CardContent>
          </Card>
        </div>
    </div>
    </div>
  );
}
