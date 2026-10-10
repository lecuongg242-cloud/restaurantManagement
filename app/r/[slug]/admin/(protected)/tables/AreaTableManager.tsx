"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, MoreHorizontal, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { ScrollRow } from "@/components/ui/scroll-row";
import { cn } from "@/lib/utils";
import type { Area, Table } from "@/lib/tables/types";
import { DEFAULT_SEATS, nameKey } from "@/lib/tables/bulk";
import {
  createArea,
  renameArea,
  deleteArea,
  reorderArea,
  deleteTable,
  reorderTable,
  moveTables,
  setTablesSeats,
  deleteTables,
} from "./actions";
import { BulkAddDialog, ImportDialog, TableFormDialog, selectCls } from "./TableDialogs";

/** "all" = mọi bàn, "none" = Chưa xếp khu, còn lại = id khu. */
type AreaKey = string;

/**
 * Bàn & QR (P36, TABLE-07…10) — theo KiotViet "Phòng/bàn": khu vực cột trái, bảng bàn bên phải; Thêm bàn / Thêm hàng
 * loạt / Nhập Excel; tích nhiều bàn → Chuyển khu / Đổi số ghế / In QR / Xóa. Điện thoại: khu thành chip cuộn ngang,
 * bảng thành danh sách.
 */
