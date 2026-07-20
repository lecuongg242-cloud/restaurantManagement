import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export default async function proxy(request: NextRequest) {
  // Chưa cấu hình Supabase (chạy local lần đầu) → cho qua để xem UI khung.
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return NextResponse.next();
  }

  const { supabaseResponse } = await updateSession(request);

  // Route guard theo vai trò (super/admin/pos/kds) bổ sung ở plan 01-03,
  // sau khi có bảng memberships + tenant_invitations (01-02).
  return supabaseResponse;
}

export const config = {
  matcher: [
    // Bỏ qua static assets và ảnh; áp dụng cho mọi route còn lại.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
