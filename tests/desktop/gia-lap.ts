import http from "node:http";
import net from "node:net";

/**
 * Giả lập cho test app "TechMenu Thu ngân" (P21) — KHÔNG cần database thật:
 *  - `mayChuGia`: Supabase tối thiểu cho cầu in (đăng nhập, tra quán, nhịp tim, hàng đợi rỗng) + các trang/API của
 *    app web mà vỏ Electron chạm tới (/r/<slug>/pos, /kds, /api/desktop/activate).
 *  - `mayInGia`: máy in LAN (cổng TCP) ghi lại số byte nhận được.
 */

export type NhipTim = Record<string, unknown>;

export async function mayChuGia(opts: { serverCu?: boolean; cong?: number } = {}) {
  const nhipTim: NhipTim[] = [];
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
    if (url.pathname.startsWith("/rest/v1/")) return req.method === "GET" ? json(200, []) : (res.writeHead(204), res.end());

    const trang = url.pathname.match(/^\/r\/([a-z0-9-]+)\/(pos|kds)$/);
    if (trang) {
      return html(`<!doctype html><title>${trang[2]} ${trang[1]}</title><h1 id="man">${trang[2]}:${trang[1]}</h1>
<a id="ngoai" href="https://example.com/">ngoai</a>
<script>window.__kq = { req: typeof require, proc: typeof process, td: window.techmenuDesktop || null,
  tm: typeof window.techmenu };</script>`);
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
  return { url: `http://127.0.0.1:${port}`, nhipTim, goi, kichHoat, dong: () => new Promise<void>((r) => srv.close(() => r())) };
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
