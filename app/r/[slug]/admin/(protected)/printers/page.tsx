import Link from "next/link";
import { redirect } from "next/navigation";
import { cn } from "@/lib/utils";
import { loadStations } from "@/lib/print/stations";
import { StationManager } from "./StationManager";
import { getSessionMembership } from "@/lib/auth/session";
import { canManage, defaultRouteForRole } from "@/lib/auth/rbac";
import { createClient } from "@/lib/supabase/server";
import { Card, CardTitle } from "@/components/ui/card";
import { TuLamMoi } from "@/components/admin/TuLamMoi";
import { trangThaiMayIn, type NhipTim } from "@/lib/print/cau-in";
import { demPhieuHomNay } from "@/lib/print/cau-in-db";
import { resolveRange } from "@/lib/billing/report-range";
import { docNguonCauIn, nguonCauIn } from "@/lib/print/nguon-cau-in";
import { cachDay, gioNgayVn, gioVn } from "@/lib/time/vn";

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

const PILL =
  "inline-flex min-h-10 shrink-0 items-center rounded-full border px-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1";

/** Hàng tab viên thuốc (như Kho hàng): Tình trạng · Bếp / Bar (P37). */
function PrinterTabs({ slug, active }: { slug: string; active: "tinh-trang" | "bep-bar" }) {
  const base = `/r/${slug}/admin/printers`;
  const tab = (href: string, label: string, on: boolean) => (
    <Link
      href={href}
      scroll={false}
      aria-current={on ? "page" : undefined}
      className={cn(PILL, on ? "border-primary bg-primary text-primary-fg" : "border-hairline-strong bg-canvas text-slate hover:bg-surface")}
    >
      {label}
    </Link>
  );
  return (
    <nav aria-label="Máy in" className="-mx-xs mt-md flex gap-sm overflow-x-auto px-xs py-xxs">
      {tab(base, "Tình trạng", active === "tinh-trang")}
      {tab(`${base}?tab=bep-bar`, "Bếp / Bar", active === "bep-bar")}
    </nav>
  );
}

