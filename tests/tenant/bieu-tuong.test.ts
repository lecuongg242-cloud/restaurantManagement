import { describe, it, expect } from "vitest";
import { duongDanBieuTuong } from "@/lib/tenant/bieu-tuong";

/**
 * Biểu tượng tab của quán đổi NGAY khi quán đổi logo / tên (04/10/2026: Hùng Hiếu đã tải logo từ 10:39 mà 22:00 tab vẫn
 * hiện chữ "N" — Chrome giữ biểu tượng theo đường dẫn, đường dẫn không đổi thì không tải lại).
 */
describe("duongDanBieuTuong", () => {
  const coLogo = { ten: "Nhà hàng Hùng Hiếu", logoUrl: "https://x.supabase.co/storage/v1/object/public/menu-images/t/logo-d137f039ab65.jpg" };

  it("có mã phiên bản ?v=", () => {
    expect(duongDanBieuTuong("nha-hang-hung-hieu", coLogo)).toMatch(/^\/r\/nha-hang-hung-hieu\/favicon\.png\?v=[0-9a-z]+$/);
  });

  it("cùng logo + tên → cùng đường dẫn (trình duyệt dùng lại được)", () => {
    expect(duongDanBieuTuong("q", coLogo)).toBe(duongDanBieuTuong("q", { ...coLogo }));
  });

  it("đổi logo → đường dẫn khác; gỡ logo → đường dẫn khác", () => {
    const a = duongDanBieuTuong("q", coLogo);
    expect(duongDanBieuTuong("q", { ...coLogo, logoUrl: coLogo.logoUrl.replace("d137f039ab65", "aaaaaaaaaaaa") })).not.toBe(a);
    expect(duongDanBieuTuong("q", { ...coLogo, logoUrl: null })).not.toBe(a);
  });

  it("chưa có logo: đổi tên (chữ cái khác) → đường dẫn khác", () => {
    expect(duongDanBieuTuong("q", { ten: "Nhà hàng A", logoUrl: null })).not.toBe(duongDanBieuTuong("q", { ten: "Quán B", logoUrl: null }));
  });

  it("giữ cỡ ảnh ?s= cho manifest", () => {
    expect(duongDanBieuTuong("q", coLogo, 192)).toMatch(/^\/r\/q\/favicon\.png\?s=192&v=[0-9a-z]+$/);
  });
});
