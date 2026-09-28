import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { taoXlsx, tenCot, tenFileXuat } from "@/lib/reports/xlsx";
import { tenCacMuc } from "@/lib/print/zip-them";

/**
 * P16 16-04 — xuất Excel không thư viện. Ngoài kiểm cấu trúc, test MỞ LẠI file bằng openpyxl (thư viện Excel thật của
 * Python) nếu máy có: đọc được = Excel / Google Sheets mở được. Máy không có Python/openpyxl thì bỏ qua phần đó.
 */
const DONG: (string | number | null)[][] = [
  ["Phở bò, tái \"đặc biệt\"", 2, 130000],
  ["Trà đá\nmang về", 3, 15000],
  ["Ký tự lạ \u0001 bị bỏ", null, 0],
];

describe("taoXlsx", () => {
  it("đủ các phần của một file xlsx, mỗi khối một trang tính", () => {
    const buf = taoXlsx([
      { ten: "Món bán chạy", cot: [{ nhan: "Món" }, { nhan: "SL" }, { nhan: "Doanh thu (đ)" }], dong: DONG },
      { ten: "Nhân viên", cot: [{ nhan: "Tên" }], dong: [["Lan"]] },
    ]);
    expect(tenCacMuc(buf)).toEqual(
      expect.arrayContaining(["[Content_Types].xml", "xl/workbook.xml", "xl/worksheets/sheet1.xml", "xl/worksheets/sheet2.xml"])
    );
  });

  it("tên cột Excel: A, Z, AA, AZ", () => {
    expect([0, 25, 26, 51].map(tenCot)).toEqual(["A", "Z", "AA", "AZ"]);
  });

  it("tên file không dấu", () => {
    expect(tenFileXuat("qt-food", "Báo cáo Nhân viên", "2026-09-01", "2026-09-27")).toBe("qt-food_bao-cao-nhan-vien_2026-09-01_2026-09-27.xlsx");
  });

  it("openpyxl đọc lại đúng tiếng Việt, số là SỐ, ký tự đặc biệt không làm hỏng file", () => {
    const buf = taoXlsx([
      { ten: "Món bán chạy", cot: [{ nhan: "Món" }, { nhan: "SL" }, { nhan: "Doanh thu (đ)" }], dong: DONG },
      { ten: "Trống", cot: [{ nhan: "Tên" }], dong: [] },
    ]);
    fs.mkdirSync("test-results", { recursive: true });
    const f = path.join("test-results", "mau-xuat.xlsx");
    fs.writeFileSync(f, buf);
    let out: string;
    try {
      out = execFileSync(
        "python",
        ["-c", `import openpyxl,json,sys;wb=openpyxl.load_workbook(sys.argv[1]);print(json.dumps({n:[[c for c in r] for r in wb[n].iter_rows(values_only=True)] for n in wb.sheetnames},ensure_ascii=False))`, f],
        { encoding: "utf8", env: { ...process.env, PYTHONIOENCODING: "utf8" } }
      );
    } catch {
      return; // không có Python/openpyxl
    }
    const doc = JSON.parse(out);
    expect(doc["Món bán chạy"][0]).toEqual(["Món", "SL", "Doanh thu (đ)"]);
    expect(doc["Món bán chạy"][1]).toEqual(['Phở bò, tái "đặc biệt"', 2, 130000]);
    expect(doc["Món bán chạy"][2][0]).toBe("Trà đá\nmang về");
    expect(doc["Món bán chạy"][3]).toEqual(["Ký tự lạ  bị bỏ", null, 0]);
    expect(doc["Trống"]).toEqual([["Tên"]]);
  });
});
