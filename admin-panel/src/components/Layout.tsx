import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/auth-store";
import {
  LayoutDashboard,
  Database,
  GitBranch,
  Bell,
  Shield,
  LogOut,
} from "lucide-react";

const navItems = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/migrations", icon: GitBranch, label: "Migrations" },
  { to: "/notifications", icon: Bell, label: "Dispatch" },
  { to: "/admins", icon: Shield, label: "Admins" },
];

export default function Layout() {
  const logout = useAuthStore((s) => s.logout);

  return (
    <div className="flex h-screen bg-[#f8f9fa] dark:bg-[#1a1b1e]">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border/30 bg-card flex flex-col">
        <div className="p-6">
          <h1 className="text-xl font-bold">Admin Panel</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Budgeteer</p>
        </div>
        <nav className="flex-1 px-4 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                  isActive
                    ? "bg-secondary text-secondary-foreground"
                    : "text-muted-foreground hover:bg-secondary hover:text-secondary-foreground"
                }`
              }
            >
              <item.icon className="h-4 w-4" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-border/30">
          <button
            onClick={logout}
            className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-secondary-foreground transition-all w-full cursor-pointer"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
