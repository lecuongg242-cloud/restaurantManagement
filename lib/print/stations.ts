/**
 * Bếp/bar (P37, PRINT-19..23): mỗi nơi nhận các nhóm món gán cho nó; nhóm chưa gán → Bếp chính. Thuần hàm + một hàm đọc.
 *
 * `print_jobs.target_station`: Bếp chính = "kitchen" (cầu in bản cũ không đọc cột này vẫn in đúng), nơi khác = id.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type Station = {
  /** "" = Bếp chính chưa từng lưu (chưa có dòng trong DB). */
  id: string;
  name: string;
  isDefault: boolean;
  copies: number;
  perItem: boolean;
};

export const DEFAULT_TARGET = "kitchen";
export const DEFAULT_STATION_NAME = "Bếp chính";
export const MAX_COPIES = 3;
export const STATION_NAME_MAX = 30;

const IMPLICIT_DEFAULT: Station = { id: "", name: DEFAULT_STATION_NAME, isDefault: true, copies: 1, perItem: false };

type Row = { id: string; name: string; is_default: boolean; copies: number; per_item: boolean };

/** Bếp chính đứng đầu, rồi các nơi khác theo thứ tự. Luôn có Bếp chính (dòng ngầm nếu quán chưa lưu). */
export function normalizeStations(rows: Row[]): Station[] {
  const all = rows.map((r) => ({
    id: r.id,
    name: r.name,
    isDefault: r.is_default,
    copies: r.copies,
    perItem: r.per_item,
  }));
  const def = all.find((s) => s.isDefault) ?? IMPLICIT_DEFAULT;
  return [def, ...all.filter((s) => !s.isDefault)];
}

export async function loadStations(supabase: SupabaseClient, tenantId: string): Promise<Station[]> {
  const { data } = await supabase
    .from("kitchen_stations")
    .select("id, name, is_default, copies, per_item")
    .eq("tenant_id", tenantId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  return normalizeStations((data ?? []) as Row[]);
}

export function targetOf(s: Station): string {
  return s.isDefault ? DEFAULT_TARGET : s.id;
}

/** Bếp/bar của một món: theo nhóm món; nhóm chưa gán / gán vào nơi đã xóa → Bếp chính. */
export function stationFor(stationId: string | null | undefined, stations: Station[]): Station {
  return stations.find((s) => !s.isDefault && s.id === stationId) ?? stations[0];
}

/** Chia món theo nơi nhận, giữ thứ tự món; bỏ nơi không có món. Thứ tự nhóm = thứ tự bếp/bar. */
export function splitByStation<T extends { stationId: string | null }>(
  items: T[],
  stations: Station[]
): { station: Station; items: T[] }[] {
  const groups = new Map<Station, T[]>();
  for (const it of items) {
    const s = stationFor(it.stationId, stations);
    groups.set(s, [...(groups.get(s) ?? []), it]);
  }
  return stations.filter((s) => groups.has(s)).map((s) => ({ station: s, items: groups.get(s)! }));
}
