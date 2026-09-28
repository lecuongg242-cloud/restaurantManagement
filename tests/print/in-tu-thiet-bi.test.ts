import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * PRINT-16 — in từ mọi thiết bị (QD-020 D3). Định tuyến theo chế độ quán × thiết bị có máy in hay không:
 *
 * | Quán     | Thiết bị        | Hóa đơn / phiếu khách                                          |
 * |----------|-----------------|----------------------------------------------------------------|
 * | bridge   | CÓ máy in       | trình duyệt như cũ (máy quầy qt-food không đổi hành vi)        |
 * | bridge   | KHÔNG máy in    | ra máy in quầy qua cầu in; chưa khai quầy → trình duyệt như cũ; |
 * |          |                 | đã khai mà cầu in chết → báo lỗi rõ                            |
 * | browser  | CÓ máy in       | trình duyệt như cũ                                             |
 * | browser  | KHÔNG máy in    | báo "thiết bị này không in được", KHÔNG mở hộp thoại in        |
 */
const queueReceiptPrint = vi.fn();
const queueCustomerTicketPrint = vi.fn();
const queueKitchenTicketPrint = vi.fn();
vi.mock("@/app/r/[slug]/print/actions", () => ({
  queueReceiptPrint: (...a: unknown[]) => queueReceiptPrint(...a),
  queueCustomerTicketPrint: (...a: unknown[]) => queueCustomerTicketPrint(...a),
  queueKitchenTicketPrint: (...a: unknown[]) => queueKitchenTicketPrint(...a),
}));

const thongBao: { loai: string; noiDung: string }[] = [];
const iframe: string[] = [];

function dungMoiTruong(rong: number, luuTru: Record<string, string> = {}) {
  const suKien = new EventTarget();
  vi.stubGlobal("window", Object.assign(suKien, { innerWidth: rong }));
  vi.stubGlobal("localStorage", { getItem: (k: string) => luuTru[k] ?? null, setItem: () => {} });
  vi.stubGlobal("document", {
    getElementById: () => null,
    createElement: () => ({ style: {}, setAttribute() {}, set src(v: string) { iframe.push(v); } }),
    body: { appendChild() {} },
  });
  window.addEventListener("thong-bao-in", (e) => thongBao.push((e as CustomEvent).detail));
}

const cho = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  thongBao.length = 0;
  iframe.length = 0;
});
afterEach(() => vi.unstubAllGlobals());

describe("thietBiCoMayIn", () => {
  it("mặc định theo khổ: ≥ 1024 có, nhỏ hơn không; máy tự khai thì theo máy", async () => {
    dungMoiTruong(1280);
    expect((await import("@/lib/print/device")).thietBiCoMayIn()).toBe(true);
    vi.resetModules();
    dungMoiTruong(390);
    expect((await import("@/lib/print/device")).thietBiCoMayIn()).toBe(false);
    vi.resetModules();
    dungMoiTruong(1280, { "pos-thiet-bi-co-may-in": "0" });
    expect((await import("@/lib/print/device")).thietBiCoMayIn()).toBe(false);
  });
});

