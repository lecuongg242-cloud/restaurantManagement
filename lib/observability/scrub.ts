/**
 * Lọc sự kiện lỗi trước khi gửi ra Sentry (OPS-10) — dùng làm `beforeSend`/`beforeSendTransaction`.
 *
 * Cùng nguyên tắc với `log.ts`: bề mặt khách mang `?t=<qr_token>` (khóa mở bàn) trong URL, body
 * request mang tên/SĐT/địa chỉ khách hay mật khẩu cầu in. Gửi chúng ra dịch vụ ngoài là rải khóa và
 * PII ra nơi ta không kiểm soát. Không lỗi nào đáng để đánh đổi việc đó.
 *
 * Kiểu dữ liệu tự khai (tập con của Sentry `Event`) để hàm thuần, test được không cần SDK.
 */
type Headers = Record<string, string | undefined>;

export type ScrubbableEvent = {
  message?: string;
  request?: {
    url?: string;
    query_string?: unknown;
    data?: unknown;
    cookies?: unknown;
    headers?: Headers;
  };
  breadcrumbs?: { category?: string; message?: string; data?: Record<string, unknown> }[];
  tags?: Record<string, string | undefined>;
  [key: string]: unknown;
};

const HEADER_NHAY_CAM = ["authorization", "cookie", "set-cookie", "x-supabase-auth"];
const TRUONG_URL_BREADCRUMB = ["url", "from", "to"];

function catQuery(s: string): string {
  const i = s.search(/[?#]/);
  return i === -1 ? s : s.slice(0, i);
}

/** `/r/pho-viet/menu` hoặc `https://…/r/pho-viet/…` → `pho-viet`. */
function slugTuUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const m = /\/r\/([^/?#]+)/.exec(url);
  return m?.[1];
}

export function scrubEvent<T extends ScrubbableEvent>(event: T): T {
  const out: T = { ...event };

  if (event.request) {
    const req = { ...event.request };
    delete req.query_string;
    delete req.data;
    delete req.cookies;
    if (req.url) req.url = catQuery(req.url);
    if (req.headers) {
      const h: Headers = {};
      for (const [k, v] of Object.entries(req.headers)) {
        if (!HEADER_NHAY_CAM.includes(k.toLowerCase())) h[k] = v;
      }
      req.headers = h;
    }
    out.request = req;

    const slug = slugTuUrl(req.url);
    if (slug) out.tags = { ...event.tags, tenant_slug: slug };
  }

  if (event.breadcrumbs) {
    out.breadcrumbs = event.breadcrumbs.map((b) => {
      if (!b.data) return b;
      const data = { ...b.data };
      for (const k of TRUONG_URL_BREADCRUMB) {
        if (typeof data[k] === "string") data[k] = catQuery(data[k] as string);
      }
      return { ...b, data };
    });
  }

  return out;
}
