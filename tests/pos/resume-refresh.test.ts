import { describe, it, expect, vi } from "vitest";
import { taoBoLamMoi } from "@/components/pos/use-resume-refresh";

/**
 * ORDER-19 — tải lại khi máy thức dậy / có mạng lại. iPad, điện thoại ngủ liên tục; WebSocket chết
 * trong lúc ngủ mà không có sự kiện nào báo ⇒ không tải lại là POS hiện bàn trống trong khi bàn đang có
 * khách. Nhưng mỗi lần tải lại là một lượt render server (PERF-04) — gộp sự kiện dồn dập.
 */
describe("taoBoLamMoi", () => {
  it("tab hiện lại → tải lại MỘT lần", () => {
    const goi = vi.fn();
    const bo = taoBoLamMoi({ goi, now: () => 10_000, khoangCachMs: 5000 });
    bo.khiHienLai("visible");
    expect(goi).toHaveBeenCalledTimes(1);
  });

  it("tab ẩn → không tải", () => {
    const goi = vi.fn();
    taoBoLamMoi({ goi, now: () => 10_000, khoangCachMs: 5000 }).khiHienLai("hidden");
    expect(goi).not.toHaveBeenCalled();
  });

  it("có mạng lại → tải lại", () => {
    const goi = vi.fn();
    taoBoLamMoi({ goi, now: () => 10_000, khoangCachMs: 5000 }).khiCoMang();
    expect(goi).toHaveBeenCalledTimes(1);
  });

  it("sự kiện dồn dập (hiện lại + có mạng cùng lúc) → chỉ một lần trong khoảng cách", () => {
    const goi = vi.fn();
    let t = 10_000;
    const bo = taoBoLamMoi({ goi, now: () => t, khoangCachMs: 5000 });
    bo.khiHienLai("visible");
    t += 200;
    bo.khiCoMang();
    t += 3000;
    bo.khiHienLai("visible");
    expect(goi).toHaveBeenCalledTimes(1);
    t += 2000; // đã quá 5 giây kể từ lần đầu
    bo.khiHienLai("visible");
    expect(goi).toHaveBeenCalledTimes(2);
  });
});
