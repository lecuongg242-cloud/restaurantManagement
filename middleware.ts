import { NextResponse, type NextRequest } from "next/server";

/**
 * Nhận diện tenant (multi-tenant). V1: theo slug ở path `/r/[slug]/...`.
 * Nhánh subdomain viết SẴN nhưng TẮT (ENABLE_SUBDOMAIN=false) — bật ở V2 mà không sửa component.
 * Plan 01-01: chưa tra DB (chưa có bảng) — chỉ chuyển slug xuống layout qua header x-tenant-slug.
 */

const ENABLE_SUBDOMAIN = false;
const ROOT_DOMAIN = "example.com"; // V2: đổi sang domain thật

function tenantFromSubdomain(host: string): string | null {
  const hostname = host.split(":")[0];
  if (!hostname.endsWith(`.${ROOT_DOMAIN}`)) return null;
  const sub = hostname.slice(0, -1 * (ROOT_DOMAIN.length + 1));
  if (!sub || sub === "www") return null;
  return sub;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  let slug: string | null = null;

  // Nhánh path: /r/[slug]/...
  if (pathname.startsWith("/r/")) {
    slug = pathname.split("/")[2] || null;
  }

  // Nhánh subdomain (TẮT ở V1)
  if (ENABLE_SUBDOMAIN && !slug) {
    slug = tenantFromSubdomain(request.headers.get("host") ?? "");
  }

  const requestHeaders = new Headers(request.headers);
  if (slug) {
    requestHeaders.set("x-tenant-slug", slug);
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/r/:path*"],
};
