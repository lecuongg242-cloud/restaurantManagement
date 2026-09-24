import { redirect } from "next/navigation";
import { getSessionMembership } from "@/lib/auth/session";
import { canManage, defaultRouteForRole } from "@/lib/auth/rbac";
import { createClient } from "@/lib/supabase/server";
import { Card, CardTitle } from "@/components/ui/card";
import { TuLamMoi } from "@/components/admin/TuLamMoi";
import { trangThaiMayIn, type NhipTim } from "@/lib/print/cau-in";
import { demPhieuHomNay } from "@/lib/print/cau-in-db";
import { resolveRange } from "@/lib/billing/report-range";
import { cachDay, gioVn } from "@/lib/time/vn";

/**
 * Màn "Máy in" (PRINT-09) — chủ quán mở ra là biết cầu in có chạy không và máy in bếp có phản hồi
 * không, thay vì chờ tới khi có phiếu in lỗi.
 *
 * Mọi phép so giờ làm ở server bằng đồng hồ máy chủ; mốc nhịp tim do database ghi. Không có đồng hồ
 * nào ở quán tham gia vào việc quyết "còn kết nối hay không".
 */
export const dynamic = "force-dynamic";

type Tone = "tot" | "xau" | "chua-ro";

const TONE: Record<Tone, string> = {
  tot: "bg-status-ready-bg text-status-ready",
  xau: "bg-status-late/10 text-status-late",
  "chua-ro": "bg-surface text-steel",
};
const CHAM: Record<Tone, string> = {
  tot: "bg-status-ready",
  xau: "bg-status-late",
  "chua-ro": "bg-steel",
};

