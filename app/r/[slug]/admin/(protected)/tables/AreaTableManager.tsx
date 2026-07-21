"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import type { Area, Table } from "@/lib/tables/types";
import {
  createArea,
  renameArea,
  deleteArea,
  reorderArea,
  createTable,
  updateTable,
  deleteTable,
  reorderTable,
} from "./actions";

type Group = { area: Area | null; tables: Table[] };

const selectCls =
  "h-9 rounded-md border border-hairline-strong bg-canvas px-md text-sm text-ink focus-visible:border-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary";

/** Cột khu vực + lưới bàn. Thêm/sửa/xóa/đổi thứ tự khu vực & bàn (server action). */
export function AreaTableManager({
  slug,
  areas,
  groups,
}: {
  slug: string;
  areas: Area[];
  groups: Group[];
}) {
  const [editingArea, setEditingArea] = useState<string | null>(null);
  const [editingTable, setEditingTable] = useState<string | null>(null);

  return (
    <div className="mt-lg flex flex-col gap-lg">
      {/* Thêm khu vực + thêm bàn */}
      <div className="grid gap-md sm:grid-cols-2">
        <Card className="p-md">
          <form action={createArea} className="flex items-end gap-sm">
            <input type="hidden" name="slug" value={slug} />
            <label className="flex flex-1 flex-col gap-xxs text-sm text-slate">
              Khu vực mới
              <Input name="name" required placeholder="Tầng 1" />
            </label>
            <SubmitButton size="sm" pendingLabel="Đang thêm…">
              Thêm khu
            </SubmitButton>
          </form>
        </Card>

        <Card className="p-md">
          <form action={createTable} className="flex flex-wrap items-end gap-sm">
            <input type="hidden" name="slug" value={slug} />
            <label className="flex flex-col gap-xxs text-sm text-slate">
              Bàn mới
              <Input name="name" required placeholder="B1" className="w-24" />
            </label>
            <label className="flex flex-col gap-xxs text-sm text-slate">
              Khu vực
              <select name="area_id" defaultValue="" className={selectCls}>
                <option value="">Chưa xếp khu</option>
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-xxs text-sm text-slate">
              Số ghế
              <Input
                name="seats"
                type="number"
                min={1}
                defaultValue={2}
                className="w-20"
              />
            </label>
            <SubmitButton size="sm" pendingLabel="Đang thêm…">
              Thêm bàn
            </SubmitButton>
          </form>
        </Card>
      </div>

      {/* Khu vực + bàn */}
      <div className="flex flex-col gap-lg">
        {groups.map((g, gi) => {
          const area = g.area;
          const isFirst = gi === 0;
          const isLast = area ? gi === areas.length - 1 : false;
          return (
            <section
              key={area?.id ?? "unassigned"}
              className="rounded-lg border border-hairline-soft p-md"
            >
              <div className="flex flex-wrap items-center justify-between gap-sm">
                {area && editingArea === area.id ? (
                  <form
                    action={renameArea}
                    className="flex items-center gap-xs"
                    onSubmit={() => setEditingArea(null)}
                  >
                    <input type="hidden" name="slug" value={slug} />
                    <input type="hidden" name="id" value={area.id} />
                    <Input name="name" defaultValue={area.name} autoFocus required className="h-9 w-44" />
                    <Button type="submit" size="sm">Lưu</Button>
                    <Button type="button" variant="secondary" size="sm" onClick={() => setEditingArea(null)}>
                      Hủy
                    </Button>
                  </form>
                ) : (
                  <div className="flex items-center gap-sm">
                    <h2 className="font-display text-lg text-ink">
                      {area ? area.name : "Chưa xếp khu"}
                    </h2>
                    <span className="text-xs text-steel">{g.tables.length} bàn</span>
                    {area && (
                      <Button type="button" variant="link" size="sm" onClick={() => setEditingArea(area.id)}>
                        Sửa tên
                      </Button>
                    )}
                  </div>
                )}

                {area && (
                  <div className="flex items-center gap-xxs">
                    <ReorderButtons
                      action={reorderArea}
                      slug={slug}
                      id={area.id}
                      isFirst={isFirst}
                      isLast={isLast}
                    />
                    <form
                      action={deleteArea}
                      onSubmit={(e) => {
                        if (!confirm(`Xóa khu vực "${area.name}"? Bàn sẽ chuyển sang "Chưa xếp khu".`))
                          e.preventDefault();
                      }}
                    >
                      <input type="hidden" name="slug" value={slug} />
                      <input type="hidden" name="id" value={area.id} />
                      <Button type="submit" variant="link" size="sm" className="text-status-late">
                        Xóa
                      </Button>
                    </form>
                  </div>
                )}
              </div>

              <div className="mt-md grid grid-cols-1 gap-sm sm:grid-cols-2 lg:grid-cols-3">
                {g.tables.map((t, ti) => (
                  <div
                    key={t.id}
                    className="rounded-md border border-hairline-soft bg-canvas p-sm"
                  >
                    {editingTable === t.id ? (
                      <form
                        action={updateTable}
                        className="flex flex-col gap-xs"
                        onSubmit={() => setEditingTable(null)}
                      >
                        <input type="hidden" name="slug" value={slug} />
                        <input type="hidden" name="id" value={t.id} />
                        <Input name="name" defaultValue={t.name} required className="h-9" />
                        <div className="flex gap-xs">
                          <select name="area_id" defaultValue={t.area_id ?? ""} className={`${selectCls} flex-1`}>
                            <option value="">Chưa xếp khu</option>
                            {areas.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.name}
                              </option>
                            ))}
                          </select>
                          <Input
                            name="seats"
                            type="number"
                            min={1}
                            defaultValue={t.seats}
                            className="h-9 w-16"
                          />
                        </div>
                        <div className="flex gap-xs">
                          <Button type="submit" size="sm">Lưu</Button>
                          <Button type="button" variant="secondary" size="sm" onClick={() => setEditingTable(null)}>
                            Hủy
                          </Button>
                        </div>
                      </form>
                    ) : (
                      <>
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-ink">{t.name}</span>
                          <span className="text-xs text-steel">{t.seats} ghế</span>
                        </div>
                        <p className="mt-xxs font-mono text-[11px] text-muted" title={t.qr_token}>
                          QR: {t.qr_token.slice(0, 8)}…
                        </p>
                        <div className="mt-xs flex items-center justify-between">
                          <ReorderButtons
                            action={reorderTable}
                            slug={slug}
                            id={t.id}
                            areaId={t.area_id}
                            isFirst={ti === 0}
                            isLast={ti === g.tables.length - 1}
                          />
                          <div className="flex items-center gap-xs">
                            <button
                              type="button"
                              onClick={() => setEditingTable(t.id)}
                              className="text-sm text-primary hover:underline"
                            >
                              Sửa
                            </button>
                            <form action={deleteTable}>
                              <input type="hidden" name="slug" value={slug} />
                              <input type="hidden" name="id" value={t.id} />
                              <button type="submit" className="text-sm text-status-late hover:underline">
                                Xóa
                              </button>
                            </form>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                ))}
                {g.tables.length === 0 && (
                  <p className="col-span-full py-sm text-sm text-steel">Chưa có bàn trong khu này.</p>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function ReorderButtons({
  action,
  slug,
  id,
  areaId,
  isFirst,
  isLast,
}: {
  action: (formData: FormData) => void;
  slug: string;
  id: string;
  areaId?: string | null;
  isFirst: boolean;
  isLast: boolean;
}) {
  return (
    <div className="flex items-center gap-xxs">
      {(["up", "down"] as const).map((dir) => (
        <form action={action} key={dir}>
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="id" value={id} />
          {areaId !== undefined && (
            <input type="hidden" name="area_id" value={areaId ?? ""} />
          )}
          <input type="hidden" name="dir" value={dir} />
          <button
            type="submit"
            disabled={dir === "up" ? isFirst : isLast}
            aria-label={dir === "up" ? "Lên" : "Xuống"}
            className="rounded px-xs text-steel hover:bg-surface disabled:opacity-40"
          >
            {dir === "up" ? "↑" : "↓"}
          </button>
        </form>
      ))}
    </div>
  );
}
