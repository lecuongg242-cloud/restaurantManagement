import { describe, it, expect } from "vitest";
import { backtest, congNgay, forecastDaily, gomMonMoi, soTuanCoBan, thuTrongTuan } from "@/lib/forecast/model.mjs";
import { NGAY_LE_VN } from "@/lib/forecast/holidays-vn.mjs";

/** P18 18-01 (AI-01/02): dự báo thống kê thuần + backtest. Chạy dưới TZ=UTC (vitest.config). */
type Diem = { date: string; value: number };

/** n ngày liên tiếp kết thúc ở `den` (tính cả `den`), giá trị theo hàm của ngày. */
function chuoi(den: string, n: number, f: (d: string) => number): Diem[] {
  return Array.from({ length: n }, (_, i) => {
    const date = congNgay(den, -(n - 1 - i));
    return { date, value: f(date) };
  });
}

describe("forecastDaily", () => {
  it("chuỗi hằng số → dự báo đúng hằng số, sai số 0", () => {
    const du = forecastDaily(chuoi("2026-09-27", 70, () => 1_000_000), { horizon: 7 });
    expect(du).toHaveLength(7);
    expect(du[0].date).toBe("2026-09-28");
    for (const d of du) {
      expect(d.value).toBeCloseTo(1_000_000, 6);
      expect(d.low).toBeCloseTo(1_000_000, 6);
      expect(d.high).toBeCloseTo(1_000_000, 6);
    }
  });

  it("chu kỳ tuần hoàn hảo (thứ Bảy gấp đôi) → dự báo giữ chu kỳ", () => {
    const du = forecastDaily(chuoi("2026-09-27", 84, (d) => (thuTrongTuan(d) === 6 ? 2_000_000 : 1_000_000)), { horizon: 7 });
    for (const d of du) expect(d.value).toBeCloseTo(thuTrongTuan(d.date) === 6 ? 2_000_000 : 1_000_000, 6);
  });

  it("quán đóng Tết (lễ + ngày 0) trong lịch sử → không kéo tụt dự báo tuần thường", () => {
    // Lịch sử kết thúc ngay sau Tết 2026 (mùng 1 = 17/02): các ngày Tết bán 0 hoặc rất ít.
    const tet = new Set(NGAY_LE_VN);
    const h = chuoi("2026-02-28", 70, (d) => (tet.has(d) ? (d === "2026-02-21" ? 200_000 : 0) : 1_000_000));
    const du = forecastDaily(h, { horizon: 7, holidays: NGAY_LE_VN });
    for (const d of du) expect(d.value).toBeCloseTo(1_000_000, 6);
  });

  it("ngày lễ trong tương lai → được đánh dấu", () => {
    const du = forecastDaily(chuoi("2026-04-27", 60, () => 500_000), { horizon: 7, holidays: NGAY_LE_VN });
    expect(du.find((d) => d.date === "2026-04-30")?.holiday).toBe(true);
    expect(du.find((d) => d.date === "2026-05-01")?.holiday).toBe(true);
    expect(du.find((d) => d.date === "2026-04-28")?.holiday).toBe(false);
  });

  it("xu hướng tăng gần đây → dự báo cao hơn trung bình cũ nhưng bị kẹp (≤ 15%)", () => {
    const h = chuoi("2026-09-27", 84, (d) => (d > "2026-09-13" ? 2_000_000 : 1_000_000));
    const du = forecastDaily(h, { horizon: 7 });
    for (const d of du) {
      expect(d.value).toBeGreaterThan(1_000_000);
      expect(d.value).toBeLessThanOrEqual(2_000_000 * 1.15 + 1e-6);
    }
  });

  it("chỉ có 1 ngày bán → khoảng sai số rộng, không phải khoảng 0", () => {
    const [d] = forecastDaily([{ date: "2026-09-20", value: 1_000_000 }], { horizon: 1, from: "2026-09-28" });
    expect(d.low).toBe(0);
    expect(d.high).toBeGreaterThan(2 * d.value);
  });

  it("ngày tính theo chuỗi YYYY-MM-DD, không lệch múi giờ (TZ=UTC)", () => {
    expect(congNgay("2026-12-31", 1)).toBe("2027-01-01");
    expect(thuTrongTuan("2026-09-28")).toBe(1); // thứ Hai
  });
});

describe("backtest", () => {
  it("đáp án đã biết: 8 tuần 100, tuần cuối 110 → dự báo 100, sai lệch 10/110 = 9,09%", () => {
    const h = chuoi("2026-09-27", 63, (d) => (d >= "2026-09-21" ? 110 : 100));
    const { mape, perFold } = backtest(h, { weeks: 6 }, 1);
    expect(perFold).toHaveLength(1);
    expect(mape).toBeCloseTo((10 / 110) * 100, 6);
  });

  it("một ngày bán rất ít (nghỉ sớm) không làm sai lệch cả tuần vọt lên — có trọng số theo doanh thu", () => {
    // 6 ngày 100 + 1 ngày 5: dự báo 100 mọi ngày → lệch 95 trên tổng 605 = 15,7% (MAPE thường sẽ là 271%).
    const h = chuoi("2026-09-27", 63, (d) => (d === "2026-09-23" ? 5 : 100));
    expect(backtest(h, { weeks: 6 }, 1).mape).toBeCloseTo((95 / 605) * 100, 6);
  });

  it("ngày thực tế = 0 (quán nghỉ) bị loại, không chia 0", () => {
    const h = chuoi("2026-09-27", 63, (d) => (d === "2026-09-23" ? 0 : 100));
    const { mape } = backtest(h, { weeks: 6 }, 1);
    expect(mape).toBe(0);
  });

  it("chuỗi hằng số → MAPE 0 trên cả 4 tuần", () => {
    const { mape, perFold } = backtest(chuoi("2026-09-27", 100, () => 1234), {}, 4);
    expect(perFold).toEqual([0, 0, 0, 0]);
    expect(mape).toBe(0);
  });
});

describe("soTuanCoBan / gomMonMoi", () => {
  it("đếm tuần thứ Hai → Chủ nhật có bán", () => {
    expect(soTuanCoBan(chuoi("2026-09-27", 14, () => 1))).toBe(2); // 14/09 (T2) → 27/09 (CN)
    expect(soTuanCoBan([{ date: "2026-09-27", value: 1 }, { date: "2026-09-28", value: 1 }])).toBe(2);
    expect(soTuanCoBan([{ date: "2026-09-27", value: 0 }])).toBe(0);
  });

  it("món bán chưa đủ 3 tuần → gộp 'khac'; món cũ giữ riêng", () => {
    const m = new Map<string, Diem[]>([
      ["cu", chuoi("2026-09-27", 30, () => 5)],
      ["moi1", chuoi("2026-09-27", 10, () => 2)],
      ["moi2", chuoi("2026-09-27", 5, () => 1)],
    ]);
    const g = gomMonMoi(m, "2026-09-28");
    expect([...g.keys()].sort()).toEqual(["cu", "khac"]);
    expect(g.get("khac")!.find((p) => p.date === "2026-09-27")!.value).toBe(3);
  });
});

describe("NGAY_LE_VN", () => {
  it("có Tết 2026–2028 (29 Tết → mùng 5), Giỗ Tổ, 30/4, 1/5, 2/9", () => {
    for (const d of ["2026-02-15", "2026-02-17", "2026-02-21", "2027-02-06", "2028-01-26", "2026-04-26", "2027-04-30", "2028-09-02"]) {
      expect(NGAY_LE_VN).toContain(d);
    }
    expect(NGAY_LE_VN).not.toContain("2026-02-22");
  });
});
