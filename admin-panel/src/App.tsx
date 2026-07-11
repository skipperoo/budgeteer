import { Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "@/stores/auth-store";
import LoginPage from "@/pages/LoginPage";
import DashboardPage from "@/pages/DashboardPage";
import TableDetailPage from "@/pages/TableDetailPage";
import MigrationsPage from "@/pages/MigrationsPage";
import NotificationsPage from "@/pages/NotificationsPage";
import AdminsPage from "@/pages/AdminsPage";
import Layout from "@/components/Layout";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  const mustChangePassword = useAuthStore((s) => s.mustChangePassword);
  const token = useAuthStore((s) => s.token);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="tables/:name" element={<TableDetailPage />} />
        <Route path="migrations" element={<MigrationsPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="admins" element={<AdminsPage />} />
      </Route>
    </Routes>
  );
}
