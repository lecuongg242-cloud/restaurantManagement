"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { MoreHorizontal, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { normalizeVi } from "@/lib/menu/search";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  createStaff,
  deleteStaff,
  resetPin,
  setStaffActive,
  updateStaff,
  type StaffResult,
} from "@/app/r/[slug]/admin/(protected)/staff/actions";

export type StaffRole = "owner" | "manager" | "cashier" | "waiter" | "kitchen";

export type StaffRow = {
  id: string;
  name: string;
  email: string | null;
  role: StaffRole;
  active: boolean;
  /** Người đang xem được tác động lên dòng này (`canAssignRole` ở server). */
  editable: boolean;
};

const ROLE: Record<StaffRole, { label: string; hint: string; badge: string }> = {
  owner: { label: "Chủ quán", hint: "", badge: "bg-ink text-on-dark" },
  manager: {
    label: "Quản lý",
    hint: "Vào khu quản trị (trừ Cài đặt), đăng nhập bằng mật khẩu",
    badge: "bg-primary/10 text-primary-deep",
  },
  cashier: { label: "Thu ngân", hint: "Bán hàng, thu tiền ở máy POS", badge: "bg-cream-deeper text-ink" },
  waiter: { label: "Phục vụ", hint: "Gọi món cho bàn trên POS / điện thoại", badge: "bg-status-ready-bg text-status-ready" },
  kitchen: { label: "Bếp", hint: "Xem món và báo xong ở màn hình bếp", badge: "bg-surface text-slate ring-1 ring-inset ring-hairline" },
};

const usesPassword = (r: StaffRole) => r === "owner" || r === "manager";

/** Chữ cái đầu của TÊN (từ cuối): "Nguyễn Thị Lan" → "L". */
const initial = (name: string) => (name.trim().split(/\s+/).pop() ?? "?").charAt(0).toUpperCase();

const LABEL = "flex flex-col gap-xxs text-sm text-slate";
const HINT = "text-xs text-steel";

/**
 * Màn Nhân viên (P31, chủ dự án chốt 04/10/2026 — như Sapo "Thêm nhân viên", KiotViet "+ Người dùng"): bảng gọn, tìm không
 * dấu, lọc Đang làm / Đã tắt; "+ Thêm nhân viên" và bấm dòng mở hộp thoại; ⋯ → Sửa · Đổi PIN · Tắt/Bật · Xóa.
 */
