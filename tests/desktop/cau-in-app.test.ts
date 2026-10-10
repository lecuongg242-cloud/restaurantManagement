import { describe, it, expect, afterEach } from "vitest";
import { spawn, type ChildProcess, type StdioOptions } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { mayChuGia, mayInGia, doiDen, cho } from "./gia-lap";

/**
 * DESK-05 — cầu in (scripts/print-bridge.mjs) khi chạy TRONG APP: báo nguồn `p_agent`, không tự thay tệp, báo tình
 * trạng qua IPC, thoát ở điểm an toàn khi app xin; máy chủ cũ (chưa migration 0075) vẫn nhận nhịp tim. Cầu in cũ
 * (không đặt BRIDGE_AGENT) gửi nhịp tim y như bản 4. Chạy với Supabase giả — không cần DB.
 *
 * `BRIDGE_NODE` (tùy chọn) = electron.exe: chạy cầu in bằng Node của Electron như trong app thật.
 */
const NODE = process.env.BRIDGE_NODE || process.execPath;
let con: ChildProcess | null = null;
let donDep: (() => Promise<void>)[] = [];

afterEach(async () => {
  if (con && con.exitCode === null) {
    const p = con;
    const daThoat = new Promise((r) => p.once("exit", r));
    p.kill();
    await daThoat; // Windows giữ thư mục đang là cwd của tiến trình — chờ thoát hẳn rồi mới xóa
  }
  con = null;
  for (const d of donDep) await d();
  donDep = [];
});

function tmpCauIn() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cau-in-app-"));
  fs.copyFileSync("scripts/print-bridge.mjs", path.join(tmp, "print-bridge.mjs"));
  donDep.push(async () => fs.rmSync(tmp, { recursive: true, force: true }));
  return path.join(tmp, "print-bridge.mjs");
}

function chayCauIn(env: Record<string, string>, thamSo: string[] = [], ipc = true) {
  const tep = tmpCauIn();
  let log = "";
  const tinNhan: unknown[] = [];
  const stdio: StdioOptions = ipc ? ["ignore", "pipe", "pipe", "ipc"] : ["ignore", "pipe", "pipe"];
  const p: ChildProcess = spawn(NODE, [tep, ...thamSo], {
    cwd: path.dirname(tep),
    env: {
      PATH: process.env.PATH ?? "",
      SystemRoot: process.env.SystemRoot ?? "",
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      POLL_MS: "300",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
      PRINT_BRIDGE_EMAIL: "print-x@bridge.local",
      PRINT_BRIDGE_PASSWORD: "mk",
      ...env,
    } as NodeJS.ProcessEnv,
    stdio,
  });
  p.stdout?.on("data", (d: Buffer) => (log += d));
  p.stderr?.on("data", (d: Buffer) => (log += d));
  p.on("message", (m: unknown) => tinNhan.push(m));
  con = p;
  return { p, log: () => log, tinNhan };
}

const thoat = (p: ChildProcess) => new Promise<number | null>((r) => (p.exitCode !== null ? r(p.exitCode) : p.once("exit", (c) => r(c))));

