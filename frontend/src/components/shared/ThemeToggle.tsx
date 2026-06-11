import { useTheme } from "@/hooks/use-theme";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="group relative flex items-center w-14 h-7 rounded-full bg-secondary/80 hover:bg-secondary cursor-pointer transition-all duration-500 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 overflow-hidden border border-border"
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
    >
      {/* Background liquid effect */}
      <div 
        className={`absolute inset-0 transition-transform duration-700 ease-[cubic-bezier(0.19,1,0.22,1)] ${
          theme === "dark" ? "translate-x-0 bg-primary/10" : "-translate-x-full bg-transparent"
        }`}
      />
      
      {/* Snap/Liquid Thumb */}
      <div
        className={`absolute left-1 w-5 h-5 rounded-full bg-primary shadow-lg transform transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] flex items-center justify-center z-10 ${
          theme === "dark" ? "translate-x-7 scale-110" : "translate-x-0 scale-100"
        }`}
      >
        {theme === "dark" ? (
          <Sun className="h-3 w-3 text-primary-foreground fill-primary-foreground" />
        ) : (
          <Moon className="h-3 w-3 text-primary-foreground fill-primary-foreground" />
        )}
      </div>

      {/* Decorative icons */}
      <div className="flex justify-between w-full px-2 z-0">
        <Moon className={`h-3.5 w-3.5 transition-all duration-500 ${theme === "light" ? "opacity-40 scale-100" : "opacity-0 scale-50"}`} />
        <Sun className={`h-3.5 w-3.5 transition-all duration-500 ${theme === "dark" ? "opacity-40 scale-100" : "opacity-0 scale-50"}`} />
      </div>
    </button>
  );
}
