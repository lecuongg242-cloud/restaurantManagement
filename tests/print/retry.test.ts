import { describe, it, expect, vi } from "vitest";
import { thuLaiGui, CHO_GIUA_LAN_MS } from "../../scripts/print-bridge.mjs";

/**
 * BUG "phiếu bếp thất lạc" — cầu in gặp lỗi gửi là đánh `failed` luôn, không thử lại.
 *
 * Dữ liệu qt-food (24/09/2026): 174 lượt `failed`, chỉ 52 được in lại — **122 phiếu không bao giờ
 * tới bếp**. Việc phục hồi đang dựa hoàn toàn vào người để ý chip đỏ giữa giờ cao điểm, và họ bỏ
 * sót 70%.
 *
 * Phần lớn lỗi ở đây là chớp nhoáng (nghẽn LAN, timeout socket 8s). Máy in rút dây thật thì thử
 * lại mấy lần cũng hỏng — và lúc đó đánh `failed` mới là đúng.
 */
describe("thuLaiGui", () => {
  it("thành công ngay lần đầu → gọi đúng 1 lần, không chờ", async () => {
    const gui = vi.fn(async () => undefined);
    await thuLaiGui(gui, 2, 0);
    expect(gui).toHaveBeenCalledTimes(1);
  });

  it("hỏng rồi thành công → vẫn in được, KHÔNG mất phiếu", async () => {
    let lan = 0;
    const gui = vi.fn(async () => {
      lan += 1;
      if (lan < 3) throw new Error("ECONNRESET");
    });
    await thuLaiGui(gui, 2, 0);
    expect(gui).toHaveBeenCalledTimes(3);
  });

  it("hỏng hết mọi lần → ném lỗi CUỐI CÙNG để log nói đúng nguyên nhân", async () => {
    const gui = vi.fn(async () => {
      throw new Error("máy in rút dây");
    });
    await expect(thuLaiGui(gui, 2, 0)).rejects.toThrow("máy in rút dây");
    expect(gui, "phải thử đủ 1 lần đầu + 2 lần lại").toHaveBeenCalledTimes(3);
  });

  it("không thử lại (0) → giữ nguyên hành vi cũ, gọi đúng 1 lần", async () => {
    const gui = vi.fn(async () => {
      throw new Error("hỏng");
    });
    await expect(thuLaiGui(gui, 0, 0)).rejects.toThrow("hỏng");
    expect(gui).toHaveBeenCalledTimes(1);
  });

  it("có chờ giữa các lần — không dội liên tiếp vào máy in đang nghẽn", async () => {
    let lan = 0;
    const gui = async () => {
      lan += 1;
      if (lan < 2) throw new Error("nghẽn");
    };
    const t0 = Date.now();
    await thuLaiGui(gui, 1, 120);
    expect(Date.now() - t0, "không thấy khoảng chờ giữa hai lần thử").toBeGreaterThanOrEqual(100);
  });

  it("khoảng chờ mặc định giãn dần, không phải hằng số", () => {
    expect(CHO_GIUA_LAN_MS.length).toBeGreaterThanOrEqual(2);
    expect(CHO_GIUA_LAN_MS[1]).toBeGreaterThan(CHO_GIUA_LAN_MS[0]);
  });
});
