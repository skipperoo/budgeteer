import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { encryptWithPassword, decryptWithPassword } from "@/lib/crypto";
import { useAuthStore } from "@/stores/auth-store";
import { storePinData, clearPinData, isPinEnabled, getPinData } from "@/lib/utils";

/**
 * PinSetupSection
 *
 * Allows the user to set or change a PIN that can be used to unlock
 * their encryption key instead of entering the full password.
 *
 * The password is encrypted with the PIN and stored in localStorage.
 * The PIN is NEVER sent to the server — it's entirely client-side.
 */
export default function PinSetupSection() {
  const user = useAuthStore((s) => s.user);
  const encryptedPrivateKey = useAuthStore((s) => s.encryptedPrivateKey);

  const [pinEnabled, setPinEnabled] = useState(() => isPinEnabled());

  // Set PIN flow
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [pinSuccess, setPinSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  // Disable PIN flow
  const [disablePinPassword, setDisablePinPassword] = useState("");
  const [disableError, setDisableError] = useState("");

  // Enable PIN: encrypt the user's password with the PIN and store it
  const handleEnablePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError("");
    setPinSuccess("");
    setLoading(true);

    try {
      if (newPin !== confirmPin) {
        setPinError("PINs do not match");
        return;
      }
      if (newPin.length < 4 || newPin.length > 6) {
        setPinError("PIN must be 4-6 digits");
        return;
      }
      if (!/^\d+$/.test(newPin)) {
        setPinError("PIN must contain only digits");
        return;
      }

      // Verify the password by trying to decrypt the private key
      if (!encryptedPrivateKey) {
        setPinError("No encryption key found. Please log in again.");
        return;
      }

      await decryptWithPassword(encryptedPrivateKey, currentPassword);

      // Encrypt the password with the PIN
      const encryptedPassword = await encryptWithPassword(currentPassword, newPin);

      // Store it locally
      storePinData(encryptedPassword);
      setPinEnabled(true);
      setPinSuccess("PIN unlock enabled successfully.");
      setCurrentPassword("");
      setNewPin("");
      setConfirmPin("");
    } catch (err: any) {
      setPinError(err.message || "Invalid password");
    } finally {
      setLoading(false);
    }
  };

  // Disable PIN: remove the stored encrypted password
  const handleDisablePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setDisableError("");
    setPinSuccess("");

    try {
      const pinData = getPinData();
      if (!pinData) {
        clearPinData();
        setPinEnabled(false);
        return;
      }

      // Verify the current PIN by decrypting the stored password
      await decryptWithPassword(pinData.encrypted_password, disablePinPassword);

      clearPinData();
      setPinEnabled(false);
      setDisablePinPassword("");
      setPinSuccess("PIN unlock disabled.");
    } catch {
      setDisableError("Incorrect PIN");
    }
  };

  if (!user) return null;

  return (
    <div>
      {pinEnabled ? (
        <div className="space-y-3">
          <p className="text-xs text-income">PIN unlock is active</p>
          <form onSubmit={handleDisablePin} className="space-y-2">
            <div className="space-y-1">
              <label className="text-xs font-medium">Enter current PIN to disable</label>
              <Input
                type="password"
                inputMode="numeric"
                value={disablePinPassword}
                onChange={(e) => setDisablePinPassword(e.target.value)}
                required
                placeholder="Enter your PIN"
                maxLength={6}
                className="w-40"
              />
            </div>
            {disableError && <p className="text-xs text-destructive">{disableError}</p>}
            {pinSuccess && <p className="text-xs text-income">{pinSuccess}</p>}
            <Button type="submit" variant="outline" size="sm">
              Disable PIN
            </Button>
          </form>
        </div>
      ) : (
        <form onSubmit={handleEnablePin} className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium">Current Password</label>
            <Input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              placeholder="Enter your password"
              className="w-60"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">New PIN (4-6 digits)</label>
            <Input
              type="password"
              inputMode="numeric"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value)}
              required
              placeholder="Enter PIN"
              maxLength={6}
              className="w-40"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Confirm PIN</label>
            <Input
              type="password"
              inputMode="numeric"
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value)}
              required
              placeholder="Confirm PIN"
              maxLength={6}
              className="w-40"
            />
          </div>
          {pinError && <p className="text-xs text-destructive">{pinError}</p>}
          {pinSuccess && <p className="text-xs text-income">{pinSuccess}</p>}
          <Button type="submit" size="sm" disabled={loading}>
            {loading ? "Setting up..." : "Enable PIN Unlock"}
          </Button>
        </form>
      )}
    </div>
  );
}
