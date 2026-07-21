import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Middleware:
 *  1) Làm mới phiên Supabase (bắt buộc cho App Router — @supabase/ssr) để Server
 *     Component đọc được user hiện tại; RBAC chi tiết do layout/guard xử lý.
 *  2) Nhận diện tenant theo slug ở path `/r/[slug]/...` → header x-tenant-slug.
 *     Nhánh subdomain viết SẴN nhưng TẮT (ENABLE_SUBDOMAIN=false) — bật ở V2.
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

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // --- slug tenant ---
  let slug: string | null = null;
  if (pathname.startsWith("/r/")) {
    slug = pathname.split("/")[2] || null;
  }
  if (ENABLE_SUBDOMAIN && !slug) {
    slug = tenantFromSubdomain(request.headers.get("host") ?? "");
  }

  const requestHeaders = new Headers(request.headers);
  if (slug) requestHeaders.set("x-tenant-slug", slug);

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  // --- làm mới phiên Supabase (đọc/ghi cookie) ---
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options?: Record<string, unknown>;
          }[]
        ) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request: { headers: requestHeaders } });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh token nếu cần (không tự redirect ở đây — guard nằm ở layout/page).
  await supabase.auth.getUser();

  return response;
}

export const config = {
  // Bỏ qua asset tĩnh; chạy cho mọi route ứng dụng (để refresh phiên toàn cục).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