export function StaffTable({
  slug,
  rows,
  canCreateManager,
}: {
  slug: string;
  rows: StaffRow[];
  canCreateManager: boolean;
}) {
  const [q, setQ] = useState("");
  const [loc, setLoc] = useState<"active" | "off">("active");
  // null = đóng; { row: null } = thêm mới; { row } = sửa.
  const [sua, setSua] = useState<{ row: StaffRow | null } | null>(null);
  const [doiMa, setDoiMa] = useState<StaffRow | null>(null);

  const dangLam = rows.filter((r) => r.active);
  const daTat = rows.filter((r) => !r.active);
  const shown = useMemo(() => {
    const k = normalizeVi(q.trim());
    return (loc === "active" ? dangLam : daTat).filter(
      (r) => !k || normalizeVi(r.name).includes(k) || (r.email ?? "").toLowerCase().includes(k)
    );
  }, [q, loc, dangLam, daTat]);

  const roleOptions: StaffRole[] = ["cashier", "waiter", "kitchen", ...(canCreateManager ? (["manager"] as const) : [])];

  const loai = (v: "active" | "off", nhan: string, n: number) => (
    <button
      type="button"
      aria-pressed={loc === v}
      onClick={() => setLoc(v)}
      className={cn(
        "inline-flex h-9 items-center rounded-full border px-md text-sm",
        loc === v ? "border-primary bg-cream text-primary-deep" : "border-hairline-strong text-slate hover:bg-surface"
      )}
    >
      {nhan} <span className="ml-xxs tabular-nums">{n}</span>
    </button>
  );

  const menu = (r: StaffRow) =>
    r.editable ? (
      <RowMenu slug={slug} row={r} onEdit={() => setSua({ row: r })} onSecret={() => setDoiMa(r)} />
    ) : (
      <span className="block h-9 w-9" aria-hidden />
    );

  return (
    <div className="flex flex-col gap-md">
      <div className="flex flex-wrap items-center justify-between gap-sm">
        <h1 className="font-semibold text-2xl text-ink">Nhân viên</h1>
        <button
          type="button"
          onClick={() => setSua({ row: null })}
          className="inline-flex h-11 items-center rounded-md bg-primary px-lg text-sm font-semibold text-primary-fg hover:bg-primary-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          + Thêm nhân viên
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-sm">
        <label className="relative w-full sm:w-72">
          <span className="sr-only">Tìm theo tên, email</span>
          <Search className="pointer-events-none absolute left-sm top-1/2 h-4 w-4 -translate-y-1/2 text-steel" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm theo tên, email" className="pl-[2.25rem]" />
        </label>
        <div className="flex gap-xs">
          {loai("active", "Đang làm", dangLam.length)}
          {loai("off", "Đã tắt", daTat.length)}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-lg border border-hairline-soft px-md py-xl text-center text-sm text-steel">
          {q ? "Không tìm thấy nhân viên." : loc === "off" ? "Không có nhân viên nào đã tắt." : "Chưa có nhân viên đang làm."}
        </p>
      ) : (
        <Bang rows={shown} menu={menu} onEdit={(r) => setSua({ row: r })} />
      )}
      {/* Quán mới chỉ có dòng chủ quán: nhắc tạo tài khoản đầu tiên. */}
      {!rows.some((r) => r.role !== "owner") && (
        <p className="rounded-lg border border-dashed border-hairline-strong px-md py-xl text-center text-sm text-steel">
          Chưa có nhân viên. Bấm &quot;+ Thêm nhân viên&quot; để tạo tài khoản đầu tiên.
        </p>
      )}

      <StaffDialog
        slug={slug}
        open={sua !== null}
        row={sua?.row ?? null}
        roleOptions={roleOptions}
        onClose={() => setSua(null)}
      />
      <SecretDialog slug={slug} row={doiMa} onClose={() => setDoiMa(null)} />
    </div>
  );
}

/** Bảng (máy tính) + danh sách gọn (điện thoại). Bấm dòng sửa được = Sửa thông tin. */
function Bang({
  rows,
  menu,
  onEdit,
}: {
  rows: StaffRow[];
  menu: (r: StaffRow) => React.ReactNode;
  onEdit: (r: StaffRow) => void;
}) {
  return (
    <>
      <div className="hidden rounded-lg border border-hairline-soft bg-canvas lg:block">
        <table className="w-full text-sm" data-bang-nhan-vien>
          <thead className="text-left text-xs text-steel">
            <tr className="border-b border-hairline-soft">
              <th className="px-md py-sm font-medium">Nhân viên</th>
              <th className="px-md py-sm font-medium">Vai trò</th>
              <th className="px-md py-sm font-medium">Đăng nhập bằng</th>
              <th className="px-md py-sm font-medium">Trạng thái</th>
              <th className="w-14 px-md py-sm">
                <span className="sr-only">Thao tác</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline-soft">
            {rows.map((r) => (
              <tr
                key={r.id}
                onClick={() => r.editable && onEdit(r)}
                className={cn(r.editable && "cursor-pointer hover:bg-cream-soft")}
              >
                <td className="px-md py-sm">
                  <TenNhanVien row={r} />
                </td>
                <td className="px-md py-sm">
                  <RoleBadge role={r.role} />
                </td>
                <td className="px-md py-sm text-slate">{usesPassword(r.role) ? "Mật khẩu" : "PIN 4 số"}</td>
                <td className="px-md py-sm">
                  <TrangThai active={r.active} />
                </td>
                <td className="px-md py-xs text-right" onClick={(e) => e.stopPropagation()}>
                  {menu(r)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-hairline-soft rounded-lg border border-hairline-soft bg-canvas lg:hidden">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-sm px-md py-sm">
            <button
              type="button"
              disabled={!r.editable}
              onClick={() => onEdit(r)}
              className="flex min-w-0 flex-1 items-center gap-sm text-left"
            >
              <Avatar name={r.name} />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-sm gap-y-xxs">
                  <span className="truncate font-medium text-ink">{r.name}</span>
                  <RoleBadge role={r.role} />
                </span>
                <span className="mt-xxs flex min-w-0 items-center gap-xs text-xs text-steel">
                  <span className="min-w-0 truncate">{r.email ?? "—"}</span>
                  <span aria-hidden>·</span>
                  <TrangThai active={r.active} />
                </span>
              </span>
            </button>
            {menu(r)}
          </li>
        ))}
      </ul>
    </>
  );
}

function Avatar({ name }: { name: string }) {
  return (
    <span
      aria-hidden
      className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-cream-deeper text-sm font-semibold text-primary-deep"
    >
      {initial(name)}
    </span>
  );
}

function TenNhanVien({ row }: { row: StaffRow }) {
  return (
    <span className="flex items-center gap-sm">
      <Avatar name={row.name} />
      <span className="min-w-0">
        <span className="block truncate font-medium text-ink">{row.name}</span>
        <span className="block truncate text-xs text-steel">{row.email ?? "—"}</span>
      </span>
    </span>
  );
}

function RoleBadge({ role }: { role: StaffRole }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-[10px] py-[3px] text-xs font-semibold", ROLE[role].badge)}>
      {ROLE[role].label}
    </span>
  );
}

