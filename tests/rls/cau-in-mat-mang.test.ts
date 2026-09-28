import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { OWNER_A } from "./setup";
import { adminClient } from "./fixtures";
import { bridgeEmailForSlug, provisionPrintBridgeAccount } from "@/lib/print/bridge-account";

/**
 * P17 17-02 — GIẢ LẬP "rút router giữa lúc gửi phiếu" với CẦU IN THẬT (scripts/print-bridge.mjs, chạy như ở quán):
 *
 *   cầu in ──HTTP──▶ proxy cục bộ (công tắc mạng) ──HTTPS──▶ Supabase
 *   cầu in ──TCP───▶ máy in giả (đếm từng tờ)
 *
 * Tắt công tắc = quán mất Internet nhưng cầu in vẫn sống, máy in LAN vẫn nối (đúng cảnh thật). Điện thoại 5G vẫn xếp
 * phiếu lên server (ở đây: ghi thẳng print_jobs bằng service role — đường xếp phiếu từ điện thoại đã có E2E riêng).
 * Kiểm: không mất phiếu, không in trùng, phiếu > 30 phút không in bù, mạng rớt NGAY SAU khi máy in ra giấy (trước khi
 * kịp đánh dấu "đã in") → khi có mạng lại KHÔNG in lần hai.
 *
 * Chỉ đụng quán demo pho-viet: tài khoản cầu in tạm (xóa ở afterAll), phiếu thử mang dấu TAG (xóa ở afterAll).
 * Cầu in chạy từ bản chép trong thư mục tạm, KHÔNG có POS_URL ⇒ không tự cập nhật / ghi đè tệp trong repo.
 */
const TAG = crypto.randomUUID().slice(0, 6);
const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL!;
let tenantId = "";
let bridge: ChildProcess | null = null;
let bridgeLog = "";
let proxy: http.Server;
let proxyPort = 0;
let printer: net.Server;
let printerPort = 0;
let mang = true;
/** Mỗi tờ máy in giả nhận: số đơn in trên phiếu. */
const toIn: number[] = [];
/** Gọi khi máy in nhận xong một tờ — để cắt mạng đúng khoảnh khắc đó. */
let khiIn: ((so: number) => void) | null = null;
let tmp = "";

const cho = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function doiDen(dk: () => boolean | Promise<boolean>, ms: number, nhan: string) {
  const het = Date.now() + ms;
  while (Date.now() < het) {
    if (await dk()) return;
    await cho(300);
  }
  throw new Error(`Quá ${ms}ms chờ: ${nhan}\n--- log cầu in ---\n${bridgeLog.slice(-3000)}`);
}

async function xepPhieu(soDon: number, phutTruoc = 0) {
  const { error } = await adminClient().from("print_jobs").insert({
    tenant_id: tenantId,
    type: "kitchen_ticket",
    target_station: "kitchen",
    status: "pending",
    created_at: new Date(Date.now() - phutTruoc * 60_000).toISOString(),
    payload: { orderId: crypto.randomUUID(), kitchenNo: soDon, tenantName: `SIM ${TAG}`, tableName: "SIM", items: [{ name: "Pho thu", qty: 1 }] },
  });
  if (error) throw error;
}
const trangThai = async () =>
  ((await adminClient().from("print_jobs").select("status, payload").eq("tenant_id", tenantId).eq("payload->>tenantName", `SIM ${TAG}`)).data ?? []) as {
    status: string;
    payload: { kitchenNo: number };
  }[];

