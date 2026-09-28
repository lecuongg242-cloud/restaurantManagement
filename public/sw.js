// Service worker POS (P17 17-01, OFFLINE-01 / OPS-04, QD-024 D4).
//
// Mục đích DUY NHẤT: máy quầy mất mạng mà tải lại trang POS thì KHÔNG trắng màn — hiện trang xem offline
// (`/r/{slug}/pos/offline`, đọc bản chụp trong IndexedDB). Không làm gì khác:
//  - KHÔNG cache phản hồi API / server action / RSC: mọi ghi đi thẳng mạng, mất mạng là lỗi như trước.
//  - KHÔNG phục vụ HTML cũ khi đang có mạng (mạng trước): không có chuyện kẹt bản cũ sau khi deploy.
//  - Tài nguyên tĩnh `/_next/static` (tên có mã băm) cũng mạng trước, chỉ rơi về kho khi mất mạng.
//
// Phiên bản kho theo bản build (`?v=` lúc đăng ký): bản mới cài xong thì xóa kho cũ.
const BAN = new URL(self.location.href).searchParams.get("v") || "0";
const KHO = `pos-offline-${BAN}`;
const TRANG_OFFLINE = /^\/r\/[^/]+\/pos\/offline$/;
const TRANG_POS = /^\/r\/([^/]+)\/pos(\/|$)/;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      for (const k of await caches.keys()) {
        if (k.startsWith("pos-offline-") && k !== KHO) await caches.delete(k);
      }
      await self.clients.claim();
    })()
  );
});

/** Nạp trước trang offline của một quán + mọi tệp tĩnh nó cần (lấy từ chính HTML). */
async function napTruoc(url) {
  const res = await fetch(url, { credentials: "same-origin", cache: "no-store" });
  if (!res.ok || res.redirected) return;
  const html = await res.clone().text();
  const kho = await caches.open(KHO);
  await kho.put(url, res);
  const tep = [...new Set(html.match(/\/_next\/static\/[^"'\s)\\]+/g) || [])];
  await Promise.all(
    tep.map(async (u) => {
      try {
        if (await kho.match(u)) return;
        const r = await fetch(u);
        if (r.ok) await kho.put(u, r);
      } catch {
        /* thiếu một tệp thì trang offline có thể thiếu kiểu chữ — không chặn phần còn lại */
      }
    })
  );
}

self.addEventListener("message", (e) => {
  const d = e.data;
  if (d && d.type === "nap-truoc" && typeof d.url === "string" && TRANG_OFFLINE.test(d.url)) {
    e.waitUntil(napTruoc(d.url).catch(() => {}));
  }
});

const TRANG_KHONG_CO = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mất mạng</title><body style="font-family:system-ui;padding:24px;background:#fffaeb;color:#1f1f1f">
<h1 style="font-size:20px;color:#b42318">Mất mạng</h1>
<p>Máy này chưa lưu dữ liệu để xem khi mất mạng. Dùng điện thoại (4G/5G) để gọi món và thu tiền.</p>
<p>Có mạng lại thì tải lại trang.</p></body>`;

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    const m = url.pathname.match(TRANG_POS);
    if (!m || TRANG_OFFLINE.test(url.pathname)) {
      if (TRANG_OFFLINE.test(url.pathname)) {
        e.respondWith(fetch(req).catch(async () => (await caches.match(url.pathname)) || new Response(TRANG_KHONG_CO, { headers: { "content-type": "text/html; charset=utf-8" } })));
      }
      return;
    }
    // Chuyển hẳn sang ĐỊA CHỈ trang offline (không trả HTML của nó dưới địa chỉ /pos): bộ định tuyến Next
    // hydrate đúng cây trang, và thanh địa chỉ nói thật máy đang ở màn nào.
    e.respondWith(fetch(req).catch(() => Response.redirect(`/r/${m[1]}/pos/offline`, 302)));
    return;
  }

  if (url.pathname.startsWith("/_next/static/")) {
    e.respondWith(fetch(req).catch(async () => (await caches.match(req)) || Response.error()));
  }
});
