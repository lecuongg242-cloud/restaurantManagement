# 04-05 SUMMARY — Dashboard báo cáo

**Ngày:** 22/07/2026 · **Trạng thái:** Code hoàn tất, chờ checkpoint human-verify (test trình duyệt).
**Yêu cầu:** REPORT-01, REPORT-02, REPORT-03, BILL-05. Không migration mới.

## File đã đổi
| File | Vai trò |
|---|---|
| `package.json` | + `recharts` |
| `lib/billing/reports.ts` | **Mới** — `computeVnRange` (ngày/tuần/tháng theo giờ VN + offset) + `getReportData` (summary/series/topItems/payments) |
| `app/r/[slug]/admin/(protected)/reports/page.tsx` | **Mới** — trang báo cáo, guard manager/owner, KPI + biểu đồ + bảng |
| `components/admin/reports/RevenueChart.tsx` | **Mới** — biểu đồ cột doanh thu theo ngày (recharts, màu primary) |
| `components/admin/reports/TopItemsTable.tsx` | **Mới** — xếp hạng món + thanh bar CSS |
| `components/admin/reports/PaymentBreakdown.tsx` | **Mới** — tách tiền mặt vs chuyển khoản + đối soát |
| `components/admin/reports/RangePicker.tsx` | **Mới** — chọn Ngày/Tuần/Tháng + kỳ trước/sau (URL searchParams) |
| `components/admin/AdminNav.tsx` | + mục "Báo cáo" |
| `lib/auth/rbac.ts` | `ManageSection` + "reports" |

## Logic then chốt (đúng tiền — BILL-05)
- **Doanh thu = `bills.status='paid' AND split_count IS NULL`** → loại "vỏ" chia đều, đếm phần con. Σ khớp 100% tiền đã thu.
- **Món bán chạy** = `bill_items` của bill 'paid' (giữ món = normal/gộp/**vỏ**; con không có món) → mỗi order_item đếm **đúng 1 lần**, không trùng.
- **Theo phương thức** = `payments` trong kỳ; Σ payments = doanh thu (mỗi bill thu 1 payment, vỏ không thu) → dòng "Tổng đối soát" xanh khi khớp.
- **Mốc thời gian NGÀY VIỆT NAM (UTC+7)**: `computeVnRange` dựng [from,to) UTC + danh sách ngày VN; gom bill theo `paid_at` quy về ngày VN. Bucket = độ dài kỳ (1 ngày / tuần T2–CN / tháng dương lịch); biểu đồ = cột theo ngày trong kỳ.
- **recharts chỉ ở `/admin/reports`** (client component) — không đụng bundle khách/POS.
- **Quyền**: chỉ manager/owner (`canManage(role,'reports')`).

## Bằng chứng (test logic)
- `npx tsc --noEmit` → **0 lỗi** (đã sửa kiểu `Tooltip.formatter`). `npx next lint` → **✔ sạch**. `vitest tests/billing` → **15/15**.

## Checkpoint (chờ human-verify)
`04-05-PLAN.md`: tạo ≥20 bill paid (mặt+CK) rải vài ngày → KPI + biểu đồ đúng; đổi Ngày/Tuần/Tháng + kỳ trước; món bán chạy xếp hạng; **BILL-05**: cộng tay 20 bill = doanh thu dashboard (khớp 100%); waiter không vào `/admin/reports`.

## Ghi chú
- **Chưa chạy `next build`** để tránh khóa file `.next` khi dev server đang chạy (rủi ro Windows đã ghi ở báo cáo P3). recharts là client-only (`"use client"`), tsc/lint xanh. Nên chạy `next build` 1 lần khi tắt dev server trước khi deploy.
