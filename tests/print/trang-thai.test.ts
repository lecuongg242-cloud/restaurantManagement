import { describe, it, expect } from "vitest";
import { toState, type JobRow } from "@/lib/print/trang-thai";
import { NGUONG_QUA_HAN_MS } from "@/lib/print/cau-in";

/**
 * Chip trạng thái phiếu trên POS (PRINT-06).
 *
 * Trước 09-03, phiếu nằm `pending` thì chip quay "Đang gửi bếp…" MÃI MÃI — kể cả khi cầu in đã chết
 * từ sáng. Giờ phiếu kẹt quá ngưỡng phải thành đỏ, bấm được để in lại.
 */
const BAY_GIO = Date.parse("2026-09-24T06:00:00.000Z");
const luc = (giayTruoc: number) => new Date(BAY_GIO - giayTruoc * 1000).toISOString();
const job = (status: string, giayTruoc: number, inLuc: number | null = null): JobRow => ({
  type: "kitchen_ticket",
  status,
  created_at: luc(giayTruoc),
  printed_at: inLuc === null ? null : luc(inLuc),
});

describe("toState", () => {
  it("chưa có lượt nào → chưa in", () => {
    expect(toState([], BAY_GIO)).toEqual({ status: "none", at: null, count: 0 });
  });

  it("đang chờ, còn trong hạn → pending (cầu in khỏe mà chậm vẫn được chờ)", () => {
    expect(toState([job("pending", 60)], BAY_GIO).status).toBe("pending");
  });

  it("đang chờ QUÁ HẠN → stuck, chip phải đỏ — đúng lỗi 24/09", () => {
    const giay = NGUONG_QUA_HAN_MS / 1000 + 1;
    expect(toState([job("pending", giay)], BAY_GIO).status).toBe("stuck");
  });

  it("lượt superseded bị BỎ QUA — lượt in lại mới là thứ nhân viên cần thấy", () => {
    const rows = [job("printed", 10, 8), job("superseded", 300)]; // mới → cũ
    expect(toState(rows, BAY_GIO)).toMatchObject({ status: "printed", count: 1 });
  });

  it("chỉ có lượt superseded → coi như chưa in, KHÔNG phải đang chờ", () => {
    expect(toState([job("superseded", 300)], BAY_GIO).status).toBe("none");
  });

  it("đếm đúng số tờ đã in, bỏ qua lượt hỏng và lượt bị thay thế", () => {
    const rows = [job("printed", 5, 4), job("failed", 50), job("printed", 100, 98), job("superseded", 200)];
    const s = toState(rows, BAY_GIO);
    expect(s.status).toBe("printed");
    expect(s.count).toBe(2);
    expect(s.at).toBe(luc(4));
  });

  it("lượt mới nhất hỏng → failed, giữ nguyên hành vi cũ", () => {
    expect(toState([job("failed", 5), job("printed", 100, 98)], BAY_GIO).status).toBe("failed");
  });
});
