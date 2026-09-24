import { describe, it, expect } from "vitest";
import { giuMotPhien, MA_THOAT_DA_CHAY } from "../../scripts/print-bridge.mjs";

/**
 * PRINT-08 — Mỗi máy chỉ MỘT cầu in.
 *
 * Bộ cài (scripts/print-setup.ps1) chạy cầu in bằng tác vụ SYSTEM lúc bật máy — KHÔNG có cửa sổ.
 * Nhân viên không thấy cầu in đâu, tưởng nó tắt, double-click print-bridge.bat → hai cầu in cùng
 * chạy, cùng thấy một phiếu `pending` → bếp nhận HAI tờ. Mỗi tiến trình có `inFlight` riêng nên
 * chúng không biết nhau.
 *
 * Khóa bằng cổng TCP trên 127.0.0.1: hệ điều hành tự nhả khi tiến trình chết (kể cả chết đột ngột),
 * nên không bao giờ kẹt khóa mồ côi như tệp .lock. Cổng là toàn máy, nên chặn được cả trường hợp
 * một bản chạy dưới SYSTEM và một bản chạy dưới người dùng.
 */
// Cổng riêng cho test — không đụng cổng thật nếu máy dev đang chạy cầu in.
const CONG = 47000 + Math.floor(Math.random() * 900);

describe("giuMotPhien", () => {
  it("cầu in đầu tiên giữ được khóa", async () => {
    const khoa = await giuMotPhien(CONG);
    expect(khoa).not.toBeNull();
    await khoa!.thaRa();
  });

  it("cầu in THỨ HAI trên cùng máy bị từ chối — đây là cảnh gây in hai tờ", async () => {
    const dau = await giuMotPhien(CONG);
    const hai = await giuMotPhien(CONG);
    expect(dau).not.toBeNull();
    expect(hai, "hai cầu in cùng chạy được → mỗi phiếu ra hai tờ").toBeNull();
    await dau!.thaRa();
  });

  it("cầu in đầu tắt rồi thì cầu in mới chạy được — không kẹt khóa", async () => {
    const dau = await giuMotPhien(CONG);
    await dau!.thaRa();
    const sau = await giuMotPhien(CONG);
    expect(sau).not.toBeNull();
    await sau!.thaRa();
  });

  it("mã thoát 'đã có cầu in chạy' khác 0 và khác 1 — .bat phân biệt được với lỗi thật", () => {
    expect(Number.isInteger(MA_THOAT_DA_CHAY)).toBe(true);
    expect(MA_THOAT_DA_CHAY).not.toBe(0);
    expect(MA_THOAT_DA_CHAY).not.toBe(1);
  });
});
