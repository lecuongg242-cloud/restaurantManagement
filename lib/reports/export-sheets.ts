import type { TrangTinh } from "./xlsx";
import type { CategorySlice, PaymentSlice, RevenuePoint, RevenueSummary, TopItem, AreaSlice } from "@/lib/billing/reports";
import type { DiemNhomMon, DongBan, DongNhanVien } from "./deep";

/**
 * Dựng các trang tính Excel từ ĐÚNG dữ liệu đang hiện trên màn báo cáo (P16 16-04) — thuần hàm, để test "tổng cột tiền
 * trong file = số trên màn". Tiền là số nguyên VND (không dấu phân cách) — Excel cộng được.
 */
export type DuLieuXuat = {
  tieuDe: string;
  kyNhan: string;
  summary: RevenueSummary;
  series: RevenuePoint[];
  categories: CategorySlice[];
  topItems: TopItem[];
  payments: PaymentSlice[];
  areas?: AreaSlice[];
  branches?: { ten: string; revenue: number; billCount: number; avgPerBill: number; prevRevenue: number }[];
  staff?: DongNhanVien[] | null;
  ban?: DongBan[] | null;
  nhomTuan?: DiemNhomMon[] | null;
};

const PT: Record<string, string> = { cash: "Tiền mặt", transfer: "Chuyển khoản" };

export function trangTinhBaoCao(d: DuLieuXuat): TrangTinh[] {
  const out: TrangTinh[] = [
    {
      ten: "Tổng quan",
      cot: [{ nhan: "Chỉ số", rong: 28 }, { nhan: "Giá trị", rong: 18 }],
      dong: [
        ["Báo cáo", d.tieuDe],
        ["Kỳ", d.kyNhan],
        ["Doanh thu (đ)", d.summary.totalRevenue],
        ["Số hóa đơn", d.summary.billCount],
        ["TB/hóa đơn (đ)", d.summary.avgPerBill],
      ],
    },
    {
      ten: "Doanh thu theo kỳ",
      cot: [{ nhan: "Mốc" }, { nhan: "Doanh thu (đ)", rong: 16 }, { nhan: "Số hóa đơn" }],
      dong: d.series.map((p) => [p.label, p.revenue, p.billCount]),
    },
  ];
  if (d.branches) {
    out.push({
      ten: "So sánh chi nhánh",
      cot: [{ nhan: "Chi nhánh", rong: 28 }, { nhan: "Doanh thu (đ)", rong: 16 }, { nhan: "Hóa đơn" }, { nhan: "TB/HĐ (đ)" }, { nhan: "Kỳ trước (đ)", rong: 16 }],
      dong: d.branches.map((b) => [b.ten, b.revenue, b.billCount, b.avgPerBill, b.prevRevenue]),
    });
  }
  out.push(
    {
      ten: "Nhóm món",
      cot: [{ nhan: "Nhóm món", rong: 24 }, { nhan: "Số lượng" }, { nhan: "Doanh thu (đ)", rong: 16 }],
      dong: d.categories.map((c) => [c.name, c.qty, c.revenue]),
    },
    {
      ten: "Món",
      cot: [{ nhan: "Món", rong: 32 }, { nhan: "Số lượng" }, { nhan: "Doanh thu (đ)", rong: 16 }],
      dong: d.topItems.map((i) => [i.name, i.qty, i.revenue]),
    },
    {
      ten: "Phương thức thanh toán",
      cot: [{ nhan: "Phương thức", rong: 18 }, { nhan: "Số giao dịch" }, { nhan: "Số tiền (đ)", rong: 16 }],
      dong: d.payments.map((p) => [PT[p.method] ?? p.method, p.count, p.amount]),
    }
  );
  if (d.areas && d.areas.length) {
    out.push({
      ten: "Khu vực và bàn",
      cot: [{ nhan: "Khu vực", rong: 18 }, { nhan: "Bàn" }, { nhan: "Hóa đơn" }, { nhan: "Doanh thu (đ)", rong: 16 }],
      dong: d.areas.map((a) => [a.areaName, a.tableName, a.billCount, a.revenue]),
    });
  }
  if (d.staff) {
    out.push(
      {
        ten: "NV theo phục vụ",
        cot: [{ nhan: "Nhân viên", rong: 26 }, { nhan: "Đơn nhận" }, { nhan: "Số món" }, { nhan: "Tiền hàng (đ)", rong: 16 }, { nhan: "Món hủy" }, { nhan: "Tiền hủy (đ)" }],
        dong: d.staff
          .filter((r) => r.donNhan > 0 || r.monHuy > 0)
          .map((r) => [r.ten, r.donNhan, r.monNhan, r.tienHangNhan, r.monHuy, r.tienHuy]),
      },
      {
        ten: "NV theo thu ngân",
        cot: [
          { nhan: "Nhân viên", rong: 26 },
          { nhan: "Hóa đơn" },
          { nhan: "Tiền mặt (đ)", rong: 14 },
          { nhan: "Chuyển khoản (đ)", rong: 16 },
          { nhan: "Tổng thu (đ)", rong: 14 },
          { nhan: "Lần giảm giá" },
          { nhan: "Tiền giảm (đ)" },
        ],
        dong: d.staff
          .filter((r) => r.hoaDonThu > 0 || r.lanGiam > 0)
          .map((r) => [r.ten, r.hoaDonThu, r.tienMat, r.chuyenKhoan, r.tienThu, r.lanGiam, r.tienGiam]),
      }
    );
  }
  if (d.ban && d.ban.some((r) => r.ban !== "Không gắn bàn")) {
    out.push({
      ten: "Hiệu quả bàn",
      cot: [{ nhan: "Khu" }, { nhan: "Bàn" }, { nhan: "Lượt" }, { nhan: "Ngồi TB (phút)" }, { nhan: "Doanh thu (đ)", rong: 16 }, { nhan: "DT/lượt (đ)" }, { nhan: "DT/giờ ngồi (đ)" }],
      dong: d.ban.map((r) => [r.khu, r.ban, r.luot, r.phutTb, r.doanhThu, r.moiLuot, r.moiGio]),
    });
  }
  if (d.nhomTuan && d.nhomTuan.length) {
    out.push({
      ten: "Nhóm món theo tuần",
      cot: [{ nhan: "Tuần từ" }, { nhan: "Nhóm món", rong: 24 }, { nhan: "Số lượng" }, { nhan: "Doanh thu (đ)", rong: 16 }],
      dong: d.nhomTuan.map((p) => [p.ky, p.nhom, p.soLuong, p.doanhThu]),
    });
  }
  return out;
}
