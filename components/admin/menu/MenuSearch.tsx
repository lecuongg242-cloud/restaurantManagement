"use client";

import { createContext, useContext, useState } from "react";
import { Search } from "lucide-react";
import { normalizeVi } from "@/lib/menu/search";
import { Input } from "@/components/ui/input";

/**
 * Ô "Tìm món" + lọc theo tab cho Thực đơn admin (chủ dự án chốt 04/10/2026). Server dựng MỌI danh mục; ở đây ẩn / hiện:
 * đang gõ → tìm trong mọi danh mục (không dấu, như POS); ô trống → theo tab đang chọn (`?nhom=`, `active`).
 */
type Ctx = { key: string; active: string | null; setQ: (q: string) => void; q: string };
const C = createContext<Ctx>({ key: "", active: null, setQ: () => {}, q: "" });

const khop = (key: string, name: string) => normalizeVi(name).includes(key);

export function MenuSearchProvider({ active, children }: { active: string | null; children: React.ReactNode }) {
  const [q, setQ] = useState("");
  return <C.Provider value={{ q, setQ, key: normalizeVi(q.trim()), active }}>{children}</C.Provider>;
}

export function MenuSearchBox() {
  const { q, setQ } = useContext(C);
  return (
    <label className="relative block w-full sm:w-80">
      <span className="sr-only">Tìm món</span>
      <Search className="pointer-events-none absolute left-sm top-1/2 h-4 w-4 -translate-y-1/2 text-steel" aria-hidden />
      <Input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Tìm món"
        className="pl-[2.25rem]"
      />
    </label>
  );
}

/** Đang tìm thì hàng tab mờ đi (kết quả lấy từ mọi danh mục) — như POS. */
export function DimWhileSearching({ children }: { children: React.ReactNode }) {
  const { key } = useContext(C);
  return <div className={key ? "opacity-50" : undefined}>{children}</div>;
}

/** Một danh mục: đang tìm → hiện khi có món khớp; không tìm → theo tab. */
export function CategoryFilter({ id, names, children }: { id: string; names: string[]; children: React.ReactNode }) {
  const { key, active } = useContext(C);
  const show = key ? names.some((n) => khop(key, n)) : active === null || active === id;
  return show ? <>{children}</> : null;
}

export function ItemFilter({ name, children }: { name: string; children: React.ReactNode }) {
  const { key } = useContext(C);
  return !key || khop(key, name) ? <>{children}</> : null;
}

/** Ô "+ Thêm món vào …" chỉ hiện khi không tìm. */
export function HideWhileSearching({ children }: { children: React.ReactNode }) {
  const { key } = useContext(C);
  return key ? null : <>{children}</>;
}

export function NoResult({ names }: { names: string[] }) {
  const { key } = useContext(C);
  if (!key || names.some((n) => khop(key, n))) return null;
  return <p className="rounded-lg border border-hairline-soft px-md py-xl text-center text-sm text-steel">Không tìm thấy món.</p>;
}
