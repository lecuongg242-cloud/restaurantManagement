import { OfflineView } from "@/components/pos/OfflineView";

/**
 * Màn xem khi mất mạng (P17 17-01). Service worker nạp sẵn trang này lúc có mạng và chuyển máy quầy tới đây khi
 * tải lại POS mà mất mạng. Trang KHÔNG đọc gì từ server — mọi dữ liệu nằm trong bản chụp IndexedDB của chính máy
 * này — nên không cần phiên đăng nhập và không lộ gì cho người lạ mở địa chỉ.
 */
export default async function PosOffline({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <OfflineView slug={slug} />;
}
