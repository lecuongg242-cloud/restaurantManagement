import { redirect } from "next/navigation";
import { isSuperAdmin } from "@/lib/auth/session";
import { docQuan } from "@/lib/super/tong-hop";
import { BridgeTable } from "../BridgeTable";
import { PrintBridgeForm, BridgeActivationForm } from "../tenant-actions";
import { SuperPageHeader } from "@/components/super/SuperShell";

export const dynamic = "force-dynamic";

/** Cầu in mọi quán (PRINT-13) + cấp tài khoản cầu in / mã kích hoạt cho từng quán. */
export default async function CauInPage() {
  if (!(await isSuperAdmin())) redirect("/super/login");
  const { quan } = await docQuan();

  return (
    <div className="flex flex-col gap-lg">
      <SuperPageHeader
        title="Cầu in"
        description="Tình trạng cầu in và máy in bếp của mọi quán. Quán cần chú ý nằm trên cùng."
      />
      {quan.length === 0 ? (
        <p className="text-sm text-steel">Chưa có nhà hàng nào.</p>
      ) : (
        <BridgeTable
          tenants={quan}
          thaoTac={(id) => (
            <>
              <PrintBridgeForm tenantId={id} />
              <BridgeActivationForm tenantId={id} />
            </>
          )}
        />
      )}
    </div>
  );
}
