/**
 * Xem trước đồng bộ thực đơn chi nhánh gốc → chi nhánh (P15 15-03, QD-023 D4, U2). Thuần hàm (không I/O).
 *
 * Quy tắc Y HỆT `sync_menu_from_root` (0063) — test RLS "đồng bộ xong xem trước lại = trống" giữ hai phía khớp:
 *  - dòng gốc chưa có ở chi nhánh → THÊM (món mới: còn món);
 *  - tên / mô tả / ảnh / nhóm / thứ tự / hiện-ẩn / tùy chọn → ghi đè theo gốc;
 *  - giá món → ghi đè chỉ khi chi nhánh CHƯA khóa giá (`price_locked`);
 *  - hết món (`is_available`) của dòng đã có → KHÔNG đụng;
 *  - dòng đã nối mà gốc không còn → ẨN (không xóa);
 *  - dòng chỉ có ở chi nhánh (`source_id` rỗng) → không đụng; nếu cùng tên với một dòng gốc chưa nối → GỢI Ý
 *    NỐI (người dùng xác nhận từng cặp), để lần đầu không sinh món trùng.
 */
export type SnapCategory = { id: string; name: string; sort_order: number; active: boolean; source_id: string | null };
export type SnapItem = {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  base_price: number;
  image_url: string | null;
  sort_order: number;
  active: boolean;
  is_available: boolean;
  price_locked: boolean;
  source_id: string | null;
};
export type SnapGroup = {
  id: string;
  name: string;
  min_select: number;
  max_select: number;
  required: boolean;
  sort_order: number;
  source_id: string | null;
};
export type SnapOption = {
  id: string;
  group_id: string;
  name: string;
  price_delta: number;
  sort_order: number;
  is_available: boolean;
  source_id: string | null;
};
export type SnapLink = { item_id: string; group_id: string; sort_order: number };
export type MenuSnapshot = {
  categories: SnapCategory[];
  items: SnapItem[];
  groups: SnapGroup[];
  options: SnapOption[];
  links: SnapLink[];
};

export type Loai = "category" | "item" | "group" | "option" | "link";
export type DongThayDoi = { loai: Loai; ten: string; chiTiet?: string };
export type CapNoi = { kind: "category" | "item" | "group"; branchId: string; rootId: string; ten: string };
export type SyncPlan = { them: DongThayDoi[]; sua: DongThayDoi[]; an: DongThayDoi[]; goiYNoi: CapNoi[] };

const norm = (s: string) => s.trim().toLowerCase();

/** Áp các cặp nối đã xác nhận lên bản chụp chi nhánh (như bước 0 của RPC). */
function noiCap(branch: MenuSnapshot, root: MenuSnapshot, pairs: CapNoi[]): MenuSnapshot {
  const rootIds = {
    category: new Set(root.categories.map((r) => r.id)),
    item: new Set(root.items.map((r) => r.id)),
    group: new Set(root.groups.map((r) => r.id)),
  };
  const map = new Map(pairs.filter((p) => rootIds[p.kind].has(p.rootId)).map((p) => [`${p.kind}:${p.branchId}`, p.rootId]));
  const gan = <T extends { id: string; source_id: string | null }>(kind: CapNoi["kind"], rows: T[]) =>
    rows.map((r) => (r.source_id == null && map.has(`${kind}:${r.id}`) ? { ...r, source_id: map.get(`${kind}:${r.id}`)! } : r));
  return {
    ...branch,
    categories: gan("category", branch.categories),
    items: gan("item", branch.items),
    groups: gan("group", branch.groups),
  };
}

