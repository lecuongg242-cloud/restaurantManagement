import { describe, it, expect, afterEach } from "vitest";
import net from "node:net";
import { trangThaiMayIn } from "@/lib/print/cau-in";
import { NGUONG_MAT_KET_NOI_MS } from "@/lib/print/cau-in";
import { thuMayIn } from "../../scripts/print-bridge.mjs";

/**
 * PRINT-09 — màn "Máy in" trong admin.
 *
 * Nhịp tim 09-03 chỉ biết CẦU IN còn sống. Máy in rút dây mà cầu in vẫn chạy thì trước đây chỉ lộ
 * ra khi có phiếu `failed`. Giờ cầu in thử kết nối tới máy in mỗi nhịp tim.
 */
const BAY_GIO = Date.parse("2026-09-24T07:00:00.000Z");
const truoc = (ms: number) => new Date(BAY_GIO - ms).toISOString();

describe("trangThaiMayIn", () => {
  it("quán chưa từng có cầu in → chưa có cầu in, máy in không biết", () => {
    expect(trangThaiMayIn(null, BAY_GIO)).toEqual({ cauIn: "chua-co", mayIn: "khong-biet" });
  });

  it("cầu in sống + máy in vừa phản hồi → ok", () => {
    const r = trangThaiMayIn({ seen_at: truoc(5_000), printer_ok: true, printer_checked_at: truoc(5_000) }, BAY_GIO);
    expect(r).toEqual({ cauIn: "song", mayIn: "ok" });
  });

  it("cầu in sống + máy in KHÔNG phản hồi → lỗi — đây là thứ trước đây không ai thấy", () => {
    const r = trangThaiMayIn({ seen_at: truoc(5_000), printer_ok: false, printer_checked_at: truoc(5_000) }, BAY_GIO);
    expect(r).toEqual({ cauIn: "song", mayIn: "loi" });
  });

  it("cầu in CHẾT → máy in 'không biết', dù lần cuối báo phản hồi — dữ liệu cũ không còn đúng", () => {
    const cu = truoc(NGUONG_MAT_KET_NOI_MS + 60_000);
    const r = trangThaiMayIn({ seen_at: cu, printer_ok: true, printer_checked_at: cu }, BAY_GIO);
    expect(r).toEqual({ cauIn: "chet", mayIn: "khong-biet" });
  });

  it("cầu in bản cũ (chưa từng báo máy in) → không biết", () => {
    const r = trangThaiMayIn({ seen_at: truoc(5_000), printer_ok: null, printer_checked_at: null }, BAY_GIO);
    expect(r).toEqual({ cauIn: "song", mayIn: "khong-biet" });
  });

  it("kết quả thử máy in CŨ hơn ngưỡng → không biết, không hiện 'phản hồi' từ dữ liệu cũ", () => {
    const r = trangThaiMayIn(
      { seen_at: truoc(5_000), printer_ok: true, printer_checked_at: truoc(NGUONG_MAT_KET_NOI_MS + 1) },
      BAY_GIO
    );
    expect(r.mayIn).toBe("khong-biet");
  });
});

describe("thuMayIn — mở kết nối rồi đóng, không gửi byte nào", () => {
  let server: net.Server | null = null;
  afterEach(async () => {
    if (server) await new Promise<void>((r) => server!.close(() => r()));
    server = null;
  });

  it("máy in đang nghe → phản hồi, và KHÔNG nhận được byte nào (không ra giấy)", async () => {
    let nhan = 0;
    server = net.createServer((s) => {
      s.on("data", (d) => (nhan += d.length));
    });
    await new Promise<void>((r) => server!.listen(0, "127.0.0.1", () => r()));
    const cong = (server.address() as net.AddressInfo).port;

    expect(await thuMayIn("127.0.0.1", cong, 2000)).toBe(true);
    await new Promise((r) => setTimeout(r, 100));
    expect(nhan, "thử máy in mà gửi dữ liệu → máy in thật sẽ ra giấy").toBe(0);
  });

  it("không có gì nghe ở cổng đó → không phản hồi", async () => {
    // Mở rồi đóng ngay để lấy một cổng chắc chắn đang trống.
    const tam = net.createServer();
    await new Promise<void>((r) => tam.listen(0, "127.0.0.1", () => r()));
    const cong = (tam.address() as net.AddressInfo).port;
    await new Promise<void>((r) => tam.close(() => r()));

    expect(await thuMayIn("127.0.0.1", cong, 2000)).toBe(false);
  });

  it("máy in không tồn tại → không phản hồi, và KHÔNG treo quá thời hạn", async () => {
    const t0 = Date.now();
    expect(await thuMayIn("10.255.255.1", 9100, 400)).toBe(false);
    expect(Date.now() - t0).toBeLessThan(2500);
  });
});
