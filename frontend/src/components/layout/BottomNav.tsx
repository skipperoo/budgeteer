import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Wallet,
  ScrollText,
  Settings,
  LogOut,
  PiggyBank,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import { apiFetch } from "@/lib/api";
import { ENDPOINTS } from "@/lib/constants";

const navItems = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/accounts", icon: Wallet, label: "Accounts" },
  { to: "/rules", icon: ScrollText, label: "Rules" },
  { to: "/budgets", icon: PiggyBank, label: "Budgets" },
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
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-card md:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
      <div className="flex items-center justify-around h-20 px-2">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                "flex flex-col items-center justify-center gap-0.5 px-2 py-1 rounded-md text-xs font-medium transition-colors min-w-0 flex-1 relative",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-primary"
              )
            }
          >
            <item.icon className="h-6 w-6" />
            <span className="truncate text-[11px]">{item.label}</span>
          </NavLink>
        ))}

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="flex flex-col items-center justify-center gap-0.5 px-2 py-1 rounded-md text-xs font-medium text-muted-foreground hover:text-destructive transition-colors min-w-0 flex-1"
        >
          <LogOut className="h-6 w-6" />
          <span className="truncate text-[11px]">Logout</span>
        </button>
      </div>
    </nav>
  );
}
