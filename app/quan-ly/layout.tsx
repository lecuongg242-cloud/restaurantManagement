import { QUAN_LY_METADATA, QUAN_LY_VIEWPORT } from "@/lib/quan-ly/metadata";

export const metadata = QUAN_LY_METADATA;
export const viewport = QUAN_LY_VIEWPORT;

/** Khung các trang ngoài quán của app Quản lý (đăng nhập, chọn quán): một cột giữa màn, rộng tối đa ~480px. */
export default function QuanLyLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-surface px-md py-xl">{children}</div>;
}
