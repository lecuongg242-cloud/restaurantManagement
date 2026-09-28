import { GRACE_DAYS, REMIND_DAYS } from "@/lib/tenant/subscription";

/**
 * Bảng ca hạn dùng DÙNG CHUNG cho test TS (tests/tenant/subscription.test.ts) và test SQL
 * (tests/rls/suspend.test.ts): cùng ca phải cho cùng kết quả "dùng được / khóa" ở cả hai phía.
 */
export const HOM_NAY = "2026-09-27";
export const cong = (n: number) => congNgay(HOM_NAY, n);
function congNgay(d: string, n: number) {
  return new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10) + n)).toISOString().slice(0, 10);
}

export const CA_HAN: { ten: string; paidUntil: string | null; state: string; dungDuoc: boolean }[] = [
  { ten: "rỗng", paidUntil: null, state: "unlimited", dungDuoc: true },
  { ten: `còn ${REMIND_DAYS + 1} ngày`, paidUntil: cong(REMIND_DAYS + 1), state: "ok", dungDuoc: true },
  { ten: `còn đúng ${REMIND_DAYS} ngày`, paidUntil: cong(REMIND_DAYS), state: "due_soon", dungDuoc: true },
  { ten: "hôm nay = paid_until", paidUntil: HOM_NAY, state: "due_soon", dungDuoc: true },
  { ten: "quá 1 ngày", paidUntil: cong(-1), state: "grace", dungDuoc: true },
  { ten: `paid_until + ${GRACE_DAYS} = hôm nay`, paidUntil: cong(-GRACE_DAYS), state: "grace", dungDuoc: true },
  { ten: `paid_until + ${GRACE_DAYS + 1}`, paidUntil: cong(-GRACE_DAYS - 1), state: "locked", dungDuoc: false },
];

