import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, Layers, Store } from "lucide-react";
import { chuoiCuaToi, quanCuaToi } from "@/lib/quan-ly/quan";
import { quanLySignOut } from "../actions";

export const dynamic = "force-dynamic";

/**
 * Chọn quán (P30, Giao diện B3) — chỉ khi tài khoản quản lý > 1 quán / chi nhánh. Chuỗi có dòng đầu "Tất cả chi nhánh"
 * (như bộ lọc "Tất cả chi nhánh" của CUKCUK) → Tổng quan gộp chuỗi.
 */
export default async function ChonQuanPage() {
  const quan = await quanCuaToi();
  if (!quan.length) redirect("/quan-ly");
  const chuoi = await chuoiCuaToi(quan);

  return (
    <main className="mx-auto w-full max-w-[480px]">
      <h1 className="font-display text-2xl text-ink">Chọn quán</h1>
      <ul className="mt-lg flex flex-col gap-sm">
        {chuoi.map((c) => (
          <li key={c.brandId}>
            <The href={`/r/${c.quanDau}/quan-ly?pham=chuoi`} icon={<Layers className="size-5" aria-hidden />} ten="Tất cả chi nhánh" phu={`${c.ten} · ${c.soChiNhanh} chi nhánh`} />
          </li>
        ))}
        {quan.map((q) => (
          <li key={q.slug}>
            <The href={`/r/${q.slug}/quan-ly`} icon={<Store className="size-5" aria-hidden />} ten={q.ten} phu={`${q.slug} · ${q.vaiTro === "owner" ? "Chủ quán" : "Quản lý"}`} />
          </li>
        ))}
      </ul>
      <form action={quanLySignOut} className="mt-xl text-center">
        <button className="min-h-11 text-sm text-steel underline">Đăng xuất</button>
      </form>
    </main>
  );
}

function The({ href, icon, ten, phu }: { href: string; icon: React.ReactNode; ten: string; phu: string }) {
  return (
    <Link href={href} className="flex min-h-16 items-center gap-md rounded-lg border border-hairline-soft bg-canvas px-md py-sm shadow-card active:bg-cream-soft">
      <span className="grid size-10 shrink-0 place-items-center rounded-md bg-cream-soft text-primary-deep">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-ink">{ten}</span>
        <span className="block truncate text-sm text-steel">{phu}</span>
      </span>
      <ChevronRight className="size-5 text-steel" aria-hidden />
    </Link>
  );
}