export function planMenuSync(root: MenuSnapshot, branchIn: MenuSnapshot, pairs: CapNoi[] = []): SyncPlan {
  const branch = noiCap(branchIn, root, pairs);
  const plan: SyncPlan = { them: [], sua: [], an: [], goiYNoi: [] };
  const bySource = <T extends { source_id: string | null }>(rows: T[]) =>
    new Map(rows.filter((r) => r.source_id != null).map((r) => [r.source_id!, r]));

  // Nhóm món
  const bCat = bySource(branch.categories);
  const rootCatIds = new Set(root.categories.map((r) => r.id));
  for (const r of root.categories) {
    const b = bCat.get(r.id);
    if (!b) plan.them.push({ loai: "category", ten: r.name });
    else if (b.name !== r.name || b.sort_order !== r.sort_order || b.active !== r.active) {
      plan.sua.push({ loai: "category", ten: r.name, chiTiet: b.name !== r.name ? `đổi tên từ “${b.name}”` : undefined });
    }
  }
  for (const b of branch.categories) {
    if (b.source_id && b.active && !rootCatIds.has(b.source_id)) plan.an.push({ loai: "category", ten: b.name });
  }

  // Nhóm tùy chọn
  const bGrp = bySource(branch.groups);
  for (const r of root.groups) {
    const b = bGrp.get(r.id);
    if (!b) plan.them.push({ loai: "group", ten: r.name });
    else if (
      b.name !== r.name ||
      b.min_select !== r.min_select ||
      b.max_select !== r.max_select ||
      b.required !== r.required ||
      b.sort_order !== r.sort_order
    ) {
      plan.sua.push({ loai: "group", ten: r.name });
    }
  }

  // Tùy chọn — nhóm đích phải có (đã có hoặc sẽ được thêm cùng lượt)
  const bOpt = bySource(branch.options);
  const rootOptIds = new Set(root.options.map((r) => r.id));
  const bGrpIdBySource = new Map([...bGrp.entries()].map(([src, g]) => [src, g.id]));
  for (const r of root.options) {
    const b = bOpt.get(r.id);
    if (!b) plan.them.push({ loai: "option", ten: r.name });
    else if (
      b.name !== r.name ||
      b.price_delta !== r.price_delta ||
      b.sort_order !== r.sort_order ||
      b.group_id !== (bGrpIdBySource.get(r.group_id) ?? b.group_id)
    ) {
      plan.sua.push({ loai: "option", ten: r.name, chiTiet: b.price_delta !== r.price_delta ? `giá cộng thêm ${b.price_delta} → ${r.price_delta}` : undefined });
    }
  }
  for (const b of branch.options) {
    if (b.source_id && b.is_available && !rootOptIds.has(b.source_id)) plan.an.push({ loai: "option", ten: b.name });
  }

  // Món
  const bItem = bySource(branch.items);
  const rootItemIds = new Set(root.items.map((r) => r.id));
  const bCatIdBySource = new Map([...bCat.entries()].map(([src, c]) => [src, c.id]));
  for (const r of root.items) {
    const b = bItem.get(r.id);
    if (!b) {
      plan.them.push({ loai: "item", ten: r.name });
      continue;
    }
    const gia = b.price_locked ? b.base_price : r.base_price;
    const doi: string[] = [];
    if (b.name !== r.name) doi.push(`tên “${b.name}” → “${r.name}”`);
    if (gia !== b.base_price) doi.push(`giá ${b.base_price} → ${r.base_price}`);
    if (b.description !== r.description) doi.push("mô tả");
    if (b.image_url !== r.image_url) doi.push("ảnh");
    if (b.sort_order !== r.sort_order) doi.push("thứ tự");
    if (b.active !== r.active) doi.push(r.active ? "hiện lại" : "ẩn theo gốc");
    const catDich = bCatIdBySource.get(r.category_id);
    if (catDich != null && b.category_id !== catDich) doi.push("đổi nhóm");
    if (doi.length) plan.sua.push({ loai: "item", ten: r.name, chiTiet: doi.join(", ") });
  }
  for (const b of branch.items) {
    if (b.source_id && b.active && !rootItemIds.has(b.source_id)) plan.an.push({ loai: "item", ten: b.name });
  }

  // Gắn nhóm tùy chọn vào món — chỉ cặp mà cả hai đầu đều nối về gốc
  const bItemIdBySource = new Map([...bItem.entries()].map(([src, i]) => [src, i.id]));
  const itemSrcById = new Map(branch.items.map((i) => [i.id, i.source_id]));
  const grpSrcById = new Map(branch.groups.map((g) => [g.id, g.source_id]));
  const bLink = new Map(branch.links.map((l) => [`${l.item_id}|${l.group_id}`, l]));
  const rootLinkKeys = new Set(root.links.map((l) => `${l.item_id}|${l.group_id}`));
  const tenMon = new Map(root.items.map((i) => [i.id, i.name]));
  for (const rl of root.links) {
    const bi = bItemIdBySource.get(rl.item_id);
    const bg = bGrpIdBySource.get(rl.group_id);
    if (!bi || !bg) {
      // Món/nhóm mới thêm cùng lượt → gắn cùng lượt (đếm như thêm).
      if (rootItemIds.has(rl.item_id)) plan.them.push({ loai: "link", ten: tenMon.get(rl.item_id) ?? "" });
      continue;
    }
    const b = bLink.get(`${bi}|${bg}`);
    if (!b) plan.them.push({ loai: "link", ten: tenMon.get(rl.item_id) ?? "" });
    else if (b.sort_order !== rl.sort_order) plan.sua.push({ loai: "link", ten: tenMon.get(rl.item_id) ?? "" });
  }
  for (const l of branch.links) {
    const iSrc = itemSrcById.get(l.item_id);
    const gSrc = grpSrcById.get(l.group_id);
    if (iSrc && gSrc && !rootLinkKeys.has(`${iSrc}|${gSrc}`)) {
      plan.an.push({ loai: "link", ten: branch.items.find((i) => i.id === l.item_id)?.name ?? "" });
    }
  }

  // Gợi ý nối lần đầu: dòng chi nhánh chưa nối, cùng tên với dòng gốc chưa được nối.
  const goiY = <B extends { id: string; name: string; source_id: string | null }, R extends { id: string; name: string }>(
    kind: CapNoi["kind"],
    bRows: B[],
    rRows: R[],
    daNoi: Map<string, unknown>,
    khoa: (r: { name: string }, laGoc: boolean) => string = (r) => norm(r.name)
  ) => {
    const conLai = new Map<string, R>();
    for (const r of rRows) if (!daNoi.has(r.id) && !conLai.has(khoa(r, true))) conLai.set(khoa(r, true), r);
    for (const b of bRows) {
      if (b.source_id) continue;
      const r = conLai.get(khoa(b, false));
      if (r) {
        plan.goiYNoi.push({ kind, branchId: b.id, rootId: r.id, ten: b.name });
        conLai.delete(khoa(b, false));
      }
    }
  };
  goiY("category", branch.categories, root.categories, bCat);
  goiY("group", branch.groups, root.groups, bGrp);
  // Món: cùng tên + cùng tên nhóm món.
  const tenNhomGoc = new Map(root.categories.map((c) => [c.id, norm(c.name)]));
  const tenNhomCn = new Map(branch.categories.map((c) => [c.id, norm(c.name)]));
  const khoaMon = (laGoc: boolean) => (r: { name: string; category_id?: string }) =>
    `${norm(r.name)}|${(laGoc ? tenNhomGoc : tenNhomCn).get((r as SnapItem).category_id) ?? ""}`;
  goiY("item", branch.items, root.items, bItem, (r, laGoc) => khoaMon(laGoc)(r as SnapItem));

  return plan;
}

/** Không còn gì để đồng bộ (bỏ qua gợi ý nối — đó là lựa chọn của người dùng, không phải chênh lệch). */
export function khongConThayDoi(p: SyncPlan): boolean {
  return p.them.length === 0 && p.sua.length === 0 && p.an.length === 0;
}
