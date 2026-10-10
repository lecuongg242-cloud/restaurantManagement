import http from "node:http";
import net from "node:net";

/**
 * Giả lập cho test app "TechMenu Thu ngân" (P21) — KHÔNG cần database thật:
 *  - `mayChuGia`: Supabase tối thiểu cho cầu in (đăng nhập, tra quán, nhịp tim, hàng đợi — rỗng, hoặc `phieu` chờ in tới khi
 *    cầu in đánh dấu) + các trang/API của
 *    app web mà vỏ Electron chạm tới (/r/<slug>/pos, /kds, /api/desktop/activate).
 *  - `mayInGia`: máy in LAN (cổng TCP) ghi lại số byte nhận được.
 */

export type NhipTim = Record<string, unknown>;

export async function mayChuGia(
  opts: { serverCu?: boolean; cong?: number; phieu?: Record<string, unknown>[]; noi?: Record<string, unknown>[] } = {}
) {
  const nhipTim: NhipTim[] = [];
  const choIn = [...(opts.phieu ?? [])];
  const danhDau: Record<string, unknown>[] = [];
  const goi: string[] = [];
  const kichHoat: Record<string, unknown>[] = [];
  const srv = http.createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = Buffer.concat(chunks).toString("utf8");
    const url = new URL(req.url ?? "/", "http://x");
    goi.push(`${req.method} ${url.pathname}`);
    const json = (code: number, v: unknown) => {
      res.writeHead(code, { "content-type": "application/json" });
      res.end(JSON.stringify(v));
    };
    const html = (v: string) => {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(v);
    };

    if (url.pathname === "/auth/v1/token") return json(200, { access_token: "tok", expires_in: 3600, token_type: "bearer" });
    if (url.pathname === "/rest/v1/rpc/printer_heartbeat") {
      const b = JSON.parse(body || "{}");
      if (opts.serverCu && "p_agent" in b) {
        return json(404, { code: "PGRST202", message: "Could not find the function public.printer_heartbeat(p_agent, …)" });
      }
      nhipTim.push(b);
      return json(200, new Date().toISOString());
    }
    if (url.pathname.startsWith("/rest/v1/memberships")) return json(200, [{ tenant_id: "00000000-0000-0000-0000-000000000001" }]);
    if (url.pathname === "/rest/v1/print_jobs" && req.method === "GET") return json(200, choIn);
    // P37: bếp/bar của quán (màn Cài đặt máy in đọc bằng tài khoản printer).
    if (url.pathname === "/rest/v1/kitchen_stations" && req.method === "GET") {
      if (req.headers.authorization !== "Bearer tok") return json(401, { message: "JWT" });
      return json(200, opts.noi ?? []);
    }
    if (url.pathname === "/rest/v1/print_jobs" && req.method === "PATCH") {
      const id = (url.searchParams.get("id") ?? "").replace(/^eq\./, "");
      danhDau.push({ id, ...JSON.parse(body || "{}") });
      choIn.splice(0, choIn.length, ...choIn.filter((j) => j.id !== id));
      res.writeHead(204);
      return res.end();
    }
    if (url.pathname.startsWith("/rest/v1/")) return req.method === "GET" ? json(200, []) : (res.writeHead(204), res.end());

    // Phiên đăng nhập giả bằng cookie `phien` (owner / cashier) — để kiểm cửa sổ Quản trị có phiên RIÊNG với POS (P30).
    const phien = /(?:^|;\s*)phien=(\w+)/.exec(req.headers.cookie ?? "")?.[1] ?? "";
    const chuyen = (dich: string, cookie?: string) => {
      res.writeHead(302, { location: dich, ...(cookie ? { "set-cookie": `phien=${cookie}; Path=/` } : {}) });
      res.end();
    };
    if (url.pathname === "/dang-nhap-thu") return chuyen(`/r/quan-thu/pos`, url.searchParams.get("vai") ?? "cashier");

    const trang = url.pathname.match(/^\/r\/([a-z0-9-]+)\/(pos|kds)$/);
    if (trang) {
      return html(`<!doctype html><title>${trang[2]} ${trang[1]}</title><h1 id="man">${trang[2]}:${trang[1]}</h1>
<p id="phien">${phien}</p>
<a id="ngoai" href="https://example.com/">ngoai</a>
<script>window.__kq = { req: typeof require, proc: typeof process, td: window.techmenuDesktop || null,
  tm: typeof window.techmenu };</script>`);
    }
    const qt = url.pathname.match(/^\/r\/([a-z0-9-]+)\/(admin\/login|admin|admin\/reports\/export|print\/qr)$/);
    if (qt) {
      const [, slug, phan] = qt;
      if (phan === "admin/login" && req.method === "POST") {
        // Như ownerSignIn với cờ chiQuanTri: chủ → vào admin; nhân viên → báo không có quyền, không sang POS.
        const email = new URLSearchParams(body).get("email");
        if (email === "chu@quan.vn") return chuyen(`/r/${slug}/admin`, "owner");
        return html(`<!doctype html><p role="alert">Tài khoản này không có quyền quản trị.</p>`);
      }
      if (phan === "admin/login") {
        if (phien === "owner") return chuyen(`/r/${slug}/admin`);
        return html(`<!doctype html><title>Đăng nhập quản trị</title><h1>Đăng nhập quản trị</h1>
<form method="post" action="/r/${slug}/admin/login"><input id="email" name="email"><button id="dn">Đăng nhập</button></form>`);
      }
      if (phien !== "owner") return chuyen(`/r/${slug}/admin/login`);
      if (phan === "admin/reports/export") {
        res.writeHead(200, { "content-type": "application/octet-stream", "content-disposition": 'attachment; filename="bao-cao.xlsx"' });
        return res.end("XLSX");
      }
      if (phan === "print/qr") return html(`<!doctype html><h1 id="man">qr:${phien}</h1>`);
      return html(`<!doctype html><title>Tổng quan</title><h1 id="man">admin:${slug}</h1>
<a id="xuat" href="/r/${slug}/admin/reports/export">Xuất Excel</a>
<a id="qr" href="/r/${slug}/print/qr" target="_blank">In mã QR</a>
<script>window.__kq = { req: typeof require, proc: typeof process, tm: typeof window.techmenu };</script>`);
    }
    if (url.pathname === "/api/desktop/activate") {
      const b = JSON.parse(body || "{}");
      kichHoat.push(b);
      if (b.password !== "dung-mat-khau") return json(400, { error: "Email hoặc mật khẩu không đúng." });
      if (b.email === "chuoi@quan.vn" && !b.tenantId) {
        return json(200, { chonChiNhanh: [{ id: "11111111-1111-1111-1111-111111111111", name: "Chi nhánh 1" }, { id: "22222222-2222-2222-2222-222222222222", name: "Chi nhánh 2" }] });
      }
      const slug = b.tenantId === "22222222-2222-2222-2222-222222222222" ? "chi-nhanh-2" : "quan-thu";
      const goc = `http://127.0.0.1:${(srv.address() as net.AddressInfo).port}`;
      return json(200, {
        slug,
        tenantName: "Quán Thử",
        appUrl: `${goc}/r/${slug}/pos`,
        ...(b.coMayIn ? { email: `print-${slug}@bridge.local`, password: "mk-printer", supabaseUrl: goc, anonKey: "anon" } : {}),
      });
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise<void>((r) => srv.listen(opts.cong ?? 0, "127.0.0.1", () => r()));
  const port = (srv.address() as net.AddressInfo).port;
  return { url: `http://127.0.0.1:${port}`, nhipTim, goi, kichHoat, danhDau, dong: () => new Promise<void>((r) => srv.close(() => r())) };
}

export async function mayInGia() {
  const nhan: Buffer[] = [];
  const srv = net.createServer((s) => {
    const phan: Buffer[] = [];
    s.on("data", (d) => phan.push(d));
    s.on("end", () => {
      if (phan.length) nhan.push(Buffer.concat(phan));
    });
    s.on("error", () => {});
  });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", () => r()));
  return { port: (srv.address() as net.AddressInfo).port, nhan, dong: () => new Promise<void>((r) => srv.close(() => r())) };
}

export const cho = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function doiDen(dk: () => boolean | Promise<boolean>, ms: number, ten: string) {
  const han = Date.now() + ms;
  while (Date.now() < han) {
    if (await dk()) return;
    await cho(200);
  }
  throw new Error(`Hết giờ chờ: ${ten}`);
}
