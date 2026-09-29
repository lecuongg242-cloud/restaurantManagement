import Link from "next/link";
import { getSessionMembership } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { activeSupplierOptions } from "@/lib/purchasing/data";
import type { BaseUnit } from "@/lib/inventory/types";
import { Card } from "@/components/ui/card";
import { ReceiptForm } from "@/components/admin/inventory/ReceiptForm";

export const dynamic = "force-dynamic";

/** "+ Nhập hàng" — lập phiếu nhập (như KiotViet "+ Nhập hàng"). Cùng form với Nguyên liệu → Nhập hôm nay, không điền sẵn. */
export default async function NewPurchasePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = (await getSessionMembership(slug))!;
  const supabase = await createClient();
  const [{ data: ings }, suppliers] = await Promise.all([
    supabase
      .from("ingredients")
      .select("id, name, base_unit, purchase_unit")
      .eq("tenant_id", session.tenant.id)
      .eq("active", true)
      .eq("kind", "purchased")
      .order("name"),
    activeSupplierOptions(supabase, session.tenant.id),
  ]);
  const ingredients = (ings ?? []) as { id: string; name: string; base_unit: BaseUnit; purchase_unit: string | null }[];

  return (
    <div className="flex flex-col gap-lg">
      <header>
        <Link href={`/r/${slug}/admin/nhap-hang`} className="text-sm text-primary">
          ‹ Nhập hàng
        </Link>
        <h1 className="mt-xxs font-display text-2xl text-ink">Lập phiếu nhập</h1>
      </header>
      <Card>
        {ingredients.length === 0 ? (
          <p className="text-sm text-steel">
            Chưa có nguyên liệu mua vào nào —{" "}
            <Link href={`/r/${slug}/admin/inventory`} className="text-primary">
              thêm ở Nguyên liệu
            </Link>{" "}
            trước.
          </p>
        ) : (
          <ReceiptForm
            slug={slug}
            ingredients={ingredients}
            prefill={[]}
            suppliers={suppliers}
          />
        )}
      </Card>
    </div>
  );
}
