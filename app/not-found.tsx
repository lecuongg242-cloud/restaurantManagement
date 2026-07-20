import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-3xl font-bold">Không tìm thấy trang</h1>
      <p className="max-w-sm opacity-70">
        Địa chỉ không tồn tại hoặc nhà hàng đã ngừng hoạt động. Kiểm tra lại
        đường dẫn / mã QR.
      </p>
      <Link
        href="/"
        className="rounded-lg bg-foreground px-5 py-2.5 font-medium text-background"
      >
        Về trang chủ
      </Link>
    </main>
  );
}
