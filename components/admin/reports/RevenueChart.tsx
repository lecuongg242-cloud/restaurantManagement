"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import type { RevenuePoint } from "@/lib/billing/reports";

/** Biểu đồ cột doanh thu theo ngày (recharts). Màu primary QD-006. */
export function RevenueChart({ series }: { series: RevenuePoint[] }) {
  const fmt = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}tr` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={series} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e8e2d9" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#8a8172" }} tickLine={false} axisLine={{ stroke: "#e8e2d9" }} interval="preserveStartEnd" />
          <YAxis tickFormatter={fmt} tick={{ fontSize: 11, fill: "#8a8172" }} tickLine={false} axisLine={false} width={44} />
          <Tooltip
            formatter={(v) => [Number(v).toLocaleString("vi-VN") + "₫", "Doanh thu"]}
            labelFormatter={(l) => `Ngày ${l}`}
            contentStyle={{ borderRadius: 8, border: "1px solid #e8e2d9", fontSize: 12 }}
          />
          <Bar dataKey="revenue" fill="#fa520f" radius={[4, 4, 0, 0]} maxBarSize={48} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
