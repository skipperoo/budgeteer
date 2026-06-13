import { useState, useEffect } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { decryptWithPassword, base64ToBytes } from "@/lib/crypto";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

/**
 * PrivateKeyGate
 *
 * Wraps protected routes that require the user's plaintext private key
 * to decrypt data. If the user is authenticated (has a valid token and
 * an encrypted_private_key from the server) but the private key hasn't
 * been decrypted yet (e.g. after a page refresh where `hydrate()` ran
 * but the password was not available), this component shows a password
 * dialog to re-derive the key in-memory.
 *
 * The decrypted private key is stored in the Zustand auth store
 * (memory only — never persisted to localStorage/IndexedDB).
 * It is cleared on logout or tab close.
 */
export default function PrivateKeyGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const encryptedPrivateKey = useAuthStore((s) => s.encryptedPrivateKey);
  const plaintextPrivateKey = useAuthStore((s) => s.plaintextPrivateKey);
  const setPrivateKey = useAuthStore((s) => s.setPrivateKey);
  const hydrating = useAuthStore((s) => s.hydrating);

  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Don't show anything while the initial hydration is in flight
  if (hydrating) {
    return (
      <div className="h-screen flex items-center justify-center text-muted-foreground">
        Loading...
      </div>
    );
  }

  // Not authenticated at all — let the caller (ProtectedRoute) redirect
  if (!token || !user) {
    return <>{children}</>;
  }

  // Private key is already available — proceed normally
  if (plaintextPrivateKey) {
    return <>{children}</>;
  }

  // No encrypted key on the server (shouldn't happen for a valid user)
  if (!encryptedPrivateKey) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Card className="w-full max-w-sm mx-4">
          <CardHeader>
            <CardTitle className="text-xl text-center">
              Encryption Key Missing
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center text-sm text-muted-foreground">
            <p>
              Your encryption key was not found on the server. This may happen
              if your account was not set up correctly.
            </p>
            <Button
              className="mt-4 w-full"
              variant="outline"
              onClick={() => {
                useAuthStore.getState().logout();
                window.location.href = "/login";
              }}
            >
              Return to login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Private key is available on the server but not yet decrypted in memory.
  // Show a password prompt so the user can re-decrypt their key.
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const plaintextKey = await decryptWithPassword(
        encryptedPrivateKey,
        password
      );
      const keyBytes = base64ToBytes(plaintextKey).buffer;
      setPrivateKey(keyBytes as ArrayBuffer);
    } catch {
      setError("Incorrect password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen flex items-center justify-center">
      <Card className="w-full max-w-sm mx-4">
        <CardHeader>
          <CardTitle className="text-xl text-center">
            Enter your password
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4 text-center">
            Your encryption key needs to be unlocked to access your data.
          </p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Password</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoFocus
                placeholder="Enter your password"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Unlocking..." : "Unlock"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
