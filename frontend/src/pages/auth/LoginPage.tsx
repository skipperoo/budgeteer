import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { ENDPOINTS } from "@/lib/constants";
import { useAuthStore } from "@/stores/auth-store";
import { decryptWithPassword } from "@/lib/crypto";
import type { LoginResponse, User } from "@/types";

export default function LoginPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const setPrivateKey = useAuthStore((s) => s.setPrivateKey);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const { token } = await apiFetch<LoginResponse>(ENDPOINTS.login, {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });

      const { encrypted_private_key } = await apiFetch<{ encrypted_private_key: string }>(
        ENDPOINTS.keys,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const plaintextKey = await decryptWithPassword(encrypted_private_key, password);
      const keyBytes = new TextEncoder().encode(plaintextKey).buffer;

      const user: User = { email, encrypted_private_key, is_verified: true } as User;
      setAuth(token, user, encrypted_private_key);
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
          <form onSubmit={handleSubmit} className="space-y-4">
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
        </CardContent>
      </Card>
    </div>
  );
}
