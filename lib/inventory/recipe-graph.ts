/**
 * Kiểm tra công thức lồng công thức (INV-03, QD-017 D3): cấm vòng, tối đa 3 cấp.
 *
 * Cấp của một nguyên liệu: mua vào = 0; bán thành phẩm = 1 + cấp lớn nhất của các con.
 * Nước dùng nấu từ xương là cấp 1.
 */

export const MAX_DEPTH = 3;

export type RecipeCheck =
  | { ok: true }
  | { ok: false; reason: "cycle"; path: string[] }
  | { ok: false; reason: "depth" };

/**
 * Áp thử thay đổi "công thức của `parentId` nay gồm `childIds`" lên đồ thị hiện tại rồi kiểm tra.
 * `edges`: bán thành phẩm → con. `prepared`: tập id là bán thành phẩm (để biết nút nào có cấp).
 */
export function checkRecipeChange(
  edges: Map<string, string[]>,
  parentId: string,
  childIds: string[],
  prepared: Set<string>
): RecipeCheck {
  const next = new Map(edges);
  next.set(parentId, childIds);

  // 1. Vòng đi qua nút vừa sửa — trả đường đi để UI nói được "A → B → C → A".
  const path = findCycleFrom(next, parentId);
  if (path) return { ok: false, reason: "cycle", path };

  // 2. Cấp của MỌI bán thành phẩm (sửa con có thể đẩy cha của nó vượt giới hạn). Vòng có sẵn
  //    trong dữ liệu (lọt do hai người sửa cùng lúc) cũng bị bắt ở đây thay vì đệ quy vô hạn.
  const memo = new Map<string, number>();
  for (const id of prepared) {
    const d = depth(next, id, memo, new Set());
    if (d === null) return { ok: false, reason: "cycle", path: [id] };
    if (d > MAX_DEPTH) return { ok: false, reason: "depth" };
  }
  return { ok: true };
}

function findCycleFrom(edges: Map<string, string[]>, start: string): string[] | null {
  const walk = (node: string, trail: string[], seen: Set<string>): string[] | null => {
    for (const child of edges.get(node) ?? []) {
      if (child === start) return [...trail, child];
      if (seen.has(child)) continue;
      seen.add(child);
      const found = walk(child, [...trail, child], seen);
      if (found) return found;
    }
    return null;
  };
  return walk(start, [start], new Set());
}

/** null = gặp vòng. */
function depth(
  edges: Map<string, string[]>,
  id: string,
  memo: Map<string, number>,
  visiting: Set<string>
): number | null {
  const children = edges.get(id);
  if (!children || children.length === 0) return edges.has(id) ? 1 : 0;
  const cached = memo.get(id);
  if (cached !== undefined) return cached;
  if (visiting.has(id)) return null;
  visiting.add(id);
  let max = 0;
  for (const c of children) {
    const d = depth(edges, c, memo, visiting);
    if (d === null) return null;
    max = Math.max(max, d);
  }
  visiting.delete(id);
  memo.set(id, max + 1);
  return max + 1;
}
