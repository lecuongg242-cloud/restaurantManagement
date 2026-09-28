/**
 * Nhu cầu nguyên liệu + gợi ý lượng nhập (P18 18-02, AI-03, QD-025 D2). Thuần — test được không cần DB.
 *
 * Nhu cầu = số món dự báo × định lượng, bung bán thành phẩm bằng ĐÚNG quy tắc của P10 (`requiredQty` — yield chỉ áp
 * cho nguyên liệu mua vào; bán thành phẩm quy về mẻ theo sản lượng mẻ), nên cùng một bát phở thì giá vốn (10-01) và
 * nhu cầu nguyên liệu nói cùng một lượng thịt. Bán thành phẩm CÒN TỒN được dùng trước, chỉ phần thiếu mới phải nấu.
 *
 * Gợi ý nhập = (nhu cầu × (1 + dự phòng)) − tồn lý thuyết, làm tròn LÊN theo đơn vị nhập (như phiếu "Đề xuất mua
 * nguyên vật liệu" của CUKCUK: SL đề nghị = SL cần − SL tồn).
 */
import type { CostContext } from "@/lib/inventory/cost";
import { requiredQty } from "@/lib/inventory/cost";
import { MAX_DEPTH } from "@/lib/inventory/recipe-graph";
import type { RecipeLine } from "@/lib/inventory/types";

export type MonDuBao = { itemKey: string; qty: number };

export type BanThanhPham = { id: string; can: number; ton: number; phaiNau: number };

export type NhuCau = {
  /** Nguyên liệu MUA VÀO → lượng cần (đơn vị gốc). */
  can: Map<string, number>;
  banThanhPham: BanThanhPham[];
  /** Món có dự báo mà chưa khai định lượng — chủ quán cần biết độ phủ. */
  chuaKhai: string[];
};

function cong(m: Map<string, number>, k: string, v: number) {
  m.set(k, (m.get(k) ?? 0) + v);
}

/** Cấp của bán thành phẩm (con cao nhất + 1); mua vào = 0. Quá sâu = vòng lọt vào dữ liệu → dừng. */
function cap(id: string, ctx: CostContext, memo: Map<string, number>, level = 0): number {
  const ing = ctx.ingredients.get(id);
  if (!ing || ing.kind !== "prepared" || level > MAX_DEPTH) return 0;
  if (memo.has(id)) return memo.get(id)!;
  const c = 1 + Math.max(0, ...(ctx.children.get(id) ?? []).map((l) => cap(l.ingredient_id, ctx, memo, level + 1)));
  memo.set(id, c);
  return c;
}

export function canNguyenLieu(
  duBao: MonDuBao[],
  dinhLuongMon: Map<string, RecipeLine[]>,
  ctx: CostContext,
  tonBanThanhPham: Map<string, number> = new Map()
): NhuCau {
  const tong = new Map<string, number>();
  const chuaKhai: string[] = [];
  for (const m of duBao) {
    if (m.qty <= 0) continue;
    const lines = dinhLuongMon.get(m.itemKey);
    if (!lines?.length) {
      if (m.itemKey !== "khac") chuaKhai.push(m.itemKey);
      continue;
    }
    for (const l of lines) cong(tong, l.ingredient_id, m.qty * requiredQty(l, ctx.ingredients.get(l.ingredient_id)));
  }

  // Bán thành phẩm: cha trước con (cấp cao trước) — nhu cầu của con phải đủ trước khi xét tồn của con.
  const memo = new Map<string, number>();
  const banThanhPham: BanThanhPham[] = [];
  const daXet = new Set<string>();
  for (;;) {
    const cho = [...tong.keys()].filter((id) => ctx.ingredients.get(id)?.kind === "prepared" && !daXet.has(id));
    if (!cho.length) break;
    cho.sort((a, b) => cap(b, ctx, memo) - cap(a, ctx, memo));
    const id = cho[0];
    daXet.add(id);
    const ing = ctx.ingredients.get(id)!;
    const can = tong.get(id) ?? 0;
    const ton = Math.max(0, tonBanThanhPham.get(id) ?? 0);
    const phaiNau = Math.max(0, can - ton);
    banThanhPham.push({ id, can, ton, phaiNau });
    const me = ing.batch_output_qty ?? 0;
    if (phaiNau > 0 && me > 0) {
      for (const l of ctx.children.get(id) ?? []) {
        cong(tong, l.ingredient_id, (phaiNau / me) * requiredQty(l, ctx.ingredients.get(l.ingredient_id)));
      }
    }
  }

  const can = new Map<string, number>();
  for (const [id, v] of tong) if (ctx.ingredients.get(id)?.kind === "purchased" && v > 0) can.set(id, v);
  return { can, banThanhPham, chuaKhai };
}

export type GoiYNhap = {
  ingredientId: string;
  /** Lượng cần (đơn vị gốc), chưa cộng dự phòng. */
  can: number;
  ton: number;
  /** Gợi ý nhập, đơn vị NHẬP (kg, vỉ…) — đã làm tròn lên. 0 = đủ, không cần nhập. */
  goiY: number;
  lyDo: "du" | "thieu" | "ton-am";
};

/**
 * `safetyPct`: dự phòng trên mức dự báo (QD-025 18-02: mặc định giá trị dự báo + 10%). Tồn ÂM nghĩa là tồn lý thuyết
 * sai (nhập thiếu phiếu, định lượng khai dư) → coi như 0 để gợi ý đủ nhu cầu, và cảnh báo "kiểm kê lại".
 */
export function goiYNhap(
  can: Map<string, number>,
  ton: Map<string, number>,
  ctx: CostContext,
  safetyPct = 10
): GoiYNhap[] {
  const out: GoiYNhap[] = [];
  for (const [id, c] of can) {
    const ing = ctx.ingredients.get(id);
    if (!ing) continue;
    const t = ton.get(id) ?? 0;
    const thieu = Math.max(0, c * (1 + safetyPct / 100) - Math.max(0, t));
    const heSo = ing.purchase_unit && ing.purchase_factor > 0 ? ing.purchase_factor : 1;
    // Trừ một chút trước khi làm tròn lên: 2,0000000001 kg do sai số phép chia không được thành 3 kg.
    const goiY = thieu > 0 ? Math.ceil(thieu / heSo - 1e-9) : 0;
    out.push({ ingredientId: id, can: c, ton: t, goiY, lyDo: t < 0 ? "ton-am" : goiY > 0 ? "thieu" : "du" });
  }
  return out;
}
