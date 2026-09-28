"use client";

import { ResponsiveContainer, ComposedChart, Bar, ErrorBar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import type { NgayDuBao } from "@/lib/forecast/read";

/**
 * 7 ngày tới (P18 18-01): cột = dự báo, vạch dọc = khoảng sai số, đường nét đứt = thực tế cùng thứ tuần trước
 * (như iPOS / Toast so với tuần trước). Cột ngày lễ nhạt màu.
 */
export function ForecastChart({ ngay }: { ngay: NgayDuBao[] }) {
  const fmt = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}tr` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
  const data = ngay.map((d) => ({
    ...d,
    nhan: d.holiday ? `${d.nhan} (lễ)` : d.nhan,
    khoang: [d.value - d.low, d.high - d.value],
  }));
  return (
    <div className="h-64 w-full" data-du-bao-bieu-do>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e8e2d9" vertical={false} />
          <XAxis dataKey="nhan" tick={{ fontSize: 11, fill: "#8a8172" }} tickLine={false} axisLine={{ stroke: "#e8e2d9" }} />
          <YAxis tickFormatter={fmt} tick={{ fontSize: 11, fill: "#8a8172" }} tickLine={false} axisLine={false} width={44} />
          <Tooltip
            formatter={(v, name, item) => {
              if (name === "Dự báo") {
                const p = item.payload as NgayDuBao;
                return [`${Number(v).toLocaleString("vi-VN")}₫ (${p.low.toLocaleString("vi-VN")}–${p.high.toLocaleString("vi-VN")})`, String(name)];
              }
              return [v == null ? "—" : `${Number(v).toLocaleString("vi-VN")}₫`, String(name)];
            }}
            contentStyle={{ borderRadius: 8, border: "1px solid #e8e2d9", fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="value" name="Dự báo" fill="#fa520f" fillOpacity={0.85} radius={[4, 4, 0, 0]} maxBarSize={44}>
            <ErrorBar dataKey="khoang" width={6} strokeWidth={1.5} stroke="#8a4a1f" direction="y" />
          </Bar>
          <Line type="monotone" dataKey="tuanTruoc" name="Cùng thứ tuần trước" stroke="#8a8172" strokeWidth={1.5} strokeDasharray="4 3" dot={{ r: 2 }} connectNulls />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
