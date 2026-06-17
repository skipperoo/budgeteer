import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import { DateRangePicker } from "@/components/shared/DateRangePicker";
import { useNotificationStore } from "@/stores/notification-store";

export function Header() {
  const navigate = useNavigate();
  const unreadCount = useNotificationStore((s) => s.unreadCount);

  return (
    <header className="border-b bg-card px-4 md:px-6 py-2.5 flex items-center justify-between">
      <div className="flex items-center">
        <span className="font-bold text-lg md:hidden tracking-tight text-foreground">
          Budgeteer
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => navigate("/notifications")}
          className="relative p-2 rounded-md text-muted-foreground hover:bg-secondary hover:text-secondary-foreground transition-colors cursor-pointer"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 bg-primary text-primary-foreground text-[10px] rounded-full h-4 min-w-[16px] flex items-center justify-center px-0.5">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
        <DateRangePicker />
      </div>
    </header>
  );
}
