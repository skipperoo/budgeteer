import { DateRangePicker } from "@/components/shared/DateRangePicker";

export function Header() {
  return (
    <header className="border-b bg-card px-4 md:px-6 py-2.5 flex items-center justify-between">
      <div className="flex items-center">
        <span className="font-bold text-lg md:hidden tracking-tight text-foreground">
          Budgeteer
        </span>
      </div>
      <div className="flex items-center">
        <DateRangePicker />
      </div>
    </header>
  );
}