function NhanTrangThai({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-xs rounded-full px-md py-xxs text-sm font-semibold ${TONE[tone]}`}>
      <span className={`h-2 w-2 rounded-full ${CHAM[tone]}`} aria-hidden />
      {children}
    </span>
  );
}

function Dong({ nhan, giaTri }: { nhan: string; giaTri: React.ReactNode }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-md gap-y-xxs text-sm">
      <span className="text-steel">{nhan}</span>
      <span className="font-medium tabular-nums text-ink">{giaTri}</span>
    </div>
  );
}

function So({ nhan, so, xau = false }: { nhan: string; so: number; xau?: boolean }) {
  return (
    <div className="rounded-md border border-hairline-soft p-md">
      <div className={`text-2xl font-semibold tabular-nums ${xau && so > 0 ? "text-status-late" : "text-ink"}`}>
        {so}
      </div>
      <div className="mt-xxs text-sm text-steel">{nhan}</div>
    </div>
  );
}

export default async function PrintersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const session = await getSessionMembership(slug);
  if (!session) redirect(`/r/${slug}/admin/login`);
  if (!canManage(session.role, "printers")) {
    redirect(defaultRouteForRole(slug, session.role));
  }

  const supabase = await createClient();
  const tenantId = session.tenant.id;
  const [{ data: nhipRow }, dem] = await Promise.all([
    supabase
      .from("printer_heartbeats")
      .select("seen_at, printer_ok, printer_host, printer_checked_at")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    demPhieuHomNay(supabase, tenantId, resolveRange({ preset: "today" }).fromUtc),
  ]);

  const now = Date.now();
  const nhip = (nhipRow as (NhipTim & { printer_host: string | null }) | null) ?? null;
  const tt = trangThaiMayIn(nhip, now);

  const lyDoKhongBiet =
    tt.cauIn !== "song"
      ? "Cầu in không kết nối nên không kiểm được máy in."
      : nhip?.printer_ok === null
        ? "Cầu in bản cũ chưa báo trạng thái máy in — cập nhật cầu in tại quán."
        : "Chưa có kết quả kiểm gần đây.";

  return (
    <div className="w-full max-w-4xl">
      <TuLamMoi />
      <h1 className="font-display text-2xl text-ink">Máy in</h1>
      <p className="mt-xxs text-sm text-steel">
        Cầu in bếp và máy in bếp có đang hoạt động không. Tự làm mới mỗi 30 giây.
      </p>

      <div className="mt-lg grid gap-lg md:grid-cols-2">
        <Card>
          <CardTitle>Cầu in bếp</CardTitle>
          <div className="mt-md flex flex-col gap-sm">
            {tt.cauIn === "song" && <NhanTrangThai tone="tot">Đang kết nối</NhanTrangThai>}
            {tt.cauIn === "chet" && (
              <NhanTrangThai tone="xau">Mất kết nối từ {gioVn(nhip?.seen_at)}</NhanTrangThai>
            )}
            {tt.cauIn === "chua-co" && <NhanTrangThai tone="chua-ro">Chưa có cầu in nào kết nối</NhanTrangThai>}

            {nhip?.seen_at && (
              <Dong nhan="Báo sống lần cuối" giaTri={`${gioVn(nhip.seen_at)} · ${cachDay(nhip.seen_at, now)}`} />
            )}
            {tt.cauIn !== "song" && (
              <p className="text-sm text-slate">
                Phiếu bếp đang tự in bằng trình duyệt ra máy in của máy POS — nhân viên mang vào bếp.
                {tt.cauIn === "chet"
                  ? " Kiểm tra laptop cầu in ở quán: có bật không, có mạng không."
                  : " Cài cầu in để phiếu tự ra ở bếp."}
              </p>
            )}
          </div>
        </Card>

        <Card>
          <CardTitle>Máy in bếp</CardTitle>
          <div className="mt-md flex flex-col gap-sm">
            {tt.mayIn === "ok" && <NhanTrangThai tone="tot">Phản hồi bình thường</NhanTrangThai>}
            {tt.mayIn === "loi" && <NhanTrangThai tone="xau">KHÔNG phản hồi</NhanTrangThai>}
            {tt.mayIn === "khong-biet" && <NhanTrangThai tone="chua-ro">Không biết</NhanTrangThai>}

            {nhip?.printer_host && <Dong nhan="Địa chỉ" giaTri={nhip.printer_host} />}
            {nhip?.printer_checked_at && tt.mayIn !== "khong-biet" && (
              <Dong
                nhan="Kiểm lần cuối"
                giaTri={`${gioVn(nhip.printer_checked_at)} · ${cachDay(nhip.printer_checked_at, now)}`}
              />
            )}
            {tt.mayIn === "loi" && (
              <p className="text-sm text-slate">
                Kiểm tra: máy in có bật nguồn, cắm dây mạng, còn giấy không. Phiếu gửi tới lúc này sẽ báo lỗi
                trên POS.
              </p>
            )}
            {tt.mayIn === "khong-biet" && <p className="text-sm text-slate">{lyDoKhongBiet}</p>}
          </div>
        </Card>
      </div>

      <Card className="mt-lg">
        <CardTitle>Phiếu bếp hôm nay</CardTitle>
        <div className="mt-md grid grid-cols-2 gap-sm md:grid-cols-4">
          <So nhan="Đã in" so={dem.daIn} />
          <So nhan="Lỗi" so={dem.loi} xau />
          <So nhan="Đang chờ" so={dem.dangCho} />
          <So nhan="Kẹt, chưa in" so={dem.ket} xau />
        </div>
        <div className="mt-md">
          <Dong
            nhan="Phiếu in gần nhất"
            giaTri={dem.inGanNhat ? `${gioVn(dem.inGanNhat)} · ${cachDay(dem.inGanNhat, now)}` : "chưa có"}
          />
        </div>
      </Card>

      {dem.loiGanDay.length > 0 && (
        <Card className="mt-lg">
          <CardTitle>Lỗi gần đây</CardTitle>
          <ul className="mt-md divide-y divide-hairline-soft">
            {dem.loiGanDay.map((l, i) => (
              <li key={`${l.luc}-${i}`} className="flex justify-between py-xs text-sm">
                <span className="tabular-nums text-ink">{gioVn(l.luc)}</span>
                <span className="text-steel">{l.soDon != null ? `Đơn #${l.soDon}` : "Đơn không rõ số"}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
