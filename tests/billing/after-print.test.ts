import { describe, it, expect } from "vitest";
import {
  afterPrintVerdict,
  afterPrintNote,
  afterPrintHint,
  VERDICT_EMPTY,
  type AfterPrintSummary,
} from "@/lib/billing/after-print";

const money = (n: number) => `${n}đ`;

function summary(over: Partial<AfterPrintSummary> = {}): AfterPrintSummary {
  return { afterQty: 0, afterAmount: 0, comparableQty: 0, comparableAmount: 0, approxQty: 0, ...over };
}

describe("afterPrintVerdict", () => {
  it("hủy sau mốc in → 'after'", () => {
    expect(afterPrintVerdict({ printedAt: "2026-08-17T00:22:00Z", afterPrint: true, timeApprox: false })).toBe(
      "after"
    );
  });

  it("hủy TRƯỚC mốc in → 'before', không được lọt vào nhóm sau khi in", () => {
    expect(afterPrintVerdict({ printedAt: "2026-08-17T00:22:00Z", afterPrint: false, timeApprox: false })).toBe(
      "before"
    );
  });

  it("đơn chưa in lần nào → 'not_printed'", () => {
    expect(afterPrintVerdict({ printedAt: null, afterPrint: null, timeApprox: false })).toBe("not_printed");
  });

  it("mốc giờ ước lượng (dữ liệu trước 0028) → 'unknown_time', KỂ CẢ khi đơn đã in", () => {
    // Ca dễ sai nhất: dòng backfill mang mốc GỌI MÓN, đem so với mốc in sẽ ra "hủy trước khi in"
    // cho hàng loạt dòng cũ mà thật ra không ai biết chúng bị hủy lúc nào.
    expect(afterPrintVerdict({ printedAt: "2026-08-03T23:50:00Z", afterPrint: null, timeApprox: true })).toBe(
      "unknown_time"
    );
    expect(afterPrintVerdict({ printedAt: null, afterPrint: null, timeApprox: true })).toBe("unknown_time");
  });

  it("mốc ước lượng thắng cả khi SQL lỡ trả afterPrint = true", () => {
    expect(afterPrintVerdict({ printedAt: "2026-08-03T23:50:00Z", afterPrint: true, timeApprox: true })).toBe(
      "unknown_time"
    );
  });

  it("mỗi kết luận có sẵn chữ thay thế cho cột 'Đã in lúc'", () => {
    expect(VERDICT_EMPTY.not_printed).toBe("Chưa in");
    expect(VERDICT_EMPTY.unknown_time).toBe("—");
  });
});

describe("afterPrintNote", () => {
  it("không có dòng ước lượng → không có dòng chữ thừa", () => {
    expect(afterPrintNote(summary({ comparableQty: 13 }))).toBe("");
  });

  it("có dòng ước lượng → nói thẳng số món chưa xét được", () => {
    const note = afterPrintNote(summary({ comparableQty: 13, approxQty: 28 }));
    expect(note).toContain("28 món");
    expect(note).toContain("16/08/2026");
  });

  it("giọng văn trung tính — không buộc tội", () => {
    const note = afterPrintNote(summary({ approxQty: 5 }));
    for (const word of ["gian lận", "nghi vấn", "vi phạm"]) expect(note).not.toContain(word);
  });
});

describe("afterPrintHint", () => {
  it("mẫu số là số món ĐỐI CHIẾU ĐƯỢC, không phải tổng số món hủy", () => {
    // 4/13 = 30,77%. Nếu lấy mẫu số 41 (gồm 28 món ước lượng) sẽ ra 9,76% — pha loãng bằng đúng
    // những dòng không biết gì về chúng.
    const hint = afterPrintHint(summary({ afterQty: 4, afterAmount: 130000, comparableQty: 13, approxQty: 28 }), money);
    expect(hint).toBe("130000đ · 30,77% trên 13 món hủy có mốc giờ đối chiếu được");
  });

  it("tỷ lệ giữ 2 chữ số thập phân, dấu phẩy kiểu Việt", () => {
    expect(afterPrintHint(summary({ afterQty: 1, afterAmount: 0, comparableQty: 3 }), money)).toContain("33,33%");
  });

  it("mẫu số rỗng → nói không có gì đối chiếu, KHÔNG in '0%'", () => {
    const hint = afterPrintHint(summary({ approxQty: 9 }), money);
    expect(hint).toBe("Kỳ này chưa có món hủy nào có mốc giờ đối chiếu được");
    expect(hint).not.toContain("0%");
  });

  it("có mẫu số nhưng không món nào hủy sau khi in → 0,00%, không phải '—'", () => {
    expect(afterPrintHint(summary({ comparableQty: 13 }), money)).toContain("0,00%");
  });
});
