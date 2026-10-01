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

/** Đúng các tệp mà `android/scripts/phat-hanh.mjs` sinh ra — không thành chỗ chuyển hướng tùy ý. */
export const TEP_HOP_LE_ANDROID = /^(android-latest\.json|TechMenu-ThuNgan-\d+\.\d+\.\d+\.apk)$/;

/** Đọc `android-latest.json`; thiếu / sai trường nào ⇒ null (không hiện nút tải, app không cập nhật theo dữ liệu lạ). */
export function docManifestAndroid(raw: unknown): ThongTinAndroid | null {
  if (!raw || typeof raw !== "object") return null;
  const j = raw as Record<string, unknown>;
  const phienBan = typeof j.phienBan === "string" && /^\d+\.\d+\.\d+$/.test(j.phienBan) ? j.phienBan : null;
  const maPhienBan = Number.isInteger(j.maPhienBan) && (j.maPhienBan as number) > 0 ? (j.maPhienBan as number) : null;
  const tenTep = typeof j.tenTep === "string" && TEP_HOP_LE_ANDROID.test(j.tenTep) && j.tenTep.endsWith(".apk") ? j.tenTep : null;
  const kichThuoc = Number.isInteger(j.kichThuoc) && (j.kichThuoc as number) > 0 ? (j.kichThuoc as number) : null;
  const sha256 = typeof j.sha256 === "string" && /^[0-9a-f]{64}$/.test(j.sha256) ? j.sha256 : null;
  if (!phienBan || !maPhienBan || !tenTep || !kichThuoc || !sha256) return null;
  return { phienBan, maPhienBan, tenTep, kichThuoc, sha256 };
}

/** Bản mới nhất; màn hiển thị lưu đệm 5 phút, nút tải / app truyền `moi: true` (cùng lý do như bản Windows). */
export async function thongTinAndroid(opts: { moi?: boolean } = {}): Promise<ThongTinAndroid | null> {
  const goc = goiPhatHanhAndroid();
  if (!goc) return null;
  try {
    const r = await fetch(`${goc}/android-latest.json`, {
      ...(opts.moi ? { cache: "no-store" as const } : { next: { revalidate: 300 } }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!r.ok) return null;
    return docManifestAndroid(await r.json());
  } catch {
    return null;
  }
}
