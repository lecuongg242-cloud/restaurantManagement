import { describe, it, expect } from "vitest";
import { cancelRateLabel, cancelRateDeltaPoints } from "@/lib/billing/cancel-format";

describe("cancelRateLabel (REPORT-10)", () => {
  it("giữ 2 chữ số thập phân, dấu phẩy kiểu Việt", () => {
    expect(cancelRateLabel(12, 500)).toBe("2,40%");
  });

  it("không có món nào được gọi → '—', không chia cho 0", () => {
    expect(cancelRateLabel(0, 0)).toBe("—");
  });

  it("không hủy món nào nhưng có gọi → 0,00%", () => {
    expect(cancelRateLabel(0, 500)).toBe("0,00%");
  });

  it("tỷ lệ rất nhỏ vẫn không bị bóp thành 0", () => {
    expect(cancelRateLabel(1, 100000)).toBe("0,0010%");
  });

  it("hủy hết → 100,00%", () => {
    expect(cancelRateLabel(30, 30)).toBe("100,00%");
  });
});

describe("cancelRateDeltaPoints — biến động tính bằng ĐIỂM phần trăm", () => {
  it("2,40% so với 3,00% → -0,6 điểm (không phải -20%)", () => {
    const d = cancelRateDeltaPoints(
      { cancelledQty: 12, orderedQty: 500 },
      { cancelledQty: 15, orderedQty: 500 }
    );
    expect(d).toBe(-0.6);
  });

  it("tỷ lệ tăng → số dương", () => {
    const d = cancelRateDeltaPoints(
      { cancelledQty: 20, orderedQty: 500 },
      { cancelledQty: 10, orderedQty: 500 }
    );
    expect(d).toBe(2);
  });

  it("kỳ trước không có món nào được gọi → null (không so sánh được)", () => {
    expect(
      cancelRateDeltaPoints({ cancelledQty: 12, orderedQty: 500 }, { cancelledQty: 0, orderedQty: 0 })
    ).toBeNull();
  });

  it("kỳ này không có món nào được gọi → null", () => {
    expect(
      cancelRateDeltaPoints({ cancelledQty: 0, orderedQty: 0 }, { cancelledQty: 5, orderedQty: 100 })
    ).toBeNull();
  });
});