describe("quán bridge", () => {
  it("máy CÓ máy in → hóa đơn in trình duyệt như cũ, không xếp hàng", async () => {
    dungMoiTruong(1280);
    (await import("@/lib/print/adapter")).getPrintAdapter("bridge").printReceipt({ slug: "q", billId: "b1" });
    expect(iframe[0]).toMatch(/\/print\/receipt\/b1/);
    expect(queueReceiptPrint).not.toHaveBeenCalled();
  });

  it("điện thoại → xếp ra máy in quầy + báo đã gửi, không mở hộp thoại in", async () => {
    dungMoiTruong(390);
    queueReceiptPrint.mockResolvedValue({ ok: true });
    (await import("@/lib/print/adapter")).getPrintAdapter("bridge").printReceipt({ slug: "q", billId: "b1" });
    await cho();
    expect(queueReceiptPrint).toHaveBeenCalledWith("q", "b1");
    expect(iframe).toEqual([]);
    expect(thongBao[0]).toMatchObject({ loai: "ok" });
  });

  it("điện thoại + cầu in không nhận → báo lỗi rõ, KHÔNG mở hộp thoại in", async () => {
    dungMoiTruong(390);
    queueCustomerTicketPrint.mockResolvedValue({ ok: false, lyDo: "cau-in" });
    (await import("@/lib/print/adapter")).getPrintAdapter("bridge").printCustomerTicket({ slug: "q", orderId: "o1" });
    await cho();
    expect(iframe).toEqual([]);
    expect(thongBao[0].loai).toBe("loi");
    expect(thongBao[0].noiDung).toMatch(/Cầu in/);
  });

  it("phiếu bếp, cầu in không nhận → in trình duyệt như trước P12, KỂ CẢ máy < 1024 px", async () => {
    // Laptop quầy Windows phóng to chữ 150% chỉ rộng ~910 px — báo lỗi ở đó là bếp mất phiếu.
    dungMoiTruong(910);
    queueKitchenTicketPrint.mockResolvedValue({ ok: false });
    (await import("@/lib/print/adapter")).getPrintAdapter("bridge").printKitchenTicket({ slug: "q", orderId: "o1" });
    await cho();
    expect(iframe[0]).toMatch(/\/print\/kitchen\/o1/);
  });

  it("P17: phiếu bếp từ ĐIỆN THOẠI khi cầu in mất kết nối → server xếp hàng chờ (cờ gửi lên), báo phiếu đang chờ, không mở hộp thoại in", async () => {
    dungMoiTruong(390);
    queueKitchenTicketPrint.mockResolvedValue({ ok: true, cho: true });
    (await import("@/lib/print/adapter")).getPrintAdapter("bridge").printKitchenTicket({ slug: "q", orderId: "o1" });
    await cho();
    expect(queueKitchenTicketPrint).toHaveBeenCalledWith("q", "o1", true);
    expect(iframe).toEqual([]);
    expect(thongBao[0]).toMatchObject({ loai: "loi" });
    expect(thongBao[0].noiDung).toMatch(/mất kết nối.*30 phút/);
  });

  it("P17: máy CÓ máy in không xin xếp hàng khi cầu in chết (giữ đường lui in trình duyệt)", async () => {
    dungMoiTruong(1280);
    queueKitchenTicketPrint.mockResolvedValue({ ok: true });
    (await import("@/lib/print/adapter")).getPrintAdapter("bridge").printKitchenTicket({ slug: "q", orderId: "o1" });
    await cho();
    expect(queueKitchenTicketPrint).toHaveBeenCalledWith("q", "o1", false);
    expect(thongBao).toEqual([]);
  });

  it("máy < 1024 px + cầu in CHƯA KHAI máy in quầy (qt-food trước khi cài lại) → hóa đơn in trình duyệt, không báo lỗi", async () => {
    dungMoiTruong(910);
    queueReceiptPrint.mockResolvedValue({ ok: false, lyDo: "chua-khai" });
    (await import("@/lib/print/adapter")).getPrintAdapter("bridge").printReceipt({ slug: "q", billId: "b1" });
    await cho();
    expect(iframe[0]).toMatch(/\/print\/receipt\/b1/);
    expect(thongBao).toEqual([]);
  });
});

describe("quán browser", () => {
  it("điện thoại → báo không in được, không mở hộp thoại in", async () => {
    dungMoiTruong(390);
    (await import("@/lib/print/adapter")).getPrintAdapter("browser").printReceipt({ slug: "q", billId: "b1" });
    expect(iframe).toEqual([]);
    expect(thongBao[0].loai).toBe("loi");
  });

  it("máy có máy in → in trình duyệt như cũ", async () => {
    dungMoiTruong(1280);
    (await import("@/lib/print/adapter")).getPrintAdapter("browser").printReceipt({ slug: "q", billId: "b1" });
    expect(iframe).toHaveLength(1);
  });
});
