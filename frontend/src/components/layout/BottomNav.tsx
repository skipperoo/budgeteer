import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Wallet,
  Settings,
  LogOut,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import { apiFetch } from "@/lib/api";
import { ENDPOINTS } from "@/lib/constants";
import { ThemeToggle } from "@/components/shared/ThemeToggle";

const navItems = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/accounts", icon: Wallet, label: "Accounts" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export function BottomNav() {
  const logout = useAuthStore((s) => s.logout);

  const handleLogout = async () => {
    try {
      await apiFetch(ENDPOINTS.logout, { method: "POST" });
    } catch {
      // ignore
    }
    logout();
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-card md:hidden">
      <div className="flex items-center justify-around h-16 px-2">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                "flex flex-col items-center justify-center gap-0.5 px-3 py-1 rounded-md text-xs font-medium transition-colors min-w-0",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-primary"
              )
            }
          >
            <item.icon className="h-5 w-5" />
            <span className="truncate">{item.label}</span>
          </NavLink>
        ))}

        {/* Theme toggle */}
        <div className="flex flex-col items-center justify-center gap-0.5 px-3 py-1 rounded-md text-xs font-medium text-muted-foreground min-w-0">
          <ThemeToggle />
          <span className="truncate">Theme</span>
        </div>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="flex flex-col items-center justify-center gap-0.5 px-3 py-1 rounded-md text-xs font-medium text-muted-foreground hover:text-destructive transition-colors min-w-0"
        >
          <LogOut className="h-5 w-5" />
          <span className="truncate">Logout</span>
        </button>
      </div>
    </nav>
  );
}
