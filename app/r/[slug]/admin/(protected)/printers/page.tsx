import { redirect } from "next/navigation";
import { getSessionMembership } from "@/lib/auth/session";
import { canManage, defaultRouteForRole } from "@/lib/auth/rbac";
import { createClient } from "@/lib/supabase/server";
import { Card, CardTitle } from "@/components/ui/card";
import { TuLamMoi } from "@/components/admin/TuLamMoi";
import { buttonVariants } from "@/components/ui/button";
import { createAdminClient } from "@/lib/supabase/admin";
import { thongTinBoCai } from "@/lib/print/bo-cai";
import { CAU_LOI } from "@/lib/print/ma-chu-quan";
import { trangThaiMayIn, type NhipTim } from "@/lib/print/cau-in";
import { demPhieuHomNay } from "@/lib/print/cau-in-db";
import { resolveRange } from "@/lib/billing/report-range";
import { docNguonCauIn, nguonCauIn } from "@/lib/print/nguon-cau-in";
import { thongTinApp } from "@/lib/desktop/phat-hanh";
import { cachDay, gioNgayNamVn, gioNgayVn, gioVn } from "@/lib/time/vn";

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

export default async function PrintersPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ loi?: string }>;
}) {
  const { slug } = await params;
  // Lỗi do route tải bộ cài gửi về — URL chỉ mang MÃ lỗi; câu hiển thị tra từ bảng cố định, mã lạ bỏ qua
  // (không để link lạ chèn câu tùy ý lên trang quản trị).
  const maLoi = (await searchParams).loi;
  const loi = maLoi && Object.hasOwn(CAU_LOI, maLoi) ? CAU_LOI[maLoi as keyof typeof CAU_LOI] : null;

  const session = await getSessionMembership(slug);
  if (!session) redirect(`/r/${slug}/admin/login`);
  if (!canManage(session.role, "printers")) {
    redirect(defaultRouteForRole(slug, session.role));
  }

  const supabase = await createClient();
  const tenantId = session.tenant.id;
  const [{ data: nhipRow }, dem, boCai, nguon, app] = await Promise.all([
    supabase
      .from("printer_heartbeats")
      .select("seen_at, printer_ok, printer_host, printer_checked_at, counter_ok, counter_target, counter_checked_at, last_gap_from, last_gap_seconds")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    demPhieuHomNay(supabase, tenantId, resolveRange({ preset: "today" }).fromUtc),
    thongTinBoCai(createAdminClient()),
    docNguonCauIn(supabase.from("printer_heartbeats").select("tenant_id, agent").eq("tenant_id", tenantId)),
    thongTinApp(),
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

      {/* P21 DESK-11 — như KiotViet "Tải KiotViet Thu ngân": một tệp cài, đăng nhập bằng tài khoản chủ quán ngay trong app. */}
      {app && (
        <Card className="mt-lg">
          <CardTitle>Cài TechMenu Thu ngân trên máy quầy</CardTitle>
          <ol className="mt-md list-decimal space-y-xs pl-lg text-sm text-slate">
            <li>Mở trang này <span className="font-medium text-ink">trên chính máy quầy</span> → bấm tải.</li>
            <li>
              Mở tệp vừa tải. Windows báo &quot;Windows protected your PC&quot; → bấm{" "}
              <span className="font-medium text-ink">More info</span> →{" "}
              <span className="font-medium text-ink">Run anyway</span>.
            </li>
            <li>App tự mở → đăng nhập email + mật khẩu chủ quán → chọn &quot;Có — máy quầy&quot; → cài máy in → In thử.</li>
          </ol>
          <p className="mt-sm text-sm text-slate">
            Đăng nhập trên máy mới thì máy cũ đang in cho quán <span className="font-medium text-ink">ngừng in</span>. Máy đặt
            ở bếp chọn &quot;Không — chỉ xem&quot;. Chi tiết:{" "}
            <a href="/huong-dan-cai-dat#cai-app" className="font-medium text-primary underline">
              hướng dẫn cài đặt
            </a>
            .
          </p>
          <div className="mt-md flex flex-wrap items-center gap-md">
            <a href="/api/desktop/latest" className={buttonVariants({ variant: "primary" })}>
              Tải TechMenu Thu ngân{app.kichThuoc > 0 ? ` (${Math.max(1, Math.round(app.kichThuoc / 1048576))} MB)` : ""}
            </a>
            <span className="text-sm text-steel">Windows 10/11 · bản {app.phienBan}</span>
          </div>
        </Card>
      )}

      {/* PRINT-17 — tải bộ cài ngay trên laptop quầy, không cần ai gửi qua Zalo/USB. */}
      <Card className="mt-lg">
        <CardTitle>{app ? "Cách cũ — cầu in cài bằng CAI-DAT.bat" : "Cài cầu in trên laptop quầy"}</CardTitle>
        {app && (
          <p className="mt-xs text-sm text-steel">Chỉ dùng cho máy đã cài theo cách này trước đây. Máy mới cài TechMenu Thu ngân ở trên.</p>
        )}
        <ol className="mt-md list-decimal space-y-xs pl-lg text-sm text-slate">
          <li>Mở trang này <span className="font-medium text-ink">trên chính laptop quầy</span> → bấm tải bộ cài (có thể mất tới 1 phút mới bắt đầu tải — đừng bấm lại).</li>
          <li>Chuột phải file vừa tải → <span className="font-medium text-ink">Extract All</span> (Giải nén tất cả) → Extract.</li>
          <li>Double-click <span className="font-medium text-ink">CAI-DAT.bat</span> → Yes → trả lời 2 câu hỏi trên màn hình.</li>
        </ol>
        {session.role === "owner" ? (
          <p className="mt-sm text-sm text-slate">
            Bộ cài <span className="font-medium text-ink">kèm sẵn mã kích hoạt</span> — không phải gõ mã. Cài trong vòng
            30 phút; quá hạn thì tải lại. Cài bằng bộ cài mới trên máy khác thì cầu in đang chạy ở máy cũ{" "}
            <span className="font-medium text-ink">ngừng in</span>.
          </p>
        ) : (
          <p className="mt-sm text-sm text-slate">
            Tài khoản quản lý: bộ cài không kèm mã, lúc cài sẽ hỏi mã. Nhờ chủ quán tải để khỏi phải gõ.
          </p>
        )}
        {loi && (
          <p role="alert" className="mt-sm text-sm text-status-late">
            {loi}
          </p>
        )}
        <div className="mt-md flex flex-wrap items-center gap-md">
          {boCai ? (
            <form method="post" action={`/r/${slug}/admin/printers/bo-cai`}>
              <button type="submit" className={buttonVariants({ variant: "primary" })}>
                Tải bộ cài cầu in ({Math.max(1, Math.round(boCai.kichThuoc / 1048576))} MB)
              </button>
            </form>
          ) : (
            <p className="text-sm text-slate">Chưa có bộ cài để tải — liên hệ quản trị hệ thống.</p>
          )}
          {boCai && <span className="text-sm text-steel">Đóng gói lúc {gioNgayNamVn(boCai.capNhatLuc)}</span>}
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
