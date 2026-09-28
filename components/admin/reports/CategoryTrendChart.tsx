"use client";

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import type { DiemNhomMon } from "@/lib/reports/deep";

/** Màu cho 8 nhóm món lớn nhất; phần còn lại gộp "Nhóm khác". */
const MAU = ["#fa520f", "#2f6f5e", "#c9a227", "#5b6bbf", "#b5485d", "#3f8fb0", "#8a6d3b", "#6b8e23"];
const TOI_DA = 8;
const KHAC = "Nhóm khác";

/**
 * Nhóm món theo tuần (P16 16-03, REPORT-18) — như "So sánh doanh thu mặt hàng theo thời gian" của CUKCUK: cột chồng
 * doanh thu từng nhóm theo tuần (bắt đầu thứ Hai, giờ VN).
 */
export function CategoryTrendChart({ points }: { points: DiemNhomMon[] }) {
  const tong = new Map<string, number>();
  for (const p of points) tong.set(p.nhom, (tong.get(p.nhom) ?? 0) + p.doanhThu);
  const nhomLon = [...tong.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  const hien = nhomLon.slice(0, TOI_DA);
  const cot = nhomLon.length > TOI_DA ? [...hien, KHAC] : hien;
  const ky = [...new Set(points.map((p) => p.ky))];
  const data = ky.map((k) => {
    const row: Record<string, number | string> = { ky: k };
    for (const p of points.filter((x) => x.ky === k)) {
      const khoa = hien.includes(p.nhom) ? p.nhom : KHAC;
      row[khoa] = Number(row[khoa] ?? 0) + p.doanhThu;
    }
    return row;
  });
  if (data.length === 0) return <p className="text-sm text-steel">Chưa có dữ liệu.</p>;
  const fmt = (v: number) =>
    v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}tr` : v >= 1000 ? `${Math.round(v / 1000)}k` : String(v);
  return (
    <div className="h-72 w-full" data-khoi-nhom-mon-tuan>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e8e2d9" vertical={false} />
          <XAxis dataKey="ky" tick={{ fontSize: 11, fill: "#8a8172" }} tickLine={false} axisLine={{ stroke: "#e8e2d9" }} />
          <YAxis tickFormatter={fmt} tick={{ fontSize: 11, fill: "#8a8172" }} tickLine={false} axisLine={false} width={44} />
          <Tooltip
            formatter={(v, name) => [Number(v).toLocaleString("vi-VN") + "₫", String(name)]}
            labelFormatter={(l) => `Tuần từ ${l}`}
            contentStyle={{ borderRadius: 8, border: "1px solid #e8e2d9", fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {cot.map((c, i) => (
            <Bar key={c} dataKey={c} stackId="nhom" fill={MAU[i] ?? "#b8b0a3"} maxBarSize={56} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
