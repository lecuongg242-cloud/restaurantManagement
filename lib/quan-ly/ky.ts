import type { RangeInput } from "@/lib/billing/report-range";

/**
 * Kỳ xem của app "TechMenu Quản lý" (P30, Giao diện B4). Mỗi kỳ là một đầu vào của `resolveRange` — CÙNG hàm với trang
 * báo cáo admin ⇒ doanh thu / số hóa đơn hai nơi khớp từng đồng (MGR-02).
 */
export const KY = [
  { ma: "hom-nay", chu: "Hôm nay", input: { preset: "today" } },
  { ma: "hom-qua", chu: "Hôm qua", input: { preset: "today", offset: "-1" } },
  { ma: "7-ngay", chu: "7 ngày qua", input: { preset: "7d" } },
  { ma: "thang-nay", chu: "Tháng này", input: { preset: "month" } },
  { ma: "thang-truoc", chu: "Tháng trước", input: { preset: "month", offset: "-1" } },
] as const satisfies readonly { ma: string; chu: string; input: RangeInput }[];

export type Ky = (typeof KY)[number];

/** `?ky=` → kỳ; thiếu / lạ → Hôm nay. */
export function docKy(ma: string | undefined): Ky {
  return KY.find((k) => k.ma === ma) ?? KY[0];
}

/** Query của trang báo cáo admin cùng kỳ (nút "Xem báo cáo đầy đủ"). */
export function kyQueryBaoCao(ky: Ky): string {
  return new URLSearchParams(Object.entries(ky.input)).toString();
}
