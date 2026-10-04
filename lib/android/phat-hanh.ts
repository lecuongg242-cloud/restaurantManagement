import "server-only";
import { goiPhatHanh } from "@/lib/desktop/phat-hanh";

/**
 * Bản phát hành app Android "TechMenu Thu ngân" (P24 24-02, ANDR-01/04, QD-030 D2).
 *
 * Tệp `.apk` + `android-latest.json` nằm ở MỘT bản phát hành GitHub có nhãn cố định `android` — không phải "latest":
 * app Windows tạo bản phát hành mới cho mỗi phiên bản, "latest" luôn là bản Windows mới nhất, đặt APK ở đó thì mỗi lần
 * ra bản Windows là APK biến mất. Địa chỉ: `ANDROID_RELEASE_BASE`, hoặc suy từ `DESKTOP_RELEASE_BASE`
 * (`…/releases/latest/download` → `…/releases/download/android`). App và nút tải chỉ biết đường của chính app web.
 */

export type ThongTinAndroid = {
  phienBan: string;
  maPhienBan: number;
  tenTep: string;
  kichThuoc: number;
  sha256: string;
};

export function goiPhatHanhAndroid(): string | null {
  const rieng = process.env.ANDROID_RELEASE_BASE?.trim().replace(/\/+$/, "");
  const g = rieng || goiPhatHanh()?.replace(/\/releases\/latest\/download$/, "/releases/download/android");
  if (!g) return null;
  try {
    return new URL(g).protocol === "https:" ? g : null;
  } catch {
    return null;
  }
}

/**
 * Hai APK cùng nơi phát hành (P30, QD-033 D6): "TechMenu Thu ngân" và "TechMenu Quản lý" — mỗi app một tệp chỉ mục +
 * tiền tố tên tệp riêng, để app này không bao giờ tải nhầm APK của app kia.
 */
export type AppAndroid = "thu-ngan" | "quan-ly";
export const APP_ANDROID: Record<AppAndroid, { tienTo: string; chiMuc: string; ten: string }> = {
  "thu-ngan": { tienTo: "TechMenu-ThuNgan", chiMuc: "android-latest.json", ten: "TechMenu Thu ngân" },
  "quan-ly": { tienTo: "TechMenu-QuanLy", chiMuc: "android-quan-ly-latest.json", ten: "TechMenu Quản lý" },
};

/** `?app=` của route tải / cập nhật: chỉ "quan-ly" là app Quản lý; thiếu / lạ = Thu ngân (link cũ không đổi nghĩa). */
export function docAppAndroid(raw: string | null | undefined): AppAndroid {
  return raw === "quan-ly" ? "quan-ly" : "thu-ngan";
}

/** Đúng các tệp mà `android/scripts/phat-hanh.mjs` sinh ra — không thành chỗ chuyển hướng tùy ý. */
export const TEP_HOP_LE_ANDROID =
  /^(android-latest\.json|android-quan-ly-latest\.json|TechMenu-ThuNgan-\d+\.\d+\.\d+\.apk|TechMenu-QuanLy-\d+\.\d+\.\d+\.apk)$/;

/** Đọc tệp chỉ mục của `app`; thiếu / sai trường nào ⇒ null (không hiện nút tải, app không cập nhật theo dữ liệu lạ). */
export function docManifestAndroid(raw: unknown, app: AppAndroid = "thu-ngan"): ThongTinAndroid | null {
  if (!raw || typeof raw !== "object") return null;
  const j = raw as Record<string, unknown>;
  const phienBan = typeof j.phienBan === "string" && /^\d+\.\d+\.\d+$/.test(j.phienBan) ? j.phienBan : null;
  const maPhienBan = Number.isInteger(j.maPhienBan) && (j.maPhienBan as number) > 0 ? (j.maPhienBan as number) : null;
  const tenTep =
    typeof j.tenTep === "string" && TEP_HOP_LE_ANDROID.test(j.tenTep) && j.tenTep.startsWith(`${APP_ANDROID[app].tienTo}-`) && j.tenTep.endsWith(".apk")
      ? j.tenTep
      : null;
  const kichThuoc = Number.isInteger(j.kichThuoc) && (j.kichThuoc as number) > 0 ? (j.kichThuoc as number) : null;
  const sha256 = typeof j.sha256 === "string" && /^[0-9a-f]{64}$/.test(j.sha256) ? j.sha256 : null;
  if (!phienBan || !maPhienBan || !tenTep || !kichThuoc || !sha256) return null;
  return { phienBan, maPhienBan, tenTep, kichThuoc, sha256 };
}

/** Bản mới nhất; màn hiển thị lưu đệm 5 phút, nút tải / app truyền `moi: true` (cùng lý do như bản Windows). */
export async function thongTinAndroid(opts: { moi?: boolean; app?: AppAndroid } = {}): Promise<ThongTinAndroid | null> {
  const app = opts.app ?? "thu-ngan";
  const goc = goiPhatHanhAndroid();
  if (!goc) return null;
  try {
    const r = await fetch(`${goc}/${APP_ANDROID[app].chiMuc}`, {
      ...(opts.moi ? { cache: "no-store" as const } : { next: { revalidate: 300 } }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!r.ok) return null;
    return docManifestAndroid(await r.json(), app);
  } catch {
    return null;
  }
}
