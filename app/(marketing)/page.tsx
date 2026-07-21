import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function MarketingHome() {
  return (
    <div className="min-h-screen bg-canvas">
      <section className="mx-auto max-w-5xl px-lg py-section">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">
          SaaS quản lý nhà hàng
        </p>
        <h1 className="mt-md font-display text-5xl leading-[1.05] tracking-tight text-ink">
          Gọi món, bếp, đặt bàn — một hệ thống.
        </h1>
        <p className="mt-lg max-w-xl text-lg text-slate">
          Nền tảng đa chi nhánh cho nhà hàng: POS, màn hình bếp (KDS), đặt bàn &amp; giao
          hàng, quản trị và báo cáo.
        </p>
        <div className="mt-xl flex gap-sm">
          <Button asChild>
            <Link href="/style-guide">Xem style-guide</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/r/pho-viet">Thử tenant demo</Link>
          </Button>
        </div>
      </section>
      {/* Sunset stripe — signature Mistral, dùng ở landing/khách */}
      <div className="h-6 w-full bg-sunset" />
    </div>
  );
}
