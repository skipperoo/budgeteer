/**
 * CategoryPieChart — a donut chart showing income/expense breakdown by category.
 *
 * Uses user-defined category colors (with deterministic fallback) and shows
 * icons in the legend when available. The "+ N more" badge shows a popover
 * on hover/click with the full list of remaining categories.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip as ChartTooltip,
} from "recharts";
import { formatCurrency, formatNumber, getCurrencySymbol } from "@/lib/format";
import { useCategoryStore } from "@/stores/category-store";
import { getCuratedIcon } from "@/lib/curated-icons";

interface PieSlice {
  name: string;
  value: number;
}

interface CategoryPieChartProps {
  data: PieSlice[];
  total: number;
  currency: string;
  type: "expense" | "income";
  /** Maximum legend items to show before "+ N more" */
  maxLegendItems?: number;
}

export function CategoryPieChart({
  data,
  total,
  currency,
  type,
  maxLegendItems = 5,
}: CategoryPieChartProps) {
  const getCategoryColor = useCategoryStore((s) => s.getCategoryColor);
  const getCategoryIcon = useCategoryStore((s) => s.getCategoryIcon);
  const symbol = getCurrencySymbol(currency);
  const [morePopoverOpen, setMorePopoverOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  // Global icons toggle — read from localStorage, listen for custom event
  const [iconsEnabled, setIconsEnabled] = useState(() => {
    try {
      return localStorage.getItem("budgeteer_categories_show_icons") !== "false";
    } catch { return true; }
  });

  const handleIconsEvent = useCallback((e: Event) => {
    const detail = (e as CustomEvent).detail;
    if (detail && typeof detail.enabled === "boolean") {
      setIconsEnabled(detail.enabled);
    }
  }, []);

  useEffect(() => {
    window.addEventListener("icons-toggle", handleIconsEvent);
    return () => window.removeEventListener("icons-toggle", handleIconsEvent);
  }, [handleIconsEvent]);

  // Close popover on outside click
  useEffect(() => {
    if (!morePopoverOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMorePopoverOpen(false);
      }
    };
    // Delay adding listener to avoid the same click that opened it
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClick, true);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClick, true);
    };
  }, [morePopoverOpen]);

  if (data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">
        No {type} data available.
      </div>
    );
  }

  const visibleItems = data.slice(0, maxLegendItems);
  const remainingItems = data.slice(maxLegendItems);
  const colorFn = type === "expense" ? "fill-destructive" : "fill-income";

  return (
    <div className="h-64 w-full flex flex-col justify-between font-mono text-[10px]">
      <div className="h-44 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={80}
              paddingAngle={2}
              dataKey="value"
            >
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={getCategoryColor(entry.name)}
                  stroke="none"
                />
              ))}
            </Pie>
            <ChartTooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const entry = payload[0].payload as PieSlice;
                  return (
                    <div className="bg-card text-card-foreground p-3 rounded-lg raised text-xs">
                      <p className="font-semibold mb-1">{entry.name}</p>
                      <p className={`font-mono font-bold ${colorFn}`}>
                        {symbol}
                        {formatNumber(entry.value)}
                      </p>
                    </div>
                  );
                }
                return null;
              }}
            />
            <text
              x="50%"
              y="50%"
              textAnchor="middle"
              dominantBaseline="middle"
              className={colorFn}
              style={{ fontSize: 14, fontWeight: 700, fontFamily: "DM Sans, system-ui, sans-serif" }}
            >
              {symbol}
              {formatNumber(total)}
            </text>
            <text
              x="50%"
              y="50%"
              dy={16}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-muted-foreground"
              style={{ fontSize: 9, fontWeight: 500, fontFamily: "DM Sans, system-ui, sans-serif" }}
            >
              {type === "expense" ? "expenses" : "income"}
            </text>
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 mt-2 text-xs font-sans text-muted-foreground font-medium">
        {visibleItems.map((entry) => {
          const iconName = getCategoryIcon(entry.name);
          const IconComponent = iconName ? getCuratedIcon(iconName) : null;
          const showIcon = iconsEnabled && IconComponent;
          return (
            <div key={entry.name} className="flex items-center gap-1">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: getCategoryColor(entry.name) }}
              />
              {showIcon ? (
                <IconComponent className="h-4 w-4 shrink-0 text-muted-foreground" />
              ) : (
                <span className="truncate max-w-[80px]">{entry.name}</span>
              )}
            </div>
          );
        })}
        {remainingItems.length > 0 && (
          <div className="relative" ref={moreRef}>
            <span
              className="text-muted-foreground italic text-[11px] self-center cursor-pointer hover:text-foreground transition-colors"
              onClick={() => setMorePopoverOpen(!morePopoverOpen)}
              onMouseEnter={() => setMorePopoverOpen(true)}
              onMouseLeave={() => setMorePopoverOpen(false)}
            >
              +{remainingItems.length} more
            </span>
            {morePopoverOpen && (
              <div
                className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 bg-card border border-border/50 rounded-lg shadow-xl p-2 min-w-[140px]"
                onMouseEnter={() => setMorePopoverOpen(true)}
                onMouseLeave={() => setMorePopoverOpen(false)}
              >
                <div className="space-y-1">
                  {remainingItems.map((entry) => {
                    const iconName = getCategoryIcon(entry.name);
                    const IconComponent = iconName ? getCuratedIcon(iconName) : null;
                    const showIcon = iconsEnabled && IconComponent;
                    return (
                      <div key={entry.name} className="flex items-center gap-2 text-xs whitespace-nowrap">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: getCategoryColor(entry.name) }}
                        />
                        {showIcon ? (
                          <IconComponent className="h-4 w-4 shrink-0 text-muted-foreground" />
                        ) : (
                          <span className="text-foreground font-medium">{entry.name}</span>
                        )}
                        <span className="text-muted-foreground ml-auto font-mono">
                          {formatCurrency(entry.value, currency, false)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
