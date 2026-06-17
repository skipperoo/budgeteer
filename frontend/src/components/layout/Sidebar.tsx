import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Wallet,
  ScrollText,
  Bell,
  Settings,
  LogOut,
  Moon,
  Sun,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import { useTheme } from "@/hooks/use-theme";
import { useNotificationStore } from "@/stores/notification-store";
import { apiFetch } from "@/lib/api";
import { ENDPOINTS } from "@/lib/constants";

const navItems = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/accounts", icon: Wallet, label: "Accounts" },
  { to: "/rules", icon: ScrollText, label: "Rules" },
  { to: "/notifications", icon: Bell, label: "Notifications" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export function Sidebar() {
  const logout = useAuthStore((s) => s.logout);
  const { theme, toggleTheme } = useTheme();
  const unreadCount = useNotificationStore((s) => s.unreadCount);

  const handleLogout = async () => {
    try {
      await apiFetch(ENDPOINTS.logout, { method: "POST" });
    } catch {
      // ignore
    }
    logout();
  };

  return (
    <aside className="hidden md:flex w-64 border-r bg-card flex-col">
      <div className="p-6">
        <h1 className="text-xl font-bold">Budgeteer</h1>
      </div>
      <nav className="flex-1 px-4 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                isActive
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:bg-secondary hover:text-secondary-foreground"
              )
            }
          >
            <item.icon className="h-4 w-4" />
            <span className="flex-1">{item.label}</span>
            {item.to === "/notifications" && unreadCount > 0 && (
              <span className="bg-primary text-primary-foreground text-xs rounded-full h-5 min-w-[20px] flex items-center justify-center px-1">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="p-4 border-t flex items-center justify-between">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-secondary-foreground transition-colors cursor-pointer"
        >
          <LogOut className="h-4 w-4" />
          Logout
        </button>
        <button
          onClick={toggleTheme}
          className="p-2 rounded-md text-muted-foreground hover:bg-secondary hover:text-secondary-foreground transition-colors cursor-pointer"
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        >
          {theme === "dark" ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
        </button>
      </div>
    </aside>
  );
}
