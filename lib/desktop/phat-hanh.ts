import "server-only";

/**
 * Bản phát hành app "TechMenu Thu ngân" (DESK-10/11, 21-03).
 *
 * Tệp cài (~80–100 MB) KHÔNG để trên Supabase Storage: gói miễn phí giới hạn 50 MB mỗi tệp (0055). Nơi đặt là một
 * địa chỉ gốc cấu hình bằng `DESKTOP_RELEASE_BASE` (đề xuất: GitHub Releases của repo công khai chỉ chứa tệp cài —
 * `https://github.com/<chủ>/<repo>/releases/latest/download`). App và nút tải chỉ biết đường của CHÍNH app web
 * (`/api/desktop/...`), nên đổi nơi đặt / tên miền không phải phát hành lại app.
 */

export type ThongTinApp = { phienBan: string; tenTep: string; kichThuoc: number };

export function goiPhatHanh(): string | null {
  const g = process.env.DESKTOP_RELEASE_BASE?.trim().replace(/\/+$/, "");
  if (!g) return null;
  try {
    const u = new URL(g);
    return u.protocol === "https:" ? g : null;
  } catch {
    return null;
  }
}

/** Tên tệp được phép chuyển tiếp — đúng các tệp electron-builder sinh ra, không cho đường dẫn lạ. */
export const TEP_HOP_LE = /^(latest\.yml|TechMenu-ThuNgan-Setup-\d+\.\d+\.\d+\.exe(\.blockmap)?)$/;

/** Đọc `latest.yml` của electron-builder (vài dòng YAML cố định) — không cần thư viện YAML. */
export function docLatestYml(yml: string): ThongTinApp | null {
  const phienBan = yml.match(/^version:\s*['"]?([0-9]+\.[0-9]+\.[0-9]+)['"]?\s*$/m)?.[1];
  const tenTep = yml.match(/^path:\s*['"]?([^'"\r\n]+)['"]?\s*$/m)?.[1]?.trim();
  const kichThuoc = Number(yml.match(/^\s+size:\s*(\d+)\s*$/m)?.[1] ?? 0);
  if (!phienBan || !tenTep || !TEP_HOP_LE.test(tenTep)) return null;
  return { phienBan, tenTep, kichThuoc };
}

/** Bản mới nhất (null = chưa cấu hình nơi phát hành / chưa phát hành / không đọc được). Lưu đệm 5 phút. */
export async function thongTinApp(): Promise<ThongTinApp | null> {
  const goc = goiPhatHanh();
  if (!goc) return null;
  try {
    const r = await fetch(`${goc}/latest.yml`, { next: { revalidate: 300 }, signal: AbortSignal.timeout(5_000) });
    if (!r.ok) return null;
    return docLatestYml(await r.text());
  } catch {
    return null;
  }
}
