/**
 * Nhãn nơi của đơn không bàn ở quán chế độ bàn (P35): nhân viên liếc là biết bưng ra hay gói. "Mang về" tô kem như
 * trên màn bếp; "Tại quán" chữ xám.
 */
export function NoiTag({ eatIn }: { eatIn: boolean }) {
  return eatIn ? (
    <span className="ml-xs rounded-sm border border-hairline px-xs py-px text-xs font-medium text-steel">Tại quán</span>
  ) : (
    <span className="ml-xs rounded-sm bg-cream px-xs py-px text-xs font-semibold text-primary">Mang về</span>
  );
}
