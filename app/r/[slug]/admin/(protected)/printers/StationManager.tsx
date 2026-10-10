"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";
import { MAX_COPIES, STATION_NAME_MAX } from "@/lib/print/stations";
import { saveStation, deleteStation } from "./actions";

export type StationRow = { id: string; name: string; isDefault: boolean; copies: number; perItem: boolean };
export type CategoryRow = { id: string; name: string; stationId: string | null };

/**
 * Tab "Bếp / Bar" (P37, PRINT-19) — như CUKCUK "Danh mục › Bếp/Bar", KiotViet "Máy in bar bếp": mỗi nơi nhận các nhóm món tích
 * vào nó; nhóm chưa gán in ra Bếp chính. Chọn máy in cho từng nơi làm trên app tại quán.
 */
export function StationManager({
  slug,
  stations,
  categories,
}: {
  slug: string;
  /** Bếp chính đầu tiên (id "" khi quán chưa lưu lần nào). */
  stations: StationRow[];
  categories: CategoryRow[];
}) {
  const [editing, setEditing] = useState<StationRow | "new" | null>(null);
  const others = stations.filter((s) => !s.isDefault);
  const nameOf = new Map(others.map((s) => [s.id, s.name]));
  const groupsOf = (s: StationRow) =>
    s.isDefault
      ? "Các nhóm còn lại (mặc định)"
      : categories.filter((c) => c.stationId === s.id).map((c) => c.name).join(", ") || "Chưa gán nhóm món";

  return (
    <section className="mt-lg">
      <div className="flex flex-wrap items-end justify-between gap-md">
        <div>
          <h2 className="text-lg font-semibold text-ink">Bếp / Bar</h2>
          <p className="mt-xxs text-sm text-steel">
            Món thuộc nhóm nào sẽ in phiếu ra bếp/bar đó. Món chưa gán in ra {stations[0].name}. Chọn máy in cho từng nơi ở
            app TechMenu Thu ngân › Cài đặt máy in.
          </p>
        </div>
        <Button size="sm" className="max-md:h-11" onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" aria-hidden />
          Thêm bếp/bar
        </Button>
      </div>

      <div className="mt-md rounded-lg border border-hairline-soft bg-canvas shadow-card">
        <table className="hidden w-full text-left text-sm md:table" data-bep-bar>
          <thead className="border-b border-hairline-soft text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-md py-sm font-medium">Tên</th>
              <th className="px-sm py-sm font-medium">Nhóm món</th>
              <th className="px-sm py-sm text-right font-medium">Số liên</th>
              <th className="px-sm py-sm font-medium">In từng món</th>
              <th className="px-md py-sm">
                <span className="sr-only">Thao tác</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline-soft">
            {stations.map((s) => (
              <tr key={s.id || "default"}>
                <td className="px-md py-sm font-medium text-ink">{s.name}</td>
                <td className={cn("px-sm py-sm", s.isDefault ? "text-steel" : "text-slate")}>{groupsOf(s)}</td>
                <td className="px-sm py-sm text-right tabular-nums text-slate">{s.copies}</td>
                <td className="px-sm py-sm text-slate">{s.perItem ? "Có" : "—"}</td>
                <td className="px-md py-sm">
                  <RowActions slug={slug} station={s} onEdit={() => setEditing(s)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <ul className="divide-y divide-hairline-soft md:hidden">
          {stations.map((s) => (
            <li key={s.id || "default"} className="flex items-start gap-sm px-md py-sm">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-ink">{s.name}</p>
                <p className="text-sm text-slate">{groupsOf(s)}</p>
                <p className="text-xs text-steel">
                  {s.copies} liên{s.perItem ? " · in từng món" : ""}
                </p>
              </div>
              <RowActions slug={slug} station={s} onEdit={() => setEditing(s)} />
            </li>
          ))}
        </ul>
      </div>

      {others.length === 0 && (
        <p className="mt-md text-sm text-steel">
          Quán có quầy pha chế riêng? Thêm bếp/bar để in đồ uống ra máy in ở quầy.
        </p>
      )}

      <StationDialog
        key={editing === null ? "dong" : editing === "new" ? "moi" : editing.id || "default"}
        slug={slug}
        station={editing === "new" ? null : editing}
        open={editing !== null}
        onClose={() => setEditing(null)}
        categories={categories}
        nameOf={nameOf}
      />
    </section>
  );
}

function RowActions({ slug, station, onEdit }: { slug: string; station: StationRow; onEdit: () => void }) {
  return (
    <div className="flex items-center justify-end gap-xxs">
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Sửa ${station.name}`}
        className="inline-flex h-9 items-center rounded-md px-sm text-sm text-primary hover:bg-surface"
      >
        Sửa
      </button>
      {!station.isDefault && (
        <form
          action={deleteStation}
          onSubmit={(e) => {
            if (!confirm(`Xóa "${station.name}"? Các nhóm món của nó sẽ in ra Bếp chính.`)) e.preventDefault();
          }}
        >
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="id" value={station.id} />
          <button
            type="submit"
            aria-label={`Xóa ${station.name}`}
            className="inline-flex h-9 items-center rounded-md px-sm text-sm text-status-late hover:bg-surface"
          >
            Xóa
          </button>
        </form>
      )}
    </div>
  );
}

function StationDialog({
  slug,
  station,
  open,
  onClose,
  categories,
  nameOf,
}: {
  slug: string;
  station: StationRow | null;
  open: boolean;
  onClose: () => void;
  categories: CategoryRow[];
  nameOf: Map<string, string>;
}) {
  const isDefault = station?.isDefault ?? false;
  const title = station ? `Sửa ${station.name}` : "Thêm bếp/bar";
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <form
        action={async (fd) => {
          await saveStation(fd);
          onClose();
        }}
        className="flex flex-col gap-md"
      >
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="id" value={station ? (isDefault ? "default" : station.id) : ""} />
        <label className="flex flex-col gap-xxs text-sm text-slate">
          Tên
          <Input
            name="name"
            required
            autoFocus
            maxLength={STATION_NAME_MAX}
            defaultValue={station?.name ?? ""}
            placeholder="Quầy pha chế"
          />
        </label>

        {isDefault ? (
          <p className="rounded-md bg-surface px-md py-sm text-sm text-slate">
            Bếp chính nhận mọi nhóm món chưa gán cho bếp/bar khác.
          </p>
        ) : (
          <fieldset className="flex flex-col gap-xs">
            <legend className="text-sm text-slate">Nhóm món</legend>
            {categories.length === 0 && <p className="text-sm text-steel">Thực đơn chưa có nhóm món nào.</p>}
            <div className="grid max-h-60 gap-xxs overflow-y-auto sm:grid-cols-2">
              {categories.map((c) => {
                const other = c.stationId && c.stationId !== station?.id ? nameOf.get(c.stationId) : null;
                return (
                  <label key={c.id} className="flex min-h-10 items-center gap-sm rounded-md px-xs text-sm text-ink hover:bg-surface">
                    <input
                      type="checkbox"
                      name="category_ids"
                      value={c.id}
                      defaultChecked={!!station && c.stationId === station.id}
                      className="h-4 w-4 accent-primary"
                    />
                    <span className="min-w-0">
                      {c.name}
                      {other && <span className="text-steel"> (đang ở {other})</span>}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}

        <div className="flex flex-wrap items-end gap-md">
          <label className="flex flex-col gap-xxs text-sm text-slate">
            Số liên
            <select
              name="copies"
              defaultValue={String(station?.copies ?? 1)}
              className="h-11 rounded-md border border-hairline-strong bg-canvas px-md text-base text-ink sm:text-sm"
            >
              {Array.from({ length: MAX_COPIES }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {i + 1} liên
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-h-11 items-center gap-sm text-sm text-ink">
            <input type="checkbox" name="per_item" defaultChecked={station?.perItem ?? false} className="h-4 w-4 accent-primary" />
            In riêng từng món (mỗi món một phiếu)
          </label>
        </div>

        <div className="flex justify-end gap-sm">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Hủy
          </Button>
          <SubmitButton size="sm" pendingLabel="Đang lưu…">
            Lưu
          </SubmitButton>
        </div>
      </form>
    </Modal>
  );
}
