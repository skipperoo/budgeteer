/**
 * BalanceChart — a reusable area chart showing a balance trajectory.
 *
 * Props:
 *   data        — array of { displayDate, balance }
 *   currency    — currency code for the Y-axis label
 *   gradientId  — unique SVG gradient id (must be unique per page)
 */

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ChartTooltip,
} from "recharts";
import { getCurrencySymbol, formatNumber } from "@/lib/format";

interface BalanceChartDatum {
  displayDate: string;
  balance: number;
}

interface BalanceChartProps {
  data: BalanceChartDatum[];
  currency?: string;
  gradientId: string;
}

export function BalanceChart({ data, currency = "EUR", gradientId }: BalanceChartProps) {
  const symbol = getCurrencySymbol(currency);

  if (data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">
        No data available yet.
      </div>
    );
  }

  return (
    <div className="h-full w-full font-mono text-[10px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 5, right: 12, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.2} />
              <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0.0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
          <XAxis
            dataKey="displayDate"
            stroke="var(--color-muted-foreground)"
            fontSize={10}
            tickLine={false}
            axisLine={false}
            dy={10}
            minTickGap={30}
          />
          <YAxis
            stroke="var(--color-muted-foreground)"
            fontSize={10}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value: number) => `${symbol}${value}`}
            dx={-5}
          />
          <ChartTooltip
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const datum = payload[0].payload as BalanceChartDatum;
                return (
                  <div className="bg-card text-card-foreground p-3 rounded-lg raised text-xs">
                    <p className="font-semibold mb-1">{datum.displayDate}</p>
                    <p className="font-mono text-foreground font-bold">
                      {symbol}
                      {formatNumber(Number(payload[0].value ?? 0))}
                    </p>
                  </div>
                );
              }
              return null;
            }}
          />
          <Area
            type="monotone"
            dataKey="balance"
            stroke="var(--color-primary)"
            strokeWidth={2}
            fillOpacity={1}
            fill={`url(#${gradientId})`}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export type { BalanceChartDatum };