export function AreaTableManager({
  slug,
  areas,
  tables,
  children,
}: {
  slug: string;
  areas: Area[];
  tables: Table[];
  children?: ReactNode;
}) {
  const [sel, setSel] = useState<AreaKey>("all");
  const [query, setQuery] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<null | "add" | "bulk" | "import">(null);
  const [editing, setEditing] = useState<Table | null>(null);
  const [addingArea, setAddingArea] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);

  // Khu đang xem bị xóa → về "Tất cả"; bàn đã chọn mà không còn → bỏ khỏi danh sách chọn.
  const areaKey: AreaKey = sel === "all" || sel === "none" || areas.some((a) => a.id === sel) ? sel : "all";
  const tableIds = useMemo(() => new Set(tables.map((t) => t.id)), [tables]);
  const selected = [...checked].filter((id) => tableIds.has(id));

  const areaName = useMemo(() => new Map(areas.map((a) => [a.id, a.name])), [areas]);
  const areaIndex = useMemo(() => new Map(areas.map((a, i) => [a.id, i])), [areas]);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of tables) m.set(t.area_id ?? "none", (m.get(t.area_id ?? "none") ?? 0) + 1);
    return m;
  }, [tables]);

  const visible = useMemo(() => {
    const q = nameKey(query);
    const rows = tables.filter(
      (t) =>
        (areaKey === "all" || (t.area_id ?? "none") === areaKey) && (!q || nameKey(t.name).includes(q))
    );
    // "Tất cả": theo thứ tự khu (Chưa xếp khu cuối), trong khu giữ sort_order từ server.
    if (areaKey === "all") {
      const idx = (t: Table) => (t.area_id ? (areaIndex.get(t.area_id) ?? 1e6) : 1e6 + 1);
      return rows.map((t, i) => ({ t, i })).sort((a, b) => idx(a.t) - idx(b.t) || a.i - b.i).map((x) => x.t);
    }
    return rows;
  }, [tables, areaKey, query, areaIndex]);

  const canReorder = areaKey !== "all" && !query;
  const currentArea = areas.find((a) => a.id === areaKey) ?? null;
  const defaultAreaId = currentArea?.id ?? (areaKey === "none" ? "" : (areas[0]?.id ?? ""));
  const title = areaKey === "all" ? "Tất cả bàn" : areaKey === "none" ? "Chưa xếp khu" : (currentArea?.name ?? "");
  const allVisibleChecked = visible.length > 0 && visible.every((t) => checked.has(t.id));
  const qrHref = (ids: string[]) => `/r/${slug}/print/qr${ids.length ? `?ids=${ids.join(",")}` : ""}`;

  const toggle = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () =>
    setChecked((prev) => {
      const next = new Set(prev);
      for (const t of visible) {
        if (allVisibleChecked) next.delete(t.id);
        else next.add(t.id);
      }
      return next;
    });
  const clearChecked = () => setChecked(new Set());

  const areaItems: { key: AreaKey; label: string; count: number; area: Area | null }[] = [
    { key: "all", label: "Tất cả", count: tables.length, area: null },
    ...areas.map((a) => ({ key: a.id, label: a.name, count: counts.get(a.id) ?? 0, area: a })),
    ...((counts.get("none") ?? 0) > 0
      ? [{ key: "none", label: "Chưa xếp khu", count: counts.get("none") ?? 0, area: null }]
      : []),
  ];

  const newAreaForm = (
    <form
      action={async (fd) => {
        await createArea(fd);
        setAddingArea(false);
      }}
      className="flex items-center gap-xs"
    >
      <input type="hidden" name="slug" value={slug} />
      <Input name="name" required autoFocus maxLength={40} placeholder="Tên khu, vd Tầng 1" className="h-9 min-w-0 flex-1" />
      <SubmitButton size="sm" pendingLabel="…">
        Lưu
      </SubmitButton>
      <Button type="button" variant="secondary" size="sm" onClick={() => setAddingArea(false)}>
        Hủy
      </Button>
    </form>
  );

  const renameForm = (a: Area) => (
    <form
      action={async (fd) => {
        await renameArea(fd);
        setRenaming(null);
      }}
      className="flex items-center gap-xs"
    >
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="id" value={a.id} />
      <Input name="name" defaultValue={a.name} required autoFocus maxLength={40} className="h-9 min-w-0 flex-1" />
      <SubmitButton size="sm" pendingLabel="…">
        Lưu
      </SubmitButton>
      <Button type="button" variant="secondary" size="sm" onClick={() => setRenaming(null)}>
        Hủy
      </Button>
    </form>
  );

  const areaMenu = (a: Area, i: number) => (
    <Menu label={`Thao tác khu ${a.name}`}>
      <MenuButton onClick={() => setRenaming(a.id)}>Sửa tên</MenuButton>
      <MenuForm action={reorderArea} fields={{ slug, id: a.id, dir: "up" }} disabled={i === 0}>
        Chuyển lên
      </MenuForm>
      <MenuForm action={reorderArea} fields={{ slug, id: a.id, dir: "down" }} disabled={i === areas.length - 1}>
        Chuyển xuống
      </MenuForm>
      <MenuForm
        action={deleteArea}
        fields={{ slug, id: a.id }}
        danger
        confirm={`Xóa khu vực "${a.name}"? Các bàn trong khu sẽ chuyển sang "Chưa xếp khu".`}
      >
        Xóa khu
      </MenuForm>
    </Menu>
  );

  const rowMenuItems = (t: Table, i: number) => (
    <>
      <MenuLink href={qrHref([t.id])}>Xem / In QR</MenuLink>
      <MenuButton onClick={() => setEditing(t)}>Sửa</MenuButton>
      {canReorder && (
        <>
          <MenuForm action={reorderTable} fields={{ slug, id: t.id, area_id: t.area_id ?? "", dir: "up" }} disabled={i === 0}>
            Chuyển lên
          </MenuForm>
          <MenuForm
            action={reorderTable}
            fields={{ slug, id: t.id, area_id: t.area_id ?? "", dir: "down" }}
            disabled={i === visible.length - 1}
          >
            Chuyển xuống
          </MenuForm>
        </>
      )}
      <MenuForm action={deleteTable} fields={{ slug, id: t.id }} danger confirm={`Xóa bàn "${t.name}"? Mã QR của bàn sẽ mất hiệu lực.`}>
        Xóa
      </MenuForm>
    </>
  );

  return (
    <div className="w-full">
      {/* Đầu trang */}
      <div className="flex flex-wrap items-end justify-between gap-md">
        <div>
          <h1 className="font-semibold text-2xl text-ink">Bàn & QR</h1>
          <p className="mt-xxs text-sm text-steel">Khai báo khu vực và bàn. Mỗi bàn có mã QR riêng để khách quét gọi món.</p>
        </div>
        <div className="flex flex-wrap gap-sm">
          {tables.length > 0 && (
            <Button asChild variant="secondary" size="sm" className="max-md:h-11">
              <Link href={qrHref([])} target="_blank" rel="noopener">
                In QR ({tables.length} bàn)
              </Link>
            </Button>
          )}
          <Button variant="secondary" size="sm" className="max-md:h-11" onClick={() => setDialog("import")}>
            Nhập Excel
          </Button>
          <Button variant="secondary" size="sm" className="max-md:h-11" onClick={() => setDialog("bulk")}>
            Thêm hàng loạt
          </Button>
          <Button size="sm" className="max-md:h-11" onClick={() => setDialog("add")}>
            <Plus className="h-4 w-4" aria-hidden />
            Thêm bàn
          </Button>
        </div>
      </div>

      {children}

      <div className="mt-lg flex flex-col gap-md md:flex-row md:items-start">
        {/* Khu vực — máy tính: cột trái */}
        <aside className="hidden w-60 shrink-0 rounded-lg border border-hairline-soft bg-canvas p-sm shadow-card md:block">
          <div className="flex items-center justify-between px-xs pb-xs">
            <span className="text-xs font-medium uppercase tracking-wide text-muted">Khu vực</span>
            <button
              type="button"
              aria-label="Thêm khu vực"
              onClick={() => setAddingArea(true)}
              className="grid h-8 w-8 place-items-center rounded-md text-primary hover:bg-surface"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          {addingArea && <div className="px-xs pb-sm">{newAreaForm}</div>}
          <ul className="flex flex-col gap-xxs" data-khu-vuc>
            {areaItems.map((it) => {
              const i = it.area ? areas.indexOf(it.area) : -1;
              if (it.area && renaming === it.area.id) {
                return (
                  <li key={it.key} className="px-xs py-xxs">
                    {renameForm(it.area)}
                  </li>
                );
              }
              const active = areaKey === it.key;
              return (
                <li
                  key={it.key}
                  className={cn("group flex items-center rounded-md", active ? "bg-cream" : "hover:bg-surface")}
                >
                  <button
                    type="button"
                    onClick={() => setSel(it.key)}
                    aria-current={active ? "true" : undefined}
                    className={cn(
                      "flex h-9 min-w-0 flex-1 items-center justify-between gap-sm px-sm text-left text-sm",
                      active ? "font-medium text-ink" : "text-slate"
                    )}
                  >
                    <span className="truncate">{it.label}</span>
                    <span className="tabular-nums text-xs text-steel">{it.count}</span>
                  </button>
                  {it.area && <div className="pr-xxs">{areaMenu(it.area, i)}</div>}
                </li>
              );
            })}
          </ul>
        </aside>

        {/* Khu vực — điện thoại: chip cuộn ngang */}
        <div className="md:hidden">
          <div className="flex items-center gap-xs">
            <ScrollRow className="min-w-0 flex-1 gap-xs">
              {areaItems.map((it) => (
                <button
                  key={it.key}
                  type="button"
                  onClick={() => setSel(it.key)}
                  className={cn(
                    "h-11 shrink-0 whitespace-nowrap rounded-full border px-md text-sm",
                    areaKey === it.key
                      ? "border-primary bg-primary text-primary-fg"
                      : "border-hairline-strong bg-canvas text-slate"
                  )}
                >
                  {it.label} · {it.count}
                </button>
              ))}
            </ScrollRow>
            <button
              type="button"
              aria-label="Thêm khu vực"
              onClick={() => setAddingArea(true)}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-hairline-strong text-primary"
            >
              <Plus className="h-4 w-4" />
            </button>
            {currentArea && areaMenu(currentArea, areas.indexOf(currentArea))}
          </div>
          {addingArea && <div className="mt-sm">{newAreaForm}</div>}
          {currentArea && renaming === currentArea.id && <div className="mt-sm">{renameForm(currentArea)}</div>}
        </div>

        {/* Bàn */}
        <section className="min-w-0 flex-1 rounded-lg border border-hairline-soft bg-canvas shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-sm border-b border-hairline-soft px-md py-sm">
            <h2 className="text-base font-semibold text-ink">
              {title} <span className="text-sm font-normal text-steel">· {visible.length} bàn</span>
            </h2>
            <label className="relative w-full sm:w-56">
              <Search className="pointer-events-none absolute left-sm top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Tìm bàn…"
                aria-label="Tìm bàn"
                className="h-9 pl-9"
              />
            </label>
          </div>

          {selected.length > 0 && (
            <SelectionBar
              slug={slug}
              areas={areas}
              ids={selected}
              qrHref={qrHref(selected)}
              onDone={clearChecked}
            />
          )}

          {visible.length === 0 ? (
            <EmptyState
              kind={tables.length === 0 ? "none" : query ? "search" : "area"}
              query={query}
              onBulk={() => setDialog("bulk")}
              onImport={() => setDialog("import")}
            />
          ) : (
            <>
              {/* Máy tính: bảng */}
              <table className="hidden w-full text-left text-sm md:table" data-bang-ban>
                <thead className="border-b border-hairline-soft text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="w-10 py-sm pl-md">
                      <Checkbox checked={allVisibleChecked} onChange={toggleAll} label="Chọn tất cả bàn đang hiện" />
                    </th>
                    <th className="px-sm py-sm font-medium">Tên bàn</th>
                    <th className="px-sm py-sm font-medium">Khu vực</th>
                    <th className="px-sm py-sm text-right font-medium">Số ghế</th>
                    <th className="px-sm py-sm font-medium">Mã QR</th>
                    {canReorder && <th className="px-sm py-sm font-medium">Thứ tự</th>}
                    <th className="py-sm pr-md text-right font-medium">
                      <span className="sr-only">Thao tác</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline-soft">
                  {visible.map((t, i) => (
                    <tr key={t.id} className={cn("hover:bg-surface/60", checked.has(t.id) && "bg-cream/50")}>
                      <td className="py-xs pl-md">
                        <Checkbox checked={checked.has(t.id)} onChange={() => toggle(t.id)} label={`Chọn ${t.name}`} />
                      </td>
                      <td className="px-sm py-xs font-medium text-ink">{t.name}</td>
                      <td className="px-sm py-xs text-slate">{t.area_id ? areaName.get(t.area_id) : "Chưa xếp khu"}</td>
                      <td className="px-sm py-xs text-right tabular-nums text-slate">{t.seats}</td>
                      <td className="px-sm py-xs">
                        <Link href={qrHref([t.id])} target="_blank" rel="noopener" className="text-primary underline-offset-4 hover:underline">
                          Xem / In
                        </Link>
                      </td>
                      {canReorder && (
                        <td className="px-sm py-xs">
                          <div className="flex items-center">
                            {(["up", "down"] as const).map((dir) => (
                              <form action={reorderTable} key={dir}>
                                <input type="hidden" name="slug" value={slug} />
                                <input type="hidden" name="id" value={t.id} />
                                <input type="hidden" name="area_id" value={t.area_id ?? ""} />
                                <input type="hidden" name="dir" value={dir} />
                                <button
                                  type="submit"
                                  disabled={dir === "up" ? i === 0 : i === visible.length - 1}
                                  aria-label={`${dir === "up" ? "Chuyển lên" : "Chuyển xuống"} ${t.name}`}
                                  className="grid h-8 w-8 place-items-center rounded-md text-steel hover:bg-surface disabled:opacity-30"
                                >
                                  {dir === "up" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                </button>
                              </form>
                            ))}
                          </div>
                        </td>
                      )}
                      <td className="py-xs pr-md">
                        <div className="flex items-center justify-end gap-xxs">
                          <button
                            type="button"
                            onClick={() => setEditing(t)}
                            className="inline-flex h-8 items-center rounded-md px-sm text-primary hover:bg-surface"
                          >
                            Sửa
                          </button>
                          <form
                            action={deleteTable}
                            onSubmit={(e) => {
                              if (!confirm(`Xóa bàn "${t.name}"? Mã QR của bàn sẽ mất hiệu lực.`)) e.preventDefault();
                            }}
                          >
                            <input type="hidden" name="slug" value={slug} />
                            <input type="hidden" name="id" value={t.id} />
                            <button type="submit" className="inline-flex h-8 items-center rounded-md px-sm text-status-late hover:bg-surface">
                              Xóa
                            </button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Điện thoại: danh sách */}
              <ul className="divide-y divide-hairline-soft md:hidden">
                {visible.map((t, i) => (
                  <li key={t.id} className={cn("flex items-center gap-sm px-md py-xs", checked.has(t.id) && "bg-cream/50")}>
                    <Checkbox checked={checked.has(t.id)} onChange={() => toggle(t.id)} label={`Chọn ${t.name}`} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-ink">{t.name}</p>
                      <p className="truncate text-xs text-steel">
                        {t.area_id ? areaName.get(t.area_id) : "Chưa xếp khu"} · {t.seats} ghế
                      </p>
                    </div>
                    <Menu label={`Thao tác bàn ${t.name}`} size="lg">
                      {rowMenuItems(t, i)}
                    </Menu>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>

      <TableFormDialog
        slug={slug}
        areas={areas}
        open={dialog === "add" || editing !== null}
        onClose={() => {
          setDialog(null);
          setEditing(null);
        }}
        table={editing}
        defaultAreaId={defaultAreaId}
      />
      <BulkAddDialog
        slug={slug}
        areas={areas}
        open={dialog === "bulk"}
        onClose={() => setDialog(null)}
        defaultAreaId={defaultAreaId}
        onDone={(id) => {
          setDialog(null);
          setQuery("");
          setSel(id || "none");
        }}
      />
      <ImportDialog slug={slug} open={dialog === "import"} onClose={() => setDialog(null)} />
    </div>
  );
}

/** Thanh "Đã chọn N bàn" (TABLE-09). */
function SelectionBar({
  slug,
  areas,
  ids,
  qrHref,
  onDone,
}: {
  slug: string;
  areas: Area[];
  ids: string[];
  qrHref: string;
  onDone: () => void;
}) {
  const hidden = (
    <>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="ids" value={ids.join(",")} />
    </>
  );
  return (
    <div
      className="flex flex-wrap items-center gap-sm border-b border-hairline-soft bg-cream/60 px-md py-sm text-sm"
      role="region"
      aria-label="Thao tác bàn đã chọn"
    >
      <span className="font-medium text-ink">Đã chọn {ids.length} bàn</span>
      <form
        action={async (fd) => {
          await moveTables(fd);
          onDone();
        }}
        className="flex items-center gap-xs"
      >
        {hidden}
        <select name="area_id" aria-label="Chuyển sang khu" className={`${selectCls} w-40`} defaultValue={areas[0]?.id ?? ""}>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
          <option value="">Chưa xếp khu</option>
        </select>
        <SubmitButton variant="secondary" size="sm" pendingLabel="Đang chuyển…">
          Chuyển khu
        </SubmitButton>
      </form>
      <form
        action={async (fd) => {
          await setTablesSeats(fd);
          onDone();
        }}
        className="flex items-center gap-xs"
      >
        {hidden}
        <Input name="seats" type="number" min={1} max={999} defaultValue={DEFAULT_SEATS} aria-label="Số ghế mới" className="h-9 w-16" />
        <SubmitButton variant="secondary" size="sm" pendingLabel="Đang lưu…">
          Đổi số ghế
        </SubmitButton>
      </form>
      <Button asChild variant="secondary" size="sm">
        <Link href={qrHref} target="_blank" rel="noopener">
          In QR
        </Link>
      </Button>
      <form
        action={async (fd) => {
          await deleteTables(fd);
          onDone();
        }}
        onSubmit={(e) => {
          if (!confirm(`Xóa ${ids.length} bàn đã chọn? Mã QR của các bàn này sẽ mất hiệu lực.`)) e.preventDefault();
        }}
      >
        {hidden}
        <SubmitButton variant="secondary" size="sm" pendingLabel="Đang xóa…" className="text-status-late">
          Xóa
        </SubmitButton>
      </form>
      <Button type="button" variant="link" size="sm" onClick={onDone}>
        Bỏ chọn
      </Button>
    </div>
  );
}

function EmptyState({
  kind,
  query,
  onBulk,
  onImport,
}: {
  kind: "none" | "area" | "search";
  query: string;
  onBulk: () => void;
  onImport: () => void;
}) {
  if (kind === "search") {
    return <p className="px-md py-xl text-center text-sm text-steel">Không có bàn nào tên chứa “{query}”.</p>;
  }
  return (
    <div className="flex flex-col items-center gap-md px-md py-xl text-center">
      <p className="text-sm text-steel">
        {kind === "none" ? (
          <>
            Chưa có bàn nào. Tạo nhanh bằng <b className="font-medium text-ink">Thêm hàng loạt</b> (ví dụ Bàn 1 → Bàn 20)
            hoặc <b className="font-medium text-ink">Nhập Excel</b>.
          </>
        ) : (
          "Khu này chưa có bàn."
        )}
      </p>
      <div className="flex flex-wrap justify-center gap-sm">
        <Button size="sm" onClick={onBulk}>
          Thêm hàng loạt
        </Button>
        {kind === "none" && (
          <Button variant="secondary" size="sm" onClick={onImport}>
            Nhập Excel
          </Button>
        )}
      </div>
    </div>
  );
}

function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <label className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center">
      <input type="checkbox" checked={checked} onChange={onChange} aria-label={label} className="h-4 w-4 accent-primary" />
    </label>
  );
}

// ---- Menu ⋯ (khu vực, dòng bàn trên điện thoại) ----------------------------------

function Menu({ label, children, size = "sm" }: { label: string; children: ReactNode; size?: "sm" | "lg" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "grid place-items-center rounded-md text-steel hover:bg-surface",
          size === "lg" ? "h-11 w-11" : "h-8 w-8"
        )}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <div
          role="menu"
          onClick={(e) => {
            // Bấm một mục (không phải ô nhập) → đóng menu.
            if ((e.target as HTMLElement).closest("button,a")) setTimeout(() => setOpen(false), 0);
          }}
          className="absolute right-0 top-full z-30 mt-xxs flex min-w-40 flex-col rounded-md border border-hairline-soft bg-canvas py-xxs shadow-modal"
        >
          {children}
        </div>
      )}
    </div>
  );
}

const menuItemCls =
  "flex h-10 w-full items-center px-md text-left text-sm text-ink hover:bg-surface disabled:pointer-events-none disabled:opacity-40";

function MenuButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" role="menuitem" onClick={onClick} className={menuItemCls}>
      {children}
    </button>
  );
}

function MenuLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} target="_blank" rel="noopener" role="menuitem" className={menuItemCls}>
      {children}
    </Link>
  );
}

function MenuForm({
  action,
  fields,
  children,
  disabled,
  danger,
  confirm: confirmMsg,
}: {
  action: (fd: FormData) => void | Promise<void>;
  fields: Record<string, string>;
  children: ReactNode;
  disabled?: boolean;
  danger?: boolean;
  confirm?: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (confirmMsg && !confirm(confirmMsg)) e.preventDefault();
      }}
    >
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <button type="submit" role="menuitem" disabled={disabled} className={cn(menuItemCls, danger && "text-status-late")}>
        {children}
      </button>
    </form>
  );
}
