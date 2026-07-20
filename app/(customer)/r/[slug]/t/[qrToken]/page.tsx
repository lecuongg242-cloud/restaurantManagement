import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/env";
import { SetupNotice } from "@/components/setup-notice";
import { MenuView } from "@/components/menu/menu-view";
import { fetchCustomerMenu } from "@/lib/menu";

/**
 * Trang quét QR bàn: resolve qua RPC resolve_table_by_qr (anon KHÔNG
 * select trực tiếp bảng bàn — cam kết P2 #8). QR không còn hiệu lực
 * (bàn đã xóa/token sai) → trang báo lỗi thân thiện.
 */
export default async function TableQrPage({
  params,
}: {
  params: Promise<{ slug: string; qrToken: string }>;
}) {
  const { slug, qrToken } = await params;
  if (!hasSupabaseEnv()) return <SetupNotice />;
  const supabase = await createClient();

  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(qrToken);
  const { data: rows } = isUuid
    ? await supabase.rpc("resolve_table_by_qr", { p_qr_token: qrToken })
    : { data: null };
  const table = rows?.[0] as
    | { table_id: string; table_name: string; area_name: string; tenant_slug: string; tenant_name: string }
    | undefined;

  if (!table) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <h1 className="text-xl font-bold">Mã QR không còn hiệu lực</h1>
        <p className="max-w-sm text-sm opacity-70">
          Bàn gắn với mã này có thể đã được nhà hàng thay đổi. Bạn có thể xem
          menu hoặc nhờ nhân viên hỗ trợ.
        </p>
        <Link
          href={`/r/${slug}`}
          className="mt-2 flex min-h-11 items-center rounded-full bg-primary px-5 font-medium text-on-primary"
        >
          Xem menu nhà hàng
        </Link>
      </main>
    );
  }

  const { data: tenant } = await supabase
    .from("tenant_public_info")
    .select("id, name, logo_url, address, phone")
    .eq("slug", table.tenant_slug)
    .maybeSingle();
  if (!tenant) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center p-6">
        <p className="opacity-70">Nhà hàng tạm ngưng hoạt động.</p>
      </main>
    );
  }

  const menu = await fetchCustomerMenu(supabase, tenant.id);

  return (
    <main className="flex flex-1 flex-col">
      <MenuView tenant={tenant} initialMenu={menu} tableName={table.table_name} />
    </main>
  );
}
