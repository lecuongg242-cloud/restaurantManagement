import { createAdminClient } from "@/lib/supabase/admin";
import { docBanPhatHanh } from "@/lib/print/bridge-release";
import { hangCauIn, type HangCauIn } from "@/lib/print/cau-in-super";
import { parseSettings } from "@/lib/tenant/settings";
import { gioNgayVn } from "@/lib/time/vn";
import { cn } from "@/lib/utils";

/**
 * Tình trạng cầu in MỌI quán (PRINT-13) — super-admin nhìn một bảng là biết quán nào cầu in chết,
 * máy in không phản hồi, hay còn chạy bản cũ (tự cập nhật chưa tới / hỏng). Quán cần chú ý lên đầu.
 */
const CAU_IN: Record<HangCauIn["cauIn"], string> = { song: "Sống", chet: "MẤT KẾT NỐI", "chua-co": "Chưa có" };
const MAY_IN: Record<HangCauIn["mayIn"], string> = { ok: "Phản hồi", loi: "KHÔNG phản hồi", "khong-biet": "—" };

export async function BridgeTable({ tenants }: { tenants: { id: string; slug: string; name: string }[] }) {
  const admin = createAdminClient();
  const ids = tenants.map((t) => t.id);
  const [{ data: rows }, { data: nhip }] = await Promise.all([
    admin.from("tenants").select("id, settings").in("id", ids),
    admin
      .from("printer_heartbeats")
      .select("tenant_id, seen_at, printer_ok, printer_checked_at, version")
      .in("tenant_id", ids),
  ]);
  const settingsById = new Map((rows ?? []).map((r) => [r.id, parseSettings(r.settings)]));
  const nhipById = new Map((nhip ?? []).map((n) => [n.tenant_id, n]));
  const banMoiNhat = docBanPhatHanh().version;
  const now = Date.now();

  const danhSach = tenants
    .map((t) => {
      const n = nhipById.get(t.id) ?? null;
      return {
        t,
        seenAt: n?.seen_at ?? null,
        hang: hangCauIn({
          printMode: settingsById.get(t.id)?.print_mode ?? "browser",
          nhip: n,
          banMoiNhat,
          now,
        }),
      };
    })
    .sort((a, b) => Number(b.hang.canChuY) - Number(a.hang.canChuY));

  const soCanChuY = danhSach.filter((d) => d.hang.canChuY).length;

  return (
    <section className="mt-lg rounded-lg border border-hairline-soft bg-canvas p-lg shadow-card">
      <div className="flex flex-wrap items-baseline justify-between gap-sm">
        <h2 className="font-display text-xl text-ink">Cầu in các quán</h2>
        <p className="text-sm text-steel">
          Bản mới nhất: <span className="font-mono text-ink">{banMoiNhat}</span>
          {soCanChuY > 0 && <span className="ml-sm font-medium text-status-late">· {soCanChuY} quán cần chú ý</span>}
        </p>
      </div>
      <div className="mt-md overflow-x-auto">
        <table className="w-full min-w-[36rem] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="py-xs pr-md font-medium">Quán</th>
              <th className="py-xs pr-md font-medium">Cách in</th>
              <th className="py-xs pr-md font-medium">Cầu in</th>
              <th className="py-xs pr-md font-medium">Máy in bếp</th>
              <th className="py-xs font-medium">Phiên bản</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline-soft">
            {danhSach.map(({ t, hang, seenAt }) => (
              <tr key={t.id} className={cn(hang.canChuY && "bg-status-late/5")}>
                <td className="py-sm pr-md">
                  <span className="text-ink">{t.name}</span>{" "}
                  <span className="font-mono text-xs text-steel">{t.slug}</span>
                </td>
                <td className="py-sm pr-md text-slate">{hang.printMode === "bridge" ? "Cầu in" : "Trình duyệt"}</td>
                <td className={cn("py-sm pr-md", hang.cauIn === "chet" && hang.printMode === "bridge" ? "font-medium text-status-late" : "text-slate")}>
                  {CAU_IN[hang.cauIn]}
                  {seenAt && hang.cauIn !== "song" && (
                    <span className="block text-xs text-steel">lần cuối {gioNgayVn(seenAt)}</span>
                  )}
                </td>
                <td className={cn("py-sm pr-md", hang.mayIn === "loi" ? "font-medium text-status-late" : "text-slate")}>
                  {MAY_IN[hang.mayIn]}
                </td>
                <td className={cn("py-sm font-mono", hang.banCu ? "font-medium text-status-late" : "text-slate")}>
                  {hang.cauIn === "chua-co" ? "—" : hang.version === null ? "cũ (trước 11-06)" : hang.version}
                  {hang.banCu && hang.version !== null && " · cũ"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
