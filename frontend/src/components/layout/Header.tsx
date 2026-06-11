import { useAuthStore } from "@/stores/auth-store";
import { ThemeToggle } from "@/components/shared/ThemeToggle";

export function Header() {
  const user = useAuthStore((s) => s.user);

  return (
    <header className="border-b bg-card px-6 py-3 flex items-center justify-between">
      <div />
      <div className="flex items-center gap-3">
        <ThemeToggle />
        <span className="text-sm text-muted-foreground">
          {user?.email ?? "Not logged in"}
        </span>
      </div>
    </header>
  );
}
