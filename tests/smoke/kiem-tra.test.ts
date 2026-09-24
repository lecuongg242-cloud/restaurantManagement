import { describe, it, expect } from "vitest";
import { hostLa, vungTinhToan, anhTrongHtml } from "../../scripts/smoke-prod.mjs";

/**
 * OPS-08 — phần thuần hàm của lệnh khói hậu-deploy.
 *
 * Mỗi hàm tương ứng một lỗi đã lọt ra production ngày 24/09/2026 mà không môi trường local nào
 * bắt được.
 */
const DUNG = "jgdvpglldnkgzycxstkm.supabase.co";

describe("hostLa — dữ liệu còn trỏ hạ tầng cũ", () => {
  it("chỉ có host đúng → sạch", () => {
    const html = `<img src="https://${DUNG}/storage/v1/object/public/menu-images/a.png">`;
    expect(hostLa(html, DUNG)).toEqual([]);
  });

  it("có host project ĐÃ XÓA → nêu đúng tên — đây là lỗi ảnh vỡ ngày 24/09", () => {
    const html = `<img src="https://${DUNG}/x.png"><img src="https://vuppmvgnmektgvicgsof.supabase.co/y.png">`;
    expect(hostLa(html, DUNG)).toEqual(["vuppmvgnmektgvicgsof.supabase.co"]);
  });

  it("host lạ nằm trong URL đã mã hóa của next/image vẫn bắt được", () => {
    const html = `/_next/image?url=https%3A%2F%2Fvuppmvgnmektgvicgsof.supabase.co%2Fstorage%2Fa.png`;
    expect(hostLa(html, DUNG)).toEqual(["vuppmvgnmektgvicgsof.supabase.co"]);
  });

  it("một host lạ xuất hiện nhiều lần chỉ nêu một lần", () => {
    const la = "https://abc.supabase.co/a https://abc.supabase.co/b";
    expect(hostLa(la, DUNG)).toEqual(["abc.supabase.co"]);
  });

  it("HTML rỗng → sạch, không ném", () => {
    expect(hostLa("", DUNG)).toEqual([]);
  });
});

describe("vungTinhToan — compute chạy ở vùng nào", () => {
  it("đọc vùng tính toán, không nhầm với vùng biên", () => {
    expect(vungTinhToan("hkg1::sin1::kqccl-1790226382331-18372fd50646")).toBe("sin1");
  });

  it("chỉ có vùng biên (trả từ cache, không chạy hàm) → không kết luận được", () => {
    expect(vungTinhToan("hkg1::kqccl-1790226382331")).toBeNull();
  });

  it("không có header → không kết luận được", () => {
    expect(vungTinhToan(null)).toBeNull();
  });
});

describe("anhTrongHtml — mọi ảnh khách sẽ tải", () => {
  it("lấy URL ảnh Storage, kể cả nằm trong next/image, và không trùng lặp", () => {
    const u = `https://${DUNG}/storage/v1/object/public/menu-images/t/a.png`;
    const html = `<img src="${u}"><img srcset="/_next/image?url=${encodeURIComponent(u)}&amp;w=64 64w">`;
    expect(anhTrongHtml(html)).toEqual([u]);
  });

  it("không có ảnh → mảng rỗng", () => {
    expect(anhTrongHtml("<p>khong co anh</p>")).toEqual([]);
  });
});
