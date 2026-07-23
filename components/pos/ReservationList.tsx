"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, CalendarPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StaffReservationDialog, buildTableGroups } from "@/components/pos/StaffReservationDialog";
import { Select } from "@/components/ui/select";
import type { ReservationCounts, ReservationStatus, ReservationView } from "@/lib/reservations/types";
import {
  confirmReservationAction,
  rejectReservationAction,
  assignReservationTableAction,
} from "@/app/r/[slug]/pos/actions";

type TableOpt = { id: string; name: string; area_id: string | null };
type AreaOpt = { id: string; name: string };

const VN_OFFSET = 7 * 3600 * 1000;

/** HH:MM giờ VN từ ISO UTC. */
function hhmm(iso: string): string {
  return new Date(new Date(iso).getTime() + VN_OFFSET).toISOString().slice(11, 16);
}

const STATUS_META: Record<ReservationStatus, { label: string; className: string }> = {
  pending: { label: "Chờ duyệt", className: "border-primary/30 bg-cream text-primary" },
  confirmed: { label: "Đã xác nhận", className: "border-status-ready bg-status-ready-bg text-status-ready" },
  rejected: { label: "Đã từ chối", className: "border-status-late bg-cream-soft text-status-late" },
  cancelled: { label: "Đã hủy", className: "border-hairline-strong bg-surface text-muted" },
};