beforeAll(async () => {
  const admin = adminClient();
  const { data: t } = await admin.from("tenants").select("id, name").eq("slug", OWNER_A.slug).single();
  tenantId = t!.id;
  const tk = await provisionPrintBridgeAccount(admin, { tenantId, slug: OWNER_A.slug, name: t!.name });

  // Máy in giả: mỗi kết nối TCP = một tờ; đọc "#<số đơn>" (cỡ chữ lớn) trong byte ESC/POS.
  printer = net.createServer((s) => {
    const parts: Buffer[] = [];
    s.on("data", (d) => parts.push(d));
    s.on("end", () => {
      const txt = Buffer.concat(parts).toString("latin1");
      const m = /#(\d+)/.exec(txt);
      const so = m ? Number(m[1]) : -1;
      toIn.push(so);
      khiIn?.(so);
    });
  });
  await new Promise<void>((r) => printer.listen(0, "127.0.0.1", () => r()));
  printerPort = (printer.address() as net.AddressInfo).port;

  // Proxy có công tắc mạng.
  proxy = http.createServer(async (req, res) => {
    if (!mang) return req.socket.destroy();
    const body: Buffer[] = [];
    for await (const c of req) body.push(c as Buffer);
    if (!mang) return req.socket.destroy();
    try {
      const headers = { ...req.headers } as Record<string, string>;
      delete headers.host;
      delete headers["accept-encoding"];
      delete headers["content-length"];
      const r = await fetch(`${SUPA}${req.url}`, {
        method: req.method,
        headers,
        body: ["GET", "HEAD"].includes(req.method ?? "GET") ? undefined : Buffer.concat(body),
      });
      const buf = Buffer.from(await r.arrayBuffer());
      if (!mang) return req.socket.destroy(); // mạng rớt trong lúc chờ trả lời
      const h: Record<string, string> = {};
      r.headers.forEach((v, k) => {
        if (!["content-encoding", "content-length", "transfer-encoding", "connection"].includes(k)) h[k] = v;
      });
      res.writeHead(r.status, h);
      res.end(buf);
    } catch {
      req.socket.destroy();
    }
  });
  await new Promise<void>((r) => proxy.listen(0, "127.0.0.1", () => r()));
  proxyPort = (proxy.address() as net.AddressInfo).port;

  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cau-in-sim-"));
  fs.copyFileSync("scripts/print-bridge.mjs", path.join(tmp, "print-bridge.mjs"));
  bridge = spawn(process.execPath, [path.join(tmp, "print-bridge.mjs")], {
    cwd: tmp,
    env: {
      NODE_ENV: "production",
      PATH: process.env.PATH ?? "",
      SystemRoot: process.env.SystemRoot ?? "",
      NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${proxyPort}`,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      PRINT_BRIDGE_EMAIL: tk.email,
      PRINT_BRIDGE_PASSWORD: tk.password,
      PRINTER_HOST: "127.0.0.1",
      PRINTER_PORT: String(printerPort),
      POLL_MS: "500",
      PRINT_RETRY: "0",
    },
  });
  bridge.stdout?.on("data", (d) => (bridgeLog += d));
  bridge.stderr?.on("data", (d) => (bridgeLog += d));
  await doiDen(() => /poll mỗi/.test(bridgeLog), 30_000, "cầu in khởi động");
}, 120_000);

afterAll(async () => {
  bridge?.kill();
  await cho(500);
  const admin = adminClient();
  await admin.from("print_jobs").delete().eq("tenant_id", tenantId).eq("payload->>tenantName", `SIM ${TAG}`);
  await admin.from("printer_heartbeats").delete().eq("tenant_id", tenantId);
  const email = bridgeEmailForSlug(OWNER_A.slug);
  await admin.from("memberships").delete().eq("email", email);
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const u = data?.users.find((x) => (x.email ?? "").toLowerCase() === email);
  if (u) await admin.auth.admin.deleteUser(u.id);
  proxy?.close();
  printer?.close();
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
}, 60_000);

describe("cầu in thật qua mạng giả (P17)", () => {
  it("có mạng: một phiếu ra đúng một tờ", async () => {
    await xepPhieu(801);
    await doiDen(() => toIn.includes(801), 30_000, "in phiếu 801");
    await doiDen(async () => (await trangThai()).find((j) => j.payload.kitchenNo === 801)?.status === "printed", 15_000, "801 printed");
    expect(toIn.filter((x) => x === 801)).toHaveLength(1);
  }, 60_000);

  it("mất mạng → xếp 5 phiếu + 1 phiếu 40 phút trước → có mạng lại: ra đủ 5, không trùng, phiếu cũ không in bù", async () => {
    mang = false;
    await cho(2000);
    for (const so of [811, 812, 813, 814, 815]) await xepPhieu(so);
    await xepPhieu(819, 40);
    await cho(6000);
    expect(toIn.filter((x) => x >= 811 && x <= 819), "mất mạng mà vẫn in được?").toHaveLength(0);

    mang = true;
    await doiDen(() => [811, 812, 813, 814, 815].every((s) => toIn.includes(s)), 60_000, "in bù 5 phiếu");
    await cho(5000); // thêm vài lượt poll: không được ra tờ thứ hai
    for (const s of [811, 812, 813, 814, 815]) expect(toIn.filter((x) => x === s), `phiếu ${s}`).toHaveLength(1);
    expect(toIn).not.toContain(819);
    const j = await trangThai();
    expect(j.filter((x) => x.payload.kitchenNo >= 811 && x.payload.kitchenNo <= 815).every((x) => x.status === "printed")).toBe(true);
    expect(j.find((x) => x.payload.kitchenNo === 819)?.status).toBe("pending");
  }, 120_000);

  it("mạng rớt NGAY SAU khi máy in ra giấy (chưa kịp đánh dấu) → có mạng lại KHÔNG in lần hai, phiếu thành printed", async () => {
    khiIn = (so) => {
      if (so === 821) mang = false;
    };
    await xepPhieu(821);
    await doiDen(() => toIn.includes(821), 30_000, "in phiếu 821");
    await cho(6000); // cầu in thử đánh dấu trong lúc mất mạng, vài lượt poll
    khiIn = null;
    mang = true;
    await doiDen(async () => (await trangThai()).find((j) => j.payload.kitchenNo === 821)?.status === "printed", 45_000, "821 printed sau khi có mạng");
    await cho(4000);
    expect(toIn.filter((x) => x === 821), "phiếu 821 bị in hai lần").toHaveLength(1);
  }, 120_000);
});
