import { useAuthStore } from "@/stores/auth-store";

export function Header() {
  const user = useAuthStore((s) => s.user);

  return (
    <header className="border-b bg-card px-6 py-3 flex items-center justify-between">
      <div />
      <div className="text-sm text-muted-foreground">
        {user?.email ?? "Not logged in"}
      </div>
    </header>
  );
}