export function ReservationList({
  slug,
  tenantId,
  day,
  dayLabel,
  prevDay,
  nextDay,
  today,
  items,
  counts,
  areas = [],
  tables = [],
}: {
  slug: string;
  tenantId: string;
  day: string;
  dayLabel: string;
  prevDay: string;
  nextDay: string;
  today: string;
  items: ReservationView[];
  counts: ReservationCounts;
  areas?: AreaOpt[];
  tables?: TableOpt[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Realtime: đơn mới/đổi trạng thái → refresh (gộp 400ms). setAuth để RLS không chặn.
  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    const scheduleRefresh = () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => router.refresh(), 400);
    };
    const { data: authSub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session?.access_token) supabase.realtime.setAuth(session.access_token);
    });
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session?.access_token) supabase.realtime.setAuth(data.session.access_token);
      channel = supabase
        .channel(`reservations:${tenantId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "reservations", filter: `tenant_id=eq.${tenantId}` },
          scheduleRefresh
        )
        .subscribe();
    })();
    return () => {
      cancelled = true;
      authSub.subscription.unsubscribe();
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      if (channel) supabase.removeChannel(channel);
    };
  }, [tenantId, router]);

  function onConfirm(id: string) {
    setError(null);
    setBusyId(id);
    startTransition(async () => {
      const res = await confirmReservationAction(slug, id);
      setBusyId(null);
      if ("error" in res) setError(res.error);
      else router.refresh();
    });
  }

  function onReject(id: string) {
    setError(null);
    setBusyId(id);
    startTransition(async () => {
      const res = await rejectReservationAction(slug, id, reason);
      setBusyId(null);
      if ("error" in res) setError(res.error);
      else {
        setRejectingId(null);
        setReason("");
        router.refresh();
      }
    });
  }

  function onAssignTable(id: string, tableId: string) {
    setError(null);
    setBusyId(id);
    startTransition(async () => {
      const res = await assignReservationTableAction(slug, id, tableId || null);
      setBusyId(null);
      if ("error" in res) setError(res.error);
      else router.refresh();
    });
  }

  const tableGroups = buildTableGroups(areas, tables);

  return (
    <div className="mt-lg">
      {/* Tạo đặt bàn hộ khách */}
      <div className="mb-md flex justify-end">
        <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
          <CalendarPlus className="h-4 w-4" /> Đặt bàn mới
        </Button>
      </div>

      {/* Điều hướng ngày */}
      <div className="flex flex-wrap items-center justify-between gap-md">
        <div className="flex items-center gap-xs">
          <Button asChild variant="secondary" size="sm" aria-label="Ngày trước">
            <Link href={`?day=${prevDay}`}>
              <ChevronLeft className="h-4 w-4" />
            </Link>
          </Button>
          <span className="min-w-[7rem] text-center text-sm font-medium text-ink">{dayLabel}</span>
          <Button asChild variant="secondary" size="sm" aria-label="Ngày sau">
            <Link href={`?day=${nextDay}`}>
              <ChevronRight className="h-4 w-4" />
            </Link>
          </Button>
          {day !== today && (
            <Button asChild variant="secondary" size="sm">
              <Link href={`?day=${today}`}>Hôm nay</Link>
            </Button>
          )}
        </div>

        {/* Đếm theo trạng thái */}
        <div className="flex items-center gap-sm text-xs text-steel">
          <span className="rounded-full border border-primary/30 bg-cream px-sm py-xxs font-medium text-primary">
            {counts.pending} chờ duyệt
          </span>
          <span className="text-slate">{counts.confirmed} xác nhận</span>
          <span className="text-muted">{counts.rejected} từ chối</span>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-md rounded-md border border-status-late bg-cream-soft px-md py-sm text-sm text-status-late">
          {error}
        </p>
      )}

      {/* Danh sách */}
      {items.length === 0 ? (
        <p className="mt-xl rounded-lg border border-dashed border-hairline-strong px-lg py-xxl text-center text-sm text-muted">
          Chưa có yêu cầu đặt bàn nào trong ngày này.
        </p>
      ) : (
        <ul className="mt-md flex flex-col gap-sm">
          {items.map((r) => {
            const meta = STATUS_META[r.status];
            const busy = busyId === r.id && isPending;
            return (
              <li key={r.id} className="rounded-lg border border-hairline-soft bg-canvas p-lg">
                <div className="flex flex-wrap items-start justify-between gap-md">
                  <div className="flex items-start gap-md">
                    <span className="tabular-nums text-lg font-medium text-ink">{hhmm(r.reserved_at)}</span>
                    <div className="flex flex-col gap-xxs">
                      <span className="text-sm font-medium text-ink">
                        {r.customer_name} · {r.party_size} người
                      </span>
                      <span className="text-sm text-slate">
                        <a href={`tel:${r.customer_phone}`} className="text-primary hover:underline">
                          {r.customer_phone}
                        </a>
                        {r.area_name && <span className="text-steel"> · {r.area_name}</span>}
                      </span>
                      {/* Gán bàn (thông tin — không giữ bàn) */}
                      {tables.length > 0 && r.status !== "rejected" && r.status !== "cancelled" ? (
                        <div className="flex items-center gap-xs text-xs text-steel">
                          <span>Bàn:</span>
                          <Select
                            value={r.table_id ?? ""}
                            onValueChange={(v) => onAssignTable(r.id, v)}
                            placeholder="Chưa gán bàn"
                            clearLabel="Chưa gán bàn"
                            groups={tableGroups}
                            disabled={busy}
                            ariaLabel="Gán bàn"
                            className="h-9 w-auto min-w-[9rem] text-xs"
                          />
                        </div>
                      ) : (
                        r.table_name && <span className="text-xs text-steel">Bàn: {r.table_name}</span>
                      )}
                      {r.note && <span className="text-xs text-steel">Ghi chú: {r.note}</span>}
                      {r.status === "rejected" && r.reject_reason && (
                        <span className="text-xs text-status-late">Lý do từ chối: {r.reject_reason}</span>
                      )}
                    </div>
                  </div>

                  <span className={`shrink-0 rounded-full border px-sm py-xxs text-xs font-medium ${meta.className}`}>
                    {meta.label}
                  </span>
                </div>

                {/* Hành động cho đơn chờ duyệt */}
                {r.status === "pending" && (
                  <div className="mt-md border-t border-hairline-soft pt-md">
                    {rejectingId === r.id ? (
                      <div className="flex flex-col gap-sm">
                        <Input
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          placeholder="Lý do từ chối (bắt buộc)"
                          maxLength={300}
                          autoFocus
                        />
                        <div className="flex gap-sm">
                          <Button
                            variant="primary"
                            size="sm"
                            disabled={busy || !reason.trim()}
                            onClick={() => onReject(r.id)}
                          >
                            {busy ? "Đang lưu…" : "Xác nhận từ chối"}
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={busy}
                            onClick={() => {
                              setRejectingId(null);
                              setReason("");
                            }}
                          >
                            Hủy
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-sm">
                        <Button variant="primary" size="sm" disabled={busy} onClick={() => onConfirm(r.id)}>
                          {busy ? "Đang lưu…" : "Xác nhận"}
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={busy}
                          onClick={() => {
                            setError(null);
                            setRejectingId(r.id);
                            setReason("");
                          }}
                        >
                          Từ chối
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {createOpen && (
        <StaffReservationDialog
          slug={slug}
          areas={areas}
          tables={tables}
          onClose={() => {
            setCreateOpen(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
