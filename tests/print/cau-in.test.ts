import { describe, it, expect } from "vitest";
import {
  cauInConSong,
  phieuQuaHan,
  loiDonDap,
  NGUONG_MAT_KET_NOI_MS,
  NGUONG_QUA_HAN_MS,
  NGUONG_LOI_DON_DAP,
  CUA_SO_LOI_MS,
  CHIP_HOI_LAI_MS,
  CHIP_SO_LAN_HOI,
} from "@/lib/print/cau-in";
import { NHIP_TIM_MS } from "../../scripts/print-bridge.mjs";

/**
 * 09-03 — Cầu in: biết khi nó chết, tự đi đường khác.
 *
 * Ngày 24/09/2026 cầu in qt-food chết khi xóa database Mỹ và không ai biết: POS vẫn nhận phiếu
 * bếp vào hàng đợi, chip quay "Đang gửi bếp…" mãi. Mọi ngưỡng dưới đây lấy từ dữ liệu thật của
 * quán — xem docs/30-KeHoach/P9/09-03-PLAN.md.
 */
const BAY_GIO = Date.parse("2026-09-24T06:00:00.000Z");
const truoc = (ms: number) => new Date(BAY_GIO - ms).toISOString();

describe("cauInConSong — PRINT-08", () => {
  it("nhịp tim vừa xong → còn sống", () => {
    expect(cauInConSong(truoc(5_000), BAY_GIO)).toBe(true);
  });

  it("đúng ngưỡng → vẫn tính là sống (không đổi đường in vì chênh một mili giây)", () => {
    expect(cauInConSong(truoc(NGUONG_MAT_KET_NOI_MS), BAY_GIO)).toBe(true);
  });

  it("quá ngưỡng → chết, phải in trình duyệt", () => {
    expect(cauInConSong(truoc(NGUONG_MAT_KET_NOI_MS + 1), BAY_GIO)).toBe(false);
  });

  it("chưa từng có nhịp tim (quán chưa lắp cầu in) → chết, KHÔNG xếp phiếu vào hàng đợi", () => {
    expect(cauInConSong(null, BAY_GIO)).toBe(false);
    expect(cauInConSong(undefined, BAY_GIO)).toBe(false);
  });

  it("mốc giờ hỏng → chết, không đoán là sống", () => {
    expect(cauInConSong("khong-phai-ngay", BAY_GIO)).toBe(false);
  });

  it("mốc giờ hơi lệch về tương lai (đồng hồ hai máy chủ lệch nhau) → vẫn sống", () => {
    expect(cauInConSong(new Date(BAY_GIO + 3_000).toISOString(), BAY_GIO)).toBe(true);
  });
});

describe("phieuQuaHan — PRINT-06", () => {
  it("chờ 60 giây → chưa quá hạn (p99 của cầu in khỏe là 67 giây)", () => {
    expect(phieuQuaHan(truoc(60_000), BAY_GIO)).toBe(false);
  });

  it("chờ quá 120 giây → quá hạn, chip phải đỏ", () => {
    expect(phieuQuaHan(truoc(NGUONG_QUA_HAN_MS + 1), BAY_GIO)).toBe(true);
  });

  it("mốc giờ hỏng → không kết luận quá hạn (chip đỏ giả còn tệ hơn không có chip)", () => {
    expect(phieuQuaHan("rac", BAY_GIO)).toBe(false);
  });
});

describe("loiDonDap — PRINT-07", () => {
  const loi = (...giayTruoc: number[]) => giayTruoc.map((g) => truoc(g * 1000));

  it("dưới ngưỡng → im", () => {
    const r = loiDonDap(loi(10, 60), BAY_GIO, null);
    expect(r).toEqual({ canhBao: false, soLoi: 2 });
  });

  it("đủ ngưỡng trong cửa sổ → kêu, kèm số lỗi thật", () => {
    const r = loiDonDap(loi(10, 60, 200), BAY_GIO, null);
    expect(r).toEqual({ canhBao: true, soLoi: 3 });
  });

  it("lỗi cũ ngoài cửa sổ 5 phút không tính", () => {
    const r = loiDonDap(loi(10, 60, 400, 500), BAY_GIO, null);
    expect(r.soLoi).toBe(2);
    expect(r.canhBao).toBe(false);
  });

  it("đã bấm 'Đã xử lý' → lỗi TRƯỚC lúc bấm không kêu lại", () => {
    const r = loiDonDap(loi(10, 60, 200), BAY_GIO, truoc(5_000));
    expect(r).toEqual({ canhBao: false, soLoi: 0 });
  });

  it("đã bấm 'Đã xử lý' nhưng lỗi MỚI dồn tiếp → kêu lại", () => {
    const r = loiDonDap(loi(1, 2, 3, 200), BAY_GIO, truoc(100_000));
    expect(r).toEqual({ canhBao: true, soLoi: 3 });
  });

  it("mốc giờ hỏng trong danh sách → bỏ qua, không làm sập", () => {
    const r = loiDonDap(["rac", ...loi(1, 2, 3)], BAY_GIO, null);
    expect(r.soLoi).toBe(3);
  });
});

/**
 * Các ngưỡng dính nhau. Sửa một con mà quên con kia thì hệ thống hỏng theo cách không ai thấy:
 *  - ngưỡng mất kết nối < 3 nhịp tim → một nhịp trễ vì mạng chập là POS chuyển sang in trình duyệt
 *    trong khi cầu in vẫn sống → bếp nhận HAI tờ khi cầu in bắt kịp.
 *  - chip ngừng hỏi trước ngưỡng quá hạn → chip không bao giờ đổi sang đỏ, đúng lỗi 24/09.
 */
describe("quan hệ giữa các ngưỡng", () => {
  it("ngưỡng mất kết nối ≥ 3 nhịp tim của cầu in", () => {
    expect(NGUONG_MAT_KET_NOI_MS).toBeGreaterThanOrEqual(3 * NHIP_TIM_MS);
  });

  it("chip đang chờ còn hỏi lại lâu hơn ngưỡng quá hạn", () => {
    expect(CHIP_HOI_LAI_MS * CHIP_SO_LAN_HOI).toBeGreaterThan(NGUONG_QUA_HAN_MS);
  });

  it("ngưỡng lỗi dồn dập và cửa sổ khớp số đã chốt từ dữ liệu", () => {
    expect(NGUONG_LOI_DON_DAP).toBe(3);
    expect(CUA_SO_LOI_MS).toBe(5 * 60_000);
  });
});
