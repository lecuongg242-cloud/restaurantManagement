/**
 * Kéo thả (P38) gửi cả danh sách id theo thứ tự mới. Chỉ hợp lệ khi đó là ĐÚNG tập đang có: không thiếu, không thừa,
 * không trùng — xem `tests/menu/reorder.test.ts`.
 */
export function thuTuHopLe(hienCo: string[], moi: string[]): boolean {
  if (moi.length !== hienCo.length) return false;
  const tap = new Set(hienCo);
  return new Set(moi).size === moi.length && moi.every((id) => tap.has(id));
}
