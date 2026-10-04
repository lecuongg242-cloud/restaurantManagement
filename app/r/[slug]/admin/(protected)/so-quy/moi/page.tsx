import Link from "next/link";
import { getSessionMembership } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { loadCategories } from "@/lib/cashbook/data";
import { FUND_LABEL, isoToVnLocal } from "@/lib/cashbook/labels";
import { activeSupplierOptions } from "@/lib/purchasing/data";
import { parseSettings } from "@/lib/tenant/settings";
import { bankByBin } from "@/lib/payments/banks";
import { Card } from "@/components/ui/card";
import { VoucherForm } from "@/components/admin/cashbook/VoucherForm";

export const dynamic = "force-dynamic";

/** "+ Phiếu thu" / "+ Phiếu chi" (CASH-02). */
export default async function NewVoucherPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ loai?: string; quy?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const session = (await getSessionMembership(slug))!;
  const direction = sp.loai === "thu" ? "in" : "out";
  const supabase = await createClient();
  const [cats, suppliers, { data: t }] = await Promise.all([
    loadCategories(supabase, session.tenant.id),
    activeSupplierOptions(supabase, session.tenant.id),
    supabase.from("tenants").select("settings").eq("id", session.tenant.id).single(),
  ]);
  const bank = parseSettings(t?.settings).bank;
  const bankLabel = bank ? `${bankByBin(bank.bin)?.shortName ?? "Ngân hàng"} ·${bank.account_no.slice(-4)}` : FUND_LABEL.bank;

  return (
    <div className="flex flex-col gap-lg">
      <header>
        <Link href={`/r/${slug}/admin/so-quy`} className="text-sm text-primary">
          ‹ Sổ quỹ
        </Link>
        <h1 className="mt-xxs font-semibold text-2xl text-ink">{direction === "in" ? "Lập phiếu thu" : "Lập phiếu chi"}</h1>
        <p className="text-sm text-steel">
          {direction === "in"
            ? "Tiền vào quỹ ngoài bán hàng (bán hàng tự vào sổ quỹ, không cần lập phiếu)."
            : "Tiền ra khỏi quỹ: thuê nhà, lương, điện nước, đi chợ… Trả tiền phiếu nhập thì trả ngay trên phiếu nhập."}
        </p>
      </header>
      <Card>
        <VoucherForm
          slug={slug}
          direction={direction}
          fund={sp.quy === "bank" ? "bank" : "cash"}
          now={isoToVnLocal(new Date().toISOString())}
          categories={cats.filter((c) => c.direction === direction && c.active)}
          suppliers={suppliers}
          bankLabel={bankLabel}
        />
      </Card>
    </div>
  );
}
