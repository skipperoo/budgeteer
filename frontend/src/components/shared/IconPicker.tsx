/**
 * IconPicker — a searchable grid of curated lucide-react icons.
 *
 * Shows a text input to filter icons, and a scrollable grid of icon buttons.
 * The selected icon is highlighted with the ring color.
 */

import { useState, useMemo } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { CURATED_ICONS } from "@/lib/curated-icons";

interface IconPickerProps {
  value: string | null | undefined;
  onChange: (iconName: string | null) => void;
}

export function IconPicker({ value, onChange }: IconPickerProps) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return CURATED_ICONS;
    const q = search.toLowerCase().trim();
    return CURATED_ICONS.filter(
      (icon) =>
        icon.name.includes(q) ||
        icon.keywords.some((kw) => kw.includes(q))
    );
  }, [search]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search icons..."
            className="pl-8 h-8 text-xs"
          />
        </div>
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1 px-2 py-1 rounded-md hover:bg-destructive/10 transition-colors"
          >
            <X className="h-3 w-3" />
            Clear
          </button>
        )}
      </div>

      <div className="grid grid-cols-8 gap-1.5 max-h-48 overflow-y-auto p-1 border border-border/50 rounded-lg">
        {filtered.length === 0 ? (
          <div className="col-span-full text-center text-xs text-muted-foreground py-6">
            No icons found.
          </div>
        ) : (
          filtered.map((icon) => {
            const IconComponent = icon.component;
            const selected = value === icon.name;
            return (
              <button
                key={icon.name}
                type="button"
                onClick={() => onChange(icon.name)}
                title={icon.name.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                className={`
                  flex items-center justify-center p-2 rounded-lg border transition-all duration-100 cursor-pointer
                  ${selected
                    ? "border-ring ring-1 ring-ring bg-primary/5"
                    : "border-border hover:border-muted-foreground/30 hover:bg-secondary/50"
                  }
                `}
              >
                <IconComponent className="h-4 w-4 shrink-0" />
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
