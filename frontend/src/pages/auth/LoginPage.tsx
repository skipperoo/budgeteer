import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { ENDPOINTS } from "@/lib/constants";
import { useAuthStore } from "@/stores/auth-store";
import { decryptWithPassword, base64ToBytes } from "@/lib/crypto";
import { getDeviceFingerprint, getDeviceToken, storeDeviceToken, clearDeviceToken } from "@/lib/utils";
import type { LoginInitResponse, LoginResponse, User } from "@/types";

function generateDeviceToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export default function LoginPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const setPrivateKey = useAuthStore((s) => s.setPrivateKey);

  // Clear any stale sessionStorage caches (account keys, etc.) so that
  // fresh keys are always retrieved from the backend after login.
  useEffect(() => {
    sessionStorage.clear();
  }, []);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Step 2: OTP verification
  const [sessionID, setSessionID] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [showOTP, setShowOTP] = useState(false);

  // Remember device
  const [rememberDevice, setRememberDevice] = useState(false);

  // Attempt device-based login first on mount (when there is a saved device token)
  useEffect(() => {
    // We don't auto-try here; the user must submit the form first.
    // The device check happens in handlePasswordSubmit.
  }, []);

  // Step 1: Submit email + password to get session_id
  // Before requesting OTP, check if we have a stored device token.
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      // Check if there's a stored device token for this email
      const storedDevice = getDeviceToken(email);
      if (storedDevice) {
        // Try device-based login first (skips OTP)
        try {
          const { token } = await apiFetch<LoginResponse>(ENDPOINTS.loginWithDevice, {
            method: "POST",
            body: JSON.stringify({
              email,
              password,
              fingerprint_hash: storedDevice.fingerprint,
              device_token: storedDevice.token,
            }),
          });

          // Device recognized! Complete login without OTP
          const user = await apiFetch<User>(ENDPOINTS.me, {
            headers: { Authorization: `Bearer ${token}` },
          });

          const plaintextKey = await decryptWithPassword(
            user.encrypted_private_key,
            password
          );
          const keyBytes = base64ToBytes(plaintextKey).buffer;

          setAuth(token, user, user.encrypted_private_key);
          setPrivateKey(keyBytes as ArrayBuffer);

          navigate("/dashboard", { replace: true });
          return; // Done
        } catch {
          // Device not recognized or token expired — fall through to OTP
          clearDeviceToken();
        }
      }

      const { session_id } = await apiFetch<LoginInitResponse>(ENDPOINTS.login, {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });

      setSessionID(session_id);
      setShowOTP(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Helper to compute bcrypt(device_token + fingerprint + password)
  // We use the same bcrypt-like approach: the frontend simulates a bcrypt hash
  // via a simple SHA-256 for display purposes; the actual bcrypt is computed
  // in the backend on store.
  // We send the backend the bcrypt hash of (token + fingerprint + password)
  // computed by the frontend. For simplicity, we hash the payload client-side
  // and send it as the secret_hash.
  const computeSecretHash = async (
    token: string,
    fingerprint: string,
    pw: string
  ): Promise<string> => {
    const enc = new TextEncoder();
    const data = enc.encode(token + fingerprint + pw);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  };

  // Step 2: Submit OTP code to get JWT
  const handleOTPSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const { token } = await apiFetch<LoginResponse>(ENDPOINTS.loginVerifyOTP, {
        method: "POST",
        body: JSON.stringify({ session_id: sessionID, code: otpCode }),
      });

      // Fetch full user profile from /me
      const user = await apiFetch<User>(ENDPOINTS.me, {
        headers: { Authorization: `Bearer ${token}` },
      });

      // Decrypt the private key with the user's password
      const plaintextKey = await decryptWithPassword(
        user.encrypted_private_key,
        password
      );
      const keyBytes = base64ToBytes(plaintextKey).buffer;

      setAuth(token, user, user.encrypted_private_key);
      setPrivateKey(keyBytes as ArrayBuffer);

      // If "Remember this device" was checked, store a device token
      if (rememberDevice) {
        try {
          const fingerprint = await getDeviceFingerprint();
          const deviceToken = generateDeviceToken();

          // Compute hash client-side: SHA-256(device_token + fingerprint + password)
          // The server will bcrypt this hash when storing.
          const secretHash = await computeSecretHash(deviceToken, fingerprint, password);

          await apiFetch(ENDPOINTS.devices, {
            method: "POST",
            body: JSON.stringify({
              fingerprint_hash: fingerprint,
              secret_hash: secretHash,
              device_name: navigator.platform || "Unknown device",
            }),
          });

          storeDeviceToken(fingerprint, deviceToken, email);
        } catch {
          // Silent: if remember-device fails, the login still succeeds
          console.error("Failed to store device secret");
        }
      }

      navigate("/dashboard", { replace: true });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen flex items-center justify-center">
      <Card className="w-full max-w-sm mx-4">
        <CardHeader>
          <CardTitle className="text-2xl text-center">Budgeteer</CardTitle>
        </CardHeader>
        <CardContent>
          {!showOTP ? (
            /* Step 1: Email + Password */
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Email</label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Password</label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Signing in..." : "Sign in"}
              </Button>
              <p className="text-sm text-center text-muted-foreground">
                Don&apos;t have an account?{" "}
                <Link to="/register" className="text-primary hover:underline">
                  Register
                </Link>
              </p>
            </form>
          ) : (
            /* Step 2: OTP Verification */
            <form onSubmit={handleOTPSubmit} className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Enter the verification code sent to {email}
              </p>
              <div className="space-y-2">
                <label className="text-sm font-medium">OTP Code</label>
                <Input
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  required
                  placeholder="Enter 6-digit code"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="remember-device"
                  type="checkbox"
                  checked={rememberDevice}
                  onChange={(e) => setRememberDevice(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                />
                <label
                  htmlFor="remember-device"
                  className="text-sm text-muted-foreground cursor-pointer select-none"
                >
                  Remember this device
                </label>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Verifying..." : "Verify"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => setShowOTP(false)}
                disabled={loading}
              >
                Back
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
