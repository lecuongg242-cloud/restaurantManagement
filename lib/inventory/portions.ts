/**
 * Nhãn số phần trên thẻ món ở POS (INV-07, QD-017 D5). Số phần là ƯỚC TÍNH từ định lượng — nên
 * chỉ cảnh báo, không bao giờ khóa món: khóa nhầm giữa giờ cao điểm là mất doanh thu thật.
 */
export const LOW_PORTIONS = 5;

export type PortionBadge = { tone: "none" | "neutral" | "warning"; text: string };

export function portionBadge(portions: number | undefined): PortionBadge {
  if (portions === undefined || portions > LOW_PORTIONS) return { tone: "none", text: "" };
  if (portions <= 0) return { tone: "warning", text: "Có thể đã hết — hãy hỏi bếp" };
  return { tone: "neutral", text: `còn ~${portions}` };
}
