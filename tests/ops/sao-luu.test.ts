import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { kiemTep, tuoiBanMoiNhat } from "../../scripts/db-backup.mjs";

/**
 * OPS-09 — bản sao lưu phải TỰ CHỨNG MINH được là dùng được.
 *
 * `verify` cũ đối chiếu TỆP TÓM TẮT với database đích — nó không đọc tệp dữ liệu. Một bản dump bị
 * cắt cụt mà tóm tắt còn nguyên thì `verify` vẫn báo "Mọi bảng khớp". Ngày 24/09/2026 database Mỹ bị
 * xóa và khôi phục được là nhờ một bản dump chạy tay — nếu bản đó hỏng mà không ai biết, sẽ không có
 * gì để khôi phục. Một bản sao lưu hỏng mà trông như lành còn tệ hơn không có, vì nó tạo cảm giác
 * an toàn giả.
 */
let goc: string;

const bam = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

/** Dựng một bản sao lưu lành: 2 bảng + ảnh khớp số objects. */
function dungBan(thuMuc: string, opts: { luc?: string; coBam?: boolean; soAnh?: number | null } = {}) {
  const { luc = "2026-09-24T00:00:00.000Z", coBam = true, soAnh = 2 } = opts;
  fs.mkdirSync(thuMuc, { recursive: true });
  const bills = '{"id":1,"total":50000}\n{"id":2,"total":70000}\n';
  const objects = '{"bucket_id":"menu-images","name":"t/a.png"}\n{"bucket_id":"menu-images","name":"t/b.png"}\n';
  fs.writeFileSync(path.join(thuMuc, "public__bills.jsonl"), bills);
  fs.writeFileSync(path.join(thuMuc, "storage__objects.jsonl"), objects);
  const bang: Record<string, { so_dong: number; sha256?: string }> = {
    "public.bills": { so_dong: 2, ...(coBam ? { sha256: bam(bills) } : {}) },
    "storage.objects": { so_dong: 2, ...(coBam ? { sha256: bam(objects) } : {}) },
  };
  fs.writeFileSync(path.join(thuMuc, "_tom-tat.json"), JSON.stringify({ luc, bang }));
  if (soAnh !== null) {
    const anh = path.join(thuMuc, "storage-menu-images");
    fs.mkdirSync(anh, { recursive: true });
    for (let i = 0; i < soAnh; i++) fs.writeFileSync(path.join(anh, `anh-${i}.png`), "x");
  }
}

beforeEach(() => {
  goc = fs.mkdtempSync(path.join(os.tmpdir(), "sao-luu-"));
});
afterEach(() => {
  fs.rmSync(goc, { recursive: true, force: true });
});

describe("kiemTep — đọc CHÍNH tệp dữ liệu, không tin tệp tóm tắt", () => {
  it("bản lành → đạt", () => {
    dungBan(goc);
    expect(kiemTep(goc)).toEqual({ dat: true, loi: [] });
  });

  it("tệp bị CẮT CỤT (tóm tắt còn nguyên) → đỏ, nêu đúng bảng — verify cũ để lọt đúng ca này", () => {
    dungBan(goc);
    fs.writeFileSync(path.join(goc, "public__bills.jsonl"), '{"id":1,"total":50000}\n');
    const r = kiemTep(goc);
    expect(r.dat).toBe(false);
    expect(r.loi.join("\n")).toMatch(/public\.bills.*1.*2/);
  });

  it("một dòng hỏng JSON → đỏ", () => {
    dungBan(goc);
    fs.writeFileSync(path.join(goc, "public__bills.jsonl"), '{"id":1,"total":50000}\n{"id":2,"tot\n');
    const r = kiemTep(goc);
    expect(r.dat).toBe(false);
    expect(r.loi.join("\n")).toMatch(/public\.bills/);
  });

  it("đủ số dòng nhưng NỘI DUNG đổi → mã băm lệch → đỏ", () => {
    dungBan(goc);
    fs.writeFileSync(path.join(goc, "public__bills.jsonl"), '{"id":1,"total":1}\n{"id":2,"total":70000}\n');
    const r = kiemTep(goc);
    expect(r.dat).toBe(false);
    expect(r.loi.join("\n")).toMatch(/public\.bills.*băm/);
  });

  it("thiếu hẳn tệp của một bảng → đỏ", () => {
    dungBan(goc);
    fs.rmSync(path.join(goc, "public__bills.jsonl"));
    expect(kiemTep(goc).dat).toBe(false);
  });

  it("CHƯA chép ảnh → đỏ: sao lưu thiếu ảnh là sao lưu thiếu", () => {
    dungBan(goc, { soAnh: null });
    const r = kiemTep(goc);
    expect(r.dat).toBe(false);
    expect(r.loi.join("\n")).toMatch(/ảnh/);
  });

  it("chép THIẾU ảnh (1/2) → đỏ — chepAnh cũ gặp lỗi chỉ ghi log rồi đi tiếp", () => {
    dungBan(goc, { soAnh: 1 });
    const r = kiemTep(goc);
    expect(r.dat).toBe(false);
    expect(r.loi.join("\n")).toMatch(/ảnh.*1.*2/);
  });

  it("bản sao lưu cũ chưa có mã băm → vẫn kiểm số dòng + JSON, không đánh đỏ oan", () => {
    dungBan(goc, { coBam: false });
    expect(kiemTep(goc).dat).toBe(true);
  });

  it("một bảng dump LỖI (ghi trong tóm tắt) → đỏ: thiếu bảng là bản sao lưu không trọn", () => {
    dungBan(goc);
    const tt = JSON.parse(fs.readFileSync(path.join(goc, "_tom-tat.json"), "utf8"));
    tt.bang["auth.users"] = { loi: "permission denied" };
    fs.writeFileSync(path.join(goc, "_tom-tat.json"), JSON.stringify(tt));
    const r = kiemTep(goc);
    expect(r.dat).toBe(false);
    expect(r.loi.join("\n")).toMatch(/auth\.users/);
  });

  it("không có tệp tóm tắt → đỏ, không ném", () => {
    expect(kiemTep(goc).dat).toBe(false);
  });
});

describe("tuoiBanMoiNhat — trả lời 'bản gần nhất bao giờ' không cần mở thư mục", () => {
  const BAY_GIO = Date.parse("2026-09-25T00:00:00.000Z");

  it("KHÔNG có bản nào → null. Đây là chế độ hỏng im lặng nhất, phải đỏ chứ không được xanh", () => {
    expect(tuoiBanMoiNhat(goc, BAY_GIO)).toBeNull();
  });

  it("chọn bản MỚI NHẤT theo mốc ghi trong tệp tóm tắt, không theo giờ sửa thư mục", () => {
    dungBan(path.join(goc, "a"), { luc: "2026-09-23T00:00:00.000Z" });
    dungBan(path.join(goc, "b"), { luc: "2026-09-24T12:00:00.000Z" });
    dungBan(path.join(goc, "c"), { luc: "2026-09-22T00:00:00.000Z" });
    expect(tuoiBanMoiNhat(goc, BAY_GIO)).toEqual({
      thuMuc: path.join(goc, "b"),
      luc: "2026-09-24T12:00:00.000Z",
      gio: 12,
    });
  });

  it("thư mục rác (không có tóm tắt) bị bỏ qua, không làm sập", () => {
    fs.mkdirSync(path.join(goc, "rac"));
    dungBan(path.join(goc, "a"), { luc: "2026-09-24T18:00:00.000Z" });
    expect(tuoiBanMoiNhat(goc, BAY_GIO)?.gio).toBe(6);
  });
});
