import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { ENDPOINTS } from "@/lib/constants";
import { useAuthStore } from "@/stores/auth-store";
import { decryptWithPassword, base64ToBytes } from "@/lib/crypto";
import type { LoginInitResponse, LoginResponse, User } from "@/types";

export default function LoginPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const setPrivateKey = useAuthStore((s) => s.setPrivateKey);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Step 2: OTP verification
  const [sessionID, setSessionID] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [showOTP, setShowOTP] = useState(false);

  // Step 1: Submit email + password to get session_id
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
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

      // Decode the base64-encoded private key into raw bytes.
      const keyBytes = base64ToBytes(plaintextKey).buffer;

      setAuth(token, user, user.encrypted_private_key);
      setPrivateKey(keyBytes as ArrayBuffer);

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
