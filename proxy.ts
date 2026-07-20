import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/** Vai trò được phép vào từng khu vực (khớp bản thiết kế P1 §3). */
const AREA_ROLES: Record<string, string[]> = {
  admin: ["owner", "manager"],
  pos: ["owner", "manager", "cashier", "waiter"],
  kds: ["owner", "manager", "kitchen"],
};

export default async function proxy(request: NextRequest) {
  // Chưa cấu hình Supabase (chạy local lần đầu) → cho qua để xem UI khung.
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return NextResponse.next();
  }

  const { supabaseResponse, supabase, user } = await updateSession(request);
  const { pathname } = request.nextUrl;

  const loginRedirect = () => {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  };
  const chooseRedirect = (err: string) => {
    const url = request.nextUrl.clone();
    url.pathname = "/choose";
    url.search = `?err=${err}`;
    return NextResponse.redirect(url);
  };

  // Khu vực super-admin
  if (pathname === "/super" || pathname.startsWith("/super/")) {
    if (!user) return loginRedirect();
    const { data } = await supabase
      .from("super_admins")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!data) return chooseRedirect("forbidden");
    return supabaseResponse;
  }

  // Khu vực nhân viên theo tenant: /r/[slug]/(admin|pos|kds)
  const match = pathname.match(/^\/r\/([^/]+)\/(admin|pos|kds)(\/|$)/);
  if (match) {
    const [, slug, area] = match;
    if (!user) return loginRedirect();

    // RLS: chỉ member active (hoặc super-admin) mới thấy tenant
    const { data: tenant } = await supabase
      .from("tenants")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (!tenant) return chooseRedirect("no-access");

    const { data: membership } = await supabase
      .from("memberships")
      .select("role, status")
      .eq("tenant_id", tenant.id)
      .eq("user_id", user.id)
      .maybeSingle();

    // Super-admin thấy tenant nhưng không có membership → cho vào admin
    if (!membership) {
      const { data: isSuper } = await supabase
        .from("super_admins")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (isSuper) return supabaseResponse;
      return chooseRedirect("no-access");
    }
    if (membership.status !== "active") return chooseRedirect("disabled");
    if (!AREA_ROLES[area].includes(membership.role)) {
      return chooseRedirect("forbidden");
    }
    return supabaseResponse;
  }

  // /choose cần đăng nhập
  if (pathname === "/choose") {
    if (!user) return loginRedirect();
  }

  // Còn lại (trang chủ, /login, /invite/*, /style-guide, khu khách /r/[slug]) là công khai
  return supabaseResponse;
}

export const config = {
  matcher: [
    // Bỏ qua static assets và ảnh; áp dụng cho mọi route còn lại.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
