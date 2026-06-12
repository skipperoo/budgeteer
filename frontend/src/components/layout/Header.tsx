import { useAuthStore } from "@/stores/auth-store";
import { ThemeToggle } from "@/components/shared/ThemeToggle";

export function Header() {
  const user = useAuthStore((s) => s.user);

  return (
    <header className="border-b bg-card px-4 md:px-6 py-3 flex items-center justify-between">
      <div className="flex items-center">
        <span className="font-bold text-lg md:hidden tracking-tight text-foreground">Budgeteer</span>
      </div>
      <div className="flex items-center gap-3">
        <ThemeToggle />
        <span className="text-xs sm:text-sm text-muted-foreground truncate max-w-[150px] sm:max-w-none">
          {user?.email ?? "Not logged in"}
        </span>
      </div>
    </header>
  );
}
