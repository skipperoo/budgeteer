import { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "@/stores/auth-store";
import { AppLayout } from "@/components/layout/AppLayout";
import PrivateKeyGate from "@/components/auth/PrivateKeyGate";
import { useAccent } from "@/hooks/use-accent";
import LoginPage from "@/pages/auth/LoginPage";
import RegisterPage from "@/pages/auth/RegisterPage";
import VerifyOTPPage from "@/pages/auth/VerifyOTPPage";
import DashboardPage from "@/pages/dashboard/DashboardPage";
import AccountListPage from "@/pages/accounts/AccountListPage";
import AccountDetailPage from "@/pages/accounts/AccountDetailPage";
import SettingsPage from "@/pages/settings/SettingsPage";
import RulesPage from "@/pages/rules/RulesPage";
import NotificationsPage from "@/pages/notifications/NotificationsPage";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  const hydrating = useAuthStore((s) => s.hydrating);

  if (hydrating) {
    return (
      <div className="h-screen flex items-center justify-center text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (!token) return <Navigate to="/login" replace />;
  // Wrap with PrivateKeyGate so that if the private key hasn't been
  // decrypted yet (e.g. after a page refresh), the user is prompted
  // for their password before any data-decrypting pages render.
  return <PrivateKeyGate>{children}</PrivateKeyGate>;
}

export default function App() {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const hydrate = useAuthStore((s) => s.hydrate);

  // Hydrate the session on mount: if we have a token but no user,
  // fetch /me to populate the store.
  useEffect(() => {
    if (token && !user) {
      hydrate();
    }
  }, [token, user, hydrate]);

  // Load and apply the user's preferred accent color
  useAccent();

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/verify-otp" element={<VerifyOTPPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="accounts" element={<AccountListPage />} />
        <Route path="accounts/:id" element={<AccountDetailPage />} />
        <Route path="rules" element={<RulesPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}
