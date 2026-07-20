import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-3xl font-bold sm:text-4xl">Hệ thống nhà hàng</h1>
      <p className="max-w-md text-balance opacity-80">
        Nền tảng SaaS quản lý nhà hàng: gọi món QR, POS, màn hình bếp, đặt bàn
        và báo cáo doanh thu.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/login"
          className="rounded-full bg-primary px-6 py-2.5 font-medium text-on-primary"
        >
          Đăng nhập nhân viên
        </Link>
        <Link
          href="/style-guide"
          className="rounded-full border border-foreground px-6 py-2.5 font-medium"
        >
          Style guide
        </Link>
      </div>
      <p className="text-sm opacity-60">
        Môi trường: {process.env.NEXT_PUBLIC_APP_ENV ?? "local"}
      </p>
    </main>
  );
}
