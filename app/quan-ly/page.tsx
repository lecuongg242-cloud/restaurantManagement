import { redirect } from "next/navigation";
import { dichSauDangNhap, quanCuaToi } from "@/lib/quan-ly/quan";
import { DangNhapForm } from "./DangNhapForm";

export const dynamic = "force-dynamic";

/**
 * Màn đầu của app "TechMenu Quản lý" (P30, Giao diện B2) — điểm mở của biểu tượng trên màn hình chính và của APK.
 * Đã đăng nhập chủ/quản lý → vào thẳng quán (hoặc màn chọn quán). Như FABi Manager: email + mật khẩu, không hỏi tên quán.
 */
export default async function QuanLyDangNhapPage() {
  const dich = dichSauDangNhap(await quanCuaToi());
  if (dich) redirect(dich);

  return (
    <main className="mx-auto w-full max-w-[480px]">
      <div className="flex items-center gap-sm">
        <span aria-hidden className="grid size-11 place-items-center rounded-md bg-ink text-2xl font-bold text-primary">
          T
        </span>
        <h1 className="font-semibold text-2xl text-ink">TechMenu Quản lý</h1>
      </div>
      <div className="mt-lg rounded-lg border border-hairline-soft bg-canvas p-lg shadow-card">
        <h2 className="text-lg font-medium text-ink">Đăng nhập</h2>
        <DangNhapForm />
      </div>
      <p className="mt-md text-center text-sm text-steel">Dành cho chủ quán và quản lý.</p>
    </main>
  );
}