export default async function PrintersPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { slug } = await params;
  const { tab } = await searchParams;

  const session = await getSessionMembership(slug);
  if (!session) redirect(`/r/${slug}/admin/login`);
  if (!canManage(session.role, "printers")) {
    redirect(defaultRouteForRole(slug, session.role));
  }

  const supabase = await createClient();
  const tenantId = session.tenant.id;

  if (tab === "bep-bar") {
    const [stations, { data: cats }] = await Promise.all([
      loadStations(supabase, tenantId),
      supabase
        .from("menu_categories")
        .select("id, name, station_id")
        .eq("tenant_id", tenantId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
    ]);
    return (
      <div className="w-full">
        <h1 className="font-semibold text-2xl text-ink">Máy in</h1>
        <PrinterTabs slug={slug} active="bep-bar" />
        <StationManager
          slug={slug}
          stations={stations}
          categories={(cats ?? []).map((c) => ({ id: c.id as string, name: c.name as string, stationId: (c.station_id as string | null) ?? null }))}
        />
      </div>
    );
  }
  const [{ data: nhipRow }, dem, nguon] = await Promise.all([
    supabase
      .from("printer_heartbeats")
      .select("seen_at, printer_ok, printer_host, printer_checked_at, counter_ok, counter_target, counter_checked_at, last_gap_from, last_gap_seconds")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    demPhieuHomNay(supabase, tenantId, resolveRange({ preset: "today" }).fromUtc),
    docNguonCauIn(supabase.from("printer_heartbeats").select("tenant_id, agent").eq("tenant_id", tenantId)),
  ]);

  const now = Date.now();
  const nhip =
    (nhipRow as
      | (NhipTim & {
          printer_host: string | null;
          counter_ok: boolean | null;
          counter_target: string | null;
          counter_checked_at: string | null;
          last_gap_from: string | null;
          last_gap_seconds: number | null;
        })
      | null) ?? null;
  const tt = trangThaiMayIn(nhip, now);
  // Máy in QUẦY (PRINT-15) — cùng quy tắc sống/chết/không biết với máy bếp, áp lên các cột counter_*.
  const ttQuay = trangThaiMayIn(
    nhip ? { seen_at: nhip.seen_at, printer_ok: nhip.counter_ok, printer_checked_at: nhip.counter_checked_at } : null,
    now
  );

  const lyDoKhongBiet =
    tt.cauIn !== "song"
      ? "Cầu in không kết nối nên không kiểm được máy in."
      : nhip?.printer_ok === null
        ? "Cầu in bản cũ chưa báo trạng thái máy in — cập nhật cầu in tại quán."
        : "Chưa có kết quả kiểm gần đây.";

  return (
    <div className="w-full">
      <TuLamMoi />
      <h1 className="font-semibold text-2xl text-ink">Máy in</h1>
      <PrinterTabs slug={slug} active="tinh-trang" />
      <p className="mt-md text-sm text-steel">
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
            {/* P21 DESK-05: app Windows hay cầu in cũ — biết quán đã chuyển sang app chưa. */}
            {nhip?.seen_at && nguon && <Dong nhan="Nguồn" giaTri={nguonCauIn(nguon.get(tenantId))} />}
            {/* P17 17-02: lần mất kết nối gần nhất (vd wifi quán mất) và bao lâu mới lên lại. */}
            {nhip?.last_gap_from && nhip.last_gap_seconds != null && (
              <Dong
                nhan="Mất kết nối gần nhất"
                giaTri={`${gioNgayVn(nhip.last_gap_from)} · ${thoiLuong(nhip.last_gap_seconds)}`}
              />
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
        <CardTitle>Máy in quầy — hóa đơn từ điện thoại, tablet</CardTitle>
        <div className="mt-md flex flex-col gap-sm">
          {!nhip?.counter_target ? (
            <>
              <NhanTrangThai tone="chua-ro">Chưa khai</NhanTrangThai>
              <p className="text-sm text-slate">
                Điện thoại / tablet chưa in được hóa đơn. Chạy lại CAI-DAT.bat trên laptop quầy và chọn máy in
                quầy. Máy quầy vẫn in hóa đơn bình thường.
              </p>
            </>
          ) : (
            <>
              {ttQuay.mayIn === "ok" && <NhanTrangThai tone="tot">In được</NhanTrangThai>}
              {ttQuay.mayIn === "loi" && <NhanTrangThai tone="xau">KHÔNG in được</NhanTrangThai>}
              {ttQuay.mayIn === "khong-biet" && <NhanTrangThai tone="chua-ro">Không biết</NhanTrangThai>}
              <Dong nhan="Máy in" giaTri={nhip.counter_target} />
              {ttQuay.mayIn === "khong-biet" && (
                <p className="text-sm text-slate">
                  {ttQuay.cauIn !== "song"
                    ? "Cầu in không kết nối — điện thoại sẽ báo lỗi khi bấm in hóa đơn."
                    : nhip.counter_target.startsWith("usb:")
                      ? "Máy in cắm USB: biết được sau lần in hóa đơn đầu tiên từ điện thoại."
                      : "Chưa có kết quả kiểm gần đây."}
                </p>
              )}
              {ttQuay.mayIn === "loi" && (
                <p className="text-sm text-slate">Kiểm tra máy in quầy: nguồn, dây (USB/mạng), giấy.</p>
              )}
            </>
          )}
        </div>
      </Card>

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

/** 75 → "1 phút 15 giây"; 3700 → "1 giờ 2 phút". */
function thoiLuong(giay: number): string {
  if (giay < 60) return `${giay} giây`;
  const phut = Math.floor(giay / 60);
  if (phut < 60) return `${phut} phút${giay % 60 ? ` ${giay % 60} giây` : ""}`;
  return `${Math.floor(phut / 60)} giờ${phut % 60 ? ` ${phut % 60} phút` : ""}`;
}
