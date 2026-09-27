import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parseSettings, serializeSettings } from "@/lib/tenant/settings";

vi.mock("@/app/r/[slug]/print/actions", () => ({ queueKitchenTicketPrint: vi.fn() }));

/**
 * PRINT-10 — chế độ in theo TỪNG quán (QD-019 D5). Trước đây là `NEXT_PUBLIC_PRINT_MODE` nhúng lúc
 * build: một công tắc cho mọi quán, không thể có quán in trình duyệt cạnh quán dùng cầu in.
 */
describe("tenants.settings.print_mode", () => {
  it("thiếu → browser (quán mới không cần cài gì)", () => {
    expect(parseSettings({}).print_mode).toBe("browser");
    expect(parseSettings(null).print_mode).toBe("browser");
  });

  it("bridge giữ nguyên; giá trị lạ → browser", () => {
    expect(parseSettings({ print_mode: "bridge" }).print_mode).toBe("bridge");
    expect(parseSettings({ print_mode: "BRIDGE" }).print_mode).toBe("browser");
    expect(parseSettings({ print_mode: 1 }).print_mode).toBe("browser");
  });

  it("serialize giữ print_mode", () => {
    expect(serializeSettings({ print_mode: "bridge" }).print_mode).toBe("bridge");
  });
});

describe("getPrintAdapter(mode)", () => {
  it("mỗi chế độ một adapter, hai chế độ trong cùng tiến trình không lẫn nhau", async () => {
    const { getPrintAdapter } = await import("@/lib/print/adapter");
    const bridge = getPrintAdapter("bridge");
    const browser = getPrintAdapter("browser");
    expect(bridge).not.toBe(browser);
    expect(bridge.constructor.name).toBe("BridgePrintAdapter");
    expect(browser.constructor.name).toBe("BrowserPrintAdapter");
    // Gọi lại trả đúng adapter cũ của chế độ đó.
    expect(getPrintAdapter("bridge")).toBe(bridge);
    expect(getPrintAdapter("browser")).toBe(browser);
  });
});

describe("không còn công tắc build-time", () => {
  function tepNguon(thuMuc: string): string[] {
    return fs.readdirSync(thuMuc, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(thuMuc, e.name);
      if (e.isDirectory()) return tepNguon(p);
      return /\.(ts|tsx)$/.test(e.name) ? [p] : [];
    });
  }

  it("NEXT_PUBLIC_PRINT_MODE không còn trong lib/ components/ app/", () => {
    const goc = path.join(__dirname, "../..");
    const dinh = ["lib", "components", "app"]
      .flatMap((d) => tepNguon(path.join(goc, d)))
      .filter((f) => fs.readFileSync(f, "utf8").includes("NEXT_PUBLIC_PRINT_MODE"))
      .map((f) => path.relative(goc, f));
    expect(dinh).toEqual([]);
  });

  it("không component nào gọi getPrintAdapter() thiếu chế độ", () => {
    const goc = path.join(__dirname, "../..");
    const sai = ["components", "app"]
      .flatMap((d) => tepNguon(path.join(goc, d)))
      .filter((f) => /getPrintAdapter\(\s*\)/.test(fs.readFileSync(f, "utf8")))
      .map((f) => path.relative(goc, f));
    expect(sai).toEqual([]);
  });
});
