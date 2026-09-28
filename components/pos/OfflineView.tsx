"use client";

import { useEffect, useMemo, useState } from "react";
import { WifiOff, Wifi } from "lucide-react";
import { docBanChup, type BanChup, type DonChup } from "@/lib/offline/snapshot";
import { useOnlineDaXacNhan } from "@/lib/offline/use-offline";
import { KHOA_KHI_MAT_MANG } from "@/components/pos/NetworkStatus";
import { formatVnd } from "@/lib/orders/cart";
import { gioVn, gioNgayVn } from "@/lib/time/vn";
import { cn } from "@/lib/utils";

const TRANG_THAI_BAN: Record<string, string> = {
  available: "Trống",
  occupied: "Đang phục vụ",
  reserved: "Đã đặt",
  cleaning: "Dọn bàn",
};

/**
 * Màn xem khi MẤT MẠNG (P17 17-01, OFFLINE-01, QD-024 D4). Service worker chuyển máy quầy tới đây khi tải lại
 * POS mà không có mạng. Chỉ đọc bản chụp trong máy — không có nút ghi nào chạy được: gọi món và thu tiền làm trên
 * điện thoại 4G/5G. Có mạng lại → quay về POS.
 */
export function OfflineView({ slug }: { slug: string }) {
  const online = useOnlineDaXacNhan();
  const [b, setB] = useState<BanChup | null | undefined>(undefined);
  const [tab, setTab] = useState<"ban" | "khong-ban" | "mon">("ban");
  const [banId, setBanId] = useState<string | null>(null);

  useEffect(() => {
    docBanChup(slug).then(setB);
  }, [slug]);

  const phienTheoBan = useMemo(() => new Map((b?.phien ?? []).map((p) => [p.banId, p])), [b]);
  const coBan = (b?.ban.length ?? 0) > 0;
  useEffect(() => {
    if (b && !coBan) setTab("khong-ban");
  }, [b, coBan]);

  const ban = b?.ban.find((t) => t.id === banId) ?? null;
  const phien = banId ? phienTheoBan.get(banId) ?? null : null;

  return (
    <div className="flex min-h-dvh flex-col bg-surface" data-offline-view>
      <div role="alert" className="flex flex-wrap items-center gap-sm border-b-2 border-status-late bg-status-late/10 px-lg py-sm">
        {online ? <Wifi className="h-4 w-4 text-status-ready" aria-hidden /> : <WifiOff className="h-4 w-4 text-status-late" aria-hidden />}
        <span className="text-sm font-bold text-ink">
          {online ? "Đã có mạng lại" : "Mất mạng"}
          {b ? ` — đang xem dữ liệu lúc ${gioNgayVn(b.luc)}` : ""}
        </span>
        <span className="text-sm text-slate">Dùng điện thoại (4G/5G) để gọi món và thu tiền.</span>
        {online && (
          <a
            href={`/r/${slug}/pos`}
            className="ml-auto inline-flex min-h-[44px] items-center rounded-md bg-primary px-lg text-sm font-semibold text-primary-fg hover:bg-primary-deep"
          >
            Quay lại POS
          </a>
        )}
      </div>

      {b === undefined ? null : !b ? (
        <p className="p-lg text-sm text-slate">
          Máy này chưa lưu dữ liệu để xem khi mất mạng (chưa mở POS lúc có mạng). Dùng điện thoại để gọi món và thu tiền.
        </p>
      ) : (
        <>
          <header className="flex flex-wrap items-center gap-sm border-b border-hairline-soft bg-canvas px-lg py-sm">
            <span className="font-medium text-ink">{b.tenQuan}</span>
            <nav className="ml-auto flex gap-xs" aria-label="Xem">
              {(
                [
                  ...(coBan ? [["ban", `Bàn (${b.phien.length} đang mở)`]] : []),
                  ["khong-ban", `Đơn không bàn (${b.khongBan.length})`],
                  ["mon", "Thực đơn"],
                ] as [typeof tab, string][]
              ).map(([k, nhan]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setTab(k)}
                  aria-pressed={tab === k}
                  className={cn(
                    "min-h-[44px] rounded-md px-md text-sm font-medium",
                    tab === k ? "bg-ink text-canvas" : "border border-hairline-strong bg-canvas text-ink"
                  )}
                >
                  {nhan}
                </button>
              ))}
            </nav>
          </header>

          <main className="flex-1 p-lg">
            {tab === "ban" && (
              <div className="grid gap-lg lg:grid-cols-[1fr_380px]">
                <div className="flex flex-col gap-md">
                  {[...b.khu, { id: null as string | null, ten: "Chưa xếp khu" }].map((k) => {
                    const cacBan = b.ban.filter((t) => t.khuId === k.id);
                    if (!cacBan.length) return null;
                    return (
                      <section key={k.id ?? "none"}>
                        <h2 className="mb-xs text-sm font-medium text-steel">{k.ten}</h2>
                        <div className="grid grid-cols-3 gap-sm sm:grid-cols-5 xl:grid-cols-7">
                          {cacBan.map((t) => {
                            const p = phienTheoBan.get(t.id);
                            return (
                              <button
                                key={t.id}
                                type="button"
                                onClick={() => setBanId(t.id)}
                                className={cn(
                                  "min-h-[72px] rounded-lg border p-sm text-left",
                                  banId === t.id ? "border-primary ring-2 ring-primary" : "border-hairline-soft",
                                  p ? "bg-cream" : "bg-canvas"
                                )}
                              >
                                <span className="block font-medium text-ink">{t.ten}</span>
                                <span className="block text-xs text-steel">{TRANG_THAI_BAN[t.trangThai] ?? t.trangThai}</span>
                                {p?.tongHd != null && <span className="block text-xs tabular-nums text-ink">{formatVnd(p.tongHd)}</span>}
                              </button>
                            );
                          })}
                        </div>
                      </section>
                    );
                  })}
                </div>
                <aside className="rounded-lg border border-hairline-soft bg-canvas p-md">
                  {!ban ? (
                    <p className="text-sm text-slate">Chọn một bàn để xem món đã gọi.</p>
                  ) : (
                    <>
                      <h2 className="font-medium text-ink">
                        {ban.ten}
                        {phien && <span className="ml-xs text-sm font-normal text-steel">mở lúc {gioVn(phien.moLuc)}</span>}
                      </h2>
                      {!phien ? (
                        <p className="mt-sm text-sm text-slate">Bàn không có đơn đang mở.</p>
                      ) : (
                        <>
                          {phien.don.map((d, i) => (
                            <DanhSachMon key={i} don={d} />
                          ))}
                          {phien.tongHd != null && (
                            <p className="mt-md flex justify-between border-t border-hairline-soft pt-sm font-medium text-ink">
                              <span>Hóa đơn{phien.soHd != null ? ` #${phien.soHd}` : ""}</span>
                              <span className="tabular-nums">{formatVnd(phien.tongHd)}</span>
                            </p>
                          )}
                        </>
                      )}
                      <button type="button" disabled aria-describedby="ly-do-khoa" className="mt-md min-h-[44px] w-full cursor-not-allowed rounded-md bg-hairline-soft px-lg text-sm font-semibold text-steel">
                        Gọi thêm món / Thu tiền
                      </button>
                      <p id="ly-do-khoa" className="mt-xs text-xs text-status-late">
                        {KHOA_KHI_MAT_MANG}
                      </p>
                    </>
                  )}
                </aside>
              </div>
            )}

            {tab === "khong-ban" && (
              <div className="grid gap-md sm:grid-cols-2 xl:grid-cols-3">
                {b.khongBan.length === 0 && <p className="text-sm text-slate">Không có đơn không bàn đang mở.</p>}
                {b.khongBan.map((d, i) => (
                  <div key={i} className="rounded-lg border border-hairline-soft bg-canvas p-md">
                    <p className="flex justify-between font-medium text-ink">
                      <span>Đơn #{d.soDon ?? "?"}</span>
                      <span className="tabular-nums">{formatVnd(d.tong)}</span>
                    </p>
                    <DanhSachMon don={{ soDon: d.soDon, trangThai: d.trangThai, luc: d.luc, mon: d.mon }} anTieuDe />
                  </div>
                ))}
              </div>
            )}

            {tab === "mon" && (
              <div className="grid gap-lg sm:grid-cols-2 xl:grid-cols-3">
                {b.thucDon.map((n) => (
                  <section key={n.nhom}>
                    <h2 className="mb-xs text-sm font-medium text-steel">{n.nhom}</h2>
                    <ul className="divide-y divide-hairline-soft rounded-lg border border-hairline-soft bg-canvas text-sm">
                      {n.mon.map((m) => (
                        <li key={m.ten} className={cn("flex justify-between px-md py-xs", !m.con && "text-steel line-through")}>
                          <span>{m.ten}</span>
                          <span className="tabular-nums">{formatVnd(m.gia)}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </main>
        </>
      )}
    </div>
  );
}

function DanhSachMon({ don, anTieuDe = false }: { don: DonChup; anTieuDe?: boolean }) {
  return (
    <div className="mt-sm">
      {!anTieuDe && (
        <p className="text-xs text-steel">
          Đơn #{don.soDon ?? "?"} · {gioVn(don.luc)}
        </p>
      )}
      <ul className="text-sm">
        {don.mon.map((m, i) => (
          <li key={i} className={cn("py-xxs", m.huy && "text-steel line-through")}>
            <span className="tabular-nums">{m.sl}×</span> {m.ten}
            {m.tuyChon.length > 0 && <span className="text-xs text-steel"> · {m.tuyChon.join(", ")}</span>}
            {m.ghiChu && <span className="block pl-md text-xs text-slate">» {m.ghiChu}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