function TrangThai({ active }: { active: boolean }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-xs whitespace-nowrap", active ? "text-status-ready" : "text-steel")}>
      <span aria-hidden className={cn("h-2 w-2 rounded-full", active ? "bg-status-ready" : "bg-muted")} />
      {active ? "Đang làm" : "Đã tắt"}
    </span>
  );
}

/** Gói một server action để gọi ngoài <form>. */
function formOf(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

/**
 * Nút ⋯ cuối dòng. Menu đặt `fixed` theo vị trí nút để không bị khung bảng cắt ở dòng cuối; cuộn / đổi cỡ cửa sổ thì đóng.
 */
function RowMenu({
  slug,
  row,
  onEdit,
  onSecret,
}: {
  slug: string;
  row: StaffRow;
  onEdit: () => void;
  onSecret: () => void;
}) {
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!pos) return;
    const close = () => setPos(null);
    const onDown = (e: MouseEvent) => {
      if (!panel.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        btn.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    panel.current?.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus();
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [pos]);

  const toggle = () => {
    if (pos) return setPos(null);
    const r = btn.current!.getBoundingClientRect();
    setPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
  };

  const run = (fn: () => void) => () => {
    setPos(null);
    fn();
  };

  const item =
    "flex w-full items-center rounded-sm px-sm py-xs text-left text-sm hover:bg-surface focus-visible:bg-surface focus-visible:outline-none";

  return (
    <>
      <button
        ref={btn}
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-haspopup="menu"
        aria-expanded={!!pos}
        aria-label={`Thao tác với ${row.name}`}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-slate hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
      >
        <MoreHorizontal className="h-5 w-5" aria-hidden />
      </button>
      {pos && (
        <div
          ref={panel}
          role="menu"
          aria-label={row.name}
          style={{ top: pos.top, right: pos.right }}
          className="fixed z-50 w-48 rounded-md border border-hairline-soft bg-canvas p-xxs shadow-modal"
        >
          <button type="button" role="menuitem" onClick={run(onEdit)} className={cn(item, "text-ink")}>
            Sửa thông tin
          </button>
          <button type="button" role="menuitem" onClick={run(onSecret)} className={cn(item, "text-ink")}>
            {usesPassword(row.role) ? "Đổi mật khẩu" : "Đổi PIN"}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={run(() =>
              start(async () => {
                await setStaffActive(formOf({ slug, id: row.id, active: row.active ? "false" : "true" }));
              })
            )}
            className={cn(item, "text-ink")}
          >
            {row.active ? "Tắt tài khoản" : "Bật lại"}
          </button>
          <div className="my-xxs border-t border-hairline-soft" />
          <button
            type="button"
            role="menuitem"
            onClick={run(() => {
              if (!confirm(`Xóa "${row.name}"? Thao tác không hoàn tác được.`)) return;
              start(async () => {
                await deleteStaff(formOf({ slug, id: row.id }));
              });
            })}
            className={cn(item, "text-status-late")}
          >
            Xóa
          </button>
        </div>
      )}
    </>
  );
}

/** Khung hộp thoại dùng chung: tiêu đề + ✕, thân cuộn được, câu lỗi, hàng nút cuối. */
function DialogShell({
  open,
  title,
  titleId,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  titleId: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onClose={onClose}
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-lg border border-hairline-soft bg-canvas p-0 text-ink shadow-modal backdrop:bg-ink/40"
    >
      {open && (
        <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
          <div className="flex items-center justify-between gap-md border-b border-hairline-soft px-lg py-md">
            <h2 id={titleId} className="font-semibold text-xl">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng"
              className="grid h-9 w-9 place-items-center rounded-md text-steel hover:bg-surface"
            >
              ✕
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

function ErrorLine({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className="mt-md rounded-md bg-cream-soft px-md py-sm text-sm text-status-late">
      {error}
    </p>
  ) : null;
}

function CancelButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      className="inline-flex h-11 items-center rounded-md border border-hairline-strong px-lg text-sm text-ink hover:bg-surface"
    >
      Bỏ qua
    </button>
  );
}

/** Ô bí mật theo vai trò: Quản lý → mật khẩu ≥ 8 ký tự; vai trò trạm → PIN 4 số. Cùng tên field `secret`. */
function SecretField({ manager, label }: { manager: boolean; label: string }) {
  return (
    <label className={LABEL}>
      {label}
      {manager ? (
        <Input
          key="pw"
          name="secret"
          type="password"
          minLength={8}
          required
          autoComplete="new-password"
          placeholder="Ít nhất 8 ký tự"
        />
      ) : (
        <Input
          key="pin"
          name="secret"
          inputMode="numeric"
          pattern="\d{4}"
          maxLength={4}
          required
          autoComplete="off"
          placeholder="1234"
          className="tracking-[0.3em]"
        />
      )}
      <span className={HINT}>
        {manager ? "Quản lý đăng nhập khu quản trị bằng email + mật khẩu." : "Đăng nhập máy POS / màn bếp bằng email + PIN."}
      </span>
    </label>
  );
}

/**
 * "Thêm nhân viên" (row = null, có "Lưu & thêm mới") / "Sửa nhân viên" (email chỉ xem; đổi giữa nhóm PIN và Quản lý thì
 * bắt nhập bí mật mới). Lỗi: giữ hộp thoại, hiện câu lỗi.
 */
function StaffDialog({
  slug,
  open,
  row,
  roleOptions,
  onClose,
}: {
  slug: string;
  open: boolean;
  row: StaffRow | null;
  roleOptions: StaffRole[];
  onClose: () => void;
}) {
  const [round, setRound] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<StaffRole>("cashier");
  const themTiep = useRef(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setRole(row?.role ?? "cashier");
    setRound((r) => r + 1);
  }, [open, row]);

  const isManager = role === "manager";
  const kindChanged = !!row && (row.role === "manager") !== isManager;

  return (
    <DialogShell open={open} title={row ? "Sửa nhân viên" : "Thêm nhân viên"} titleId="nhan-vien-tieu-de" onClose={onClose}>
      <form
        key={round}
        action={async (fd) => {
          setError(null);
          const r: StaffResult = row ? await updateStaff(fd) : await createStaff(fd);
          if (!r.ok) return setError(r.error);
          if (themTiep.current) {
            setRole("cashier");
            setRound((n) => n + 1);
          } else onClose();
        }}
        className="flex min-h-0 flex-col"
      >
        <input type="hidden" name="slug" value={slug} />
        {row && <input type="hidden" name="id" value={row.id} />}
        <div className="flex flex-col gap-md overflow-y-auto px-lg py-md">
          <label className={LABEL}>
            Tên hiển thị *
            <Input name="display_name" required autoFocus defaultValue={row?.name ?? ""} placeholder="Nguyễn Thị Lan" />
          </label>

          <label className={LABEL}>
            Email {row ? "" : "*"}
            {row ? (
              <span className="flex h-11 items-center rounded-md bg-surface px-md text-ink">{row.email ?? "—"}</span>
            ) : (
              <Input name="email" type="email" required placeholder="lan@gmail.com" />
            )}
            <span className={HINT}>{row ? "Email là tên đăng nhập, không đổi được." : "Dùng làm tên đăng nhập."}</span>
          </label>

          <fieldset className="flex flex-col gap-xs text-sm text-slate">
            <legend className="mb-xxs">Vai trò *</legend>
            <div className="grid grid-cols-1 gap-xs sm:grid-cols-2">
              {roleOptions.map((v) => (
                <label
                  key={v}
                  className={cn(
                    "flex min-h-11 cursor-pointer items-start gap-sm rounded-md border px-sm py-xs",
                    role === v ? "border-primary bg-cream-soft" : "border-hairline-strong hover:bg-surface"
                  )}
                >
                  <input
                    type="radio"
                    name="role"
                    value={v}
                    checked={role === v}
                    onChange={() => setRole(v)}
                    className="mt-[3px] h-4 w-4 accent-primary"
                  />
                  <span>
                    <span className="block font-medium text-ink">{ROLE[v].label}</span>
                    <span className="block text-xs text-steel">{ROLE[v].hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {!row && <SecretField manager={isManager} label={isManager ? "Mật khẩu *" : "PIN (4 số) *"} />}
          {kindChanged && (
            <SecretField
              manager={isManager}
              label={isManager ? "Mật khẩu mới để vào khu quản trị *" : "PIN mới (4 số) *"}
            />
          )}

          <ErrorLine error={error} />
        </div>
        <div className="flex flex-wrap items-center justify-end gap-sm border-t border-hairline-soft px-lg py-md">
          <CancelButton onClose={onClose} />
          {!row && (
            <SubmitButton variant="secondary" onClick={() => (themTiep.current = true)} pendingLabel="Đang lưu…">
              Lưu &amp; thêm mới
            </SubmitButton>
          )}
          <SubmitButton onClick={() => (themTiep.current = false)} pendingLabel="Đang lưu…">
            Lưu
          </SubmitButton>
        </div>
      </form>
    </DialogShell>
  );
}

/** "Đổi PIN" (vai trò trạm) / "Đổi mật khẩu" (Quản lý). */
function SecretDialog({ slug, row, onClose }: { slug: string; row: StaffRow | null; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setError(null), [row]);
  const manager = !!row && usesPassword(row.role);

  return (
    <DialogShell
      open={row !== null}
      title={manager ? "Đổi mật khẩu" : "Đổi PIN"}
      titleId="doi-ma-tieu-de"
      onClose={onClose}
    >
      {row && (
        <form
          key={row.id}
          action={async (fd) => {
            setError(null);
            const r = await resetPin(fd);
            if (r.ok) onClose();
            else setError(r.error);
          }}
          className="flex min-h-0 flex-col"
        >
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="id" value={row.id} />
          <div className="flex flex-col gap-md overflow-y-auto px-lg py-md">
            <p className="text-sm text-slate">
              <span className="font-medium text-ink">{row.name}</span> · {row.email ?? "—"}
            </p>
            <SecretField manager={manager} label={manager ? "Mật khẩu mới *" : "PIN mới (4 số) *"} />
            <ErrorLine error={error} />
          </div>
          <div className="flex items-center justify-end gap-sm border-t border-hairline-soft px-lg py-md">
            <CancelButton onClose={onClose} />
            <SubmitButton pendingLabel="Đang lưu…">Lưu</SubmitButton>
          </div>
        </form>
      )}
    </DialogShell>
  );
}