describe("cầu in chạy trong app", () => {
  it("báo p_agent, không gọi /api/bridge/latest, báo tình trạng qua IPC, thoát mã 0 khi app xin", async () => {
    const may = await mayChuGia();
    const mayIn = await mayInGia();
    donDep.push(may.dong, mayIn.dong);
    const { p, tinNhan, log } = chayCauIn({
      NEXT_PUBLIC_SUPABASE_URL: may.url,
      PRINTER_HOST: "127.0.0.1",
      PRINTER_PORT: String(mayIn.port),
      POS_URL: `${may.url}/r/quan-thu/pos`,
      BRIDGE_AGENT: "app/1.0.0",
      BRIDGE_TU_CAP_NHAT: "0",
    });
    await doiDen(() => may.nhipTim.length > 0 && tinNhan.length > 0, 30_000, `nhịp tim + IPC\n${log()}`);
    expect(may.nhipTim[0]).toMatchObject({ p_agent: "app/1.0.0", p_version: expect.any(Number), p_printer_ok: true });
    expect(tinNhan[0]).toMatchObject({ loai: "trang-thai", nhipOk: true, bep: true });
    await doiDen(() => /poll mỗi/.test(log()), 10_000, "vào vòng poll");
    await cho(500);
    expect(may.goi.some((g) => g.includes("/api/bridge/latest"))).toBe(false);

    const t0 = Date.now();
    p.send("thoat");
    expect(await thoat(p)).toBe(0);
    expect(Date.now() - t0).toBeLessThan(3_000); // đánh thức vòng poll, không chờ hết nhịp nghỉ
  }, 60_000);

  it("máy chủ cũ không nhận p_agent → gửi lại không có p_agent, và thôi gửi luôn", async () => {
    const may = await mayChuGia({ serverCu: true });
    donDep.push(may.dong);
    chayCauIn({
      NEXT_PUBLIC_SUPABASE_URL: may.url,
      PRINTER_HOST: "127.0.0.1",
      PRINTER_PORT: "9",
      BRIDGE_AGENT: "app/1.0.0",
      BRIDGE_TU_CAP_NHAT: "0",
    });
    await doiDen(() => may.nhipTim.length > 0, 30_000, "nhịp tim sau khi bỏ p_agent");
    expect(may.nhipTim.every((b) => !("p_agent" in b))).toBe(true);
  }, 60_000);

  it("cầu in cũ (không BRIDGE_AGENT) → thân nhịp tim y như bản 4", async () => {
    const may = await mayChuGia();
    const mayIn = await mayInGia();
    donDep.push(may.dong, mayIn.dong);
    chayCauIn(
      { NEXT_PUBLIC_SUPABASE_URL: may.url, PRINTER_HOST: "127.0.0.1", PRINTER_PORT: String(mayIn.port) },
      [],
      false
    );
    await doiDen(() => may.nhipTim.length > 0, 30_000, "nhịp tim");
    expect(Object.keys(may.nhipTim[0]).sort()).toEqual(["p_printer_host", "p_printer_ok", "p_version"]);
  }, 60_000);

  it("app chết (mất kênh IPC) → cầu in tự thoát, không chạy mồ côi", async () => {
    const may = await mayChuGia();
    donDep.push(may.dong);
    const { p, log } = chayCauIn({ NEXT_PUBLIC_SUPABASE_URL: may.url, PRINTER_HOST: "127.0.0.1", PRINTER_PORT: "9", BRIDGE_TU_CAP_NHAT: "0" });
    await doiDen(() => /poll mỗi/.test(log()), 30_000, "vào vòng poll");
    p.disconnect();
    expect(await thoat(p)).toBe(0);
  }, 60_000);

  it("in thử máy in quầy LAN (--test --vai=quay) → máy in nhận giấy, mã 0", async () => {
    const mayIn = await mayInGia();
    donDep.push(mayIn.dong);
    const { p } = chayCauIn({ COUNTER_PRINTER: `lan:127.0.0.1:${mayIn.port}` }, ["--test", "--vai=quay"], false);
    expect(await thoat(p)).toBe(0);
    await doiDen(() => mayIn.nhan.length === 1, 5_000, "máy in quầy nhận giấy");
    expect(mayIn.nhan[0].length).toBeGreaterThan(50);
  }, 30_000);

  it("PRINT-18: không có máy in bếp riêng → phiếu bếp ra máy in quầy, nhịp tim báo máy bếp theo máy quầy", async () => {
    const may = await mayChuGia({
      phieu: [{ id: "job-1", type: "kitchen_ticket", payload: { kitchenNo: 7, ticketNo: "A1", items: [{ qty: 1, name: "Pho bo" }] } }],
    });
    const mayIn = await mayInGia();
    donDep.push(may.dong, mayIn.dong);
    const { log } = chayCauIn(
      {
        NEXT_PUBLIC_SUPABASE_URL: may.url,
        // Như app khi chọn "Không có": máy bếp trỏ địa chỉ không ai nghe — phải KHÔNG được dùng tới.
        PRINTER_HOST: "127.0.0.1",
        PRINTER_PORT: "9",
        COUNTER_PRINTER: `lan:127.0.0.1:${mayIn.port}`,
        KITCHEN_PRINTER: "counter",
        BRIDGE_TU_CAP_NHAT: "0",
      },
      [],
      false
    );
    await doiDen(() => may.danhDau.length > 0, 30_000, `đánh dấu phiếu\n${log()}`);
    expect(may.danhDau[0]).toMatchObject({ id: "job-1", status: "printed" });
    expect(mayIn.nhan).toHaveLength(1);
    expect(mayIn.nhan[0].toString("latin1")).toContain("Pho bo");

    const nhip = may.nhipTim[may.nhipTim.length - 1];
    expect(nhip).toMatchObject({ p_printer_ok: true, p_counter_ok: true, p_printer_host: `máy in quầy lan:127.0.0.1:${mayIn.port}` });
  }, 60_000);

  it("in thử máy in quầy chưa khai → mã 1, câu lỗi rõ", async () => {
    const { p, log } = chayCauIn({ COUNTER_PRINTER: "" }, ["--test", "--vai=quay"], false);
    expect(await thoat(p)).toBe(1);
    expect(log()).toMatch(/Chưa khai máy in quầy/);
  }, 30_000);
});
