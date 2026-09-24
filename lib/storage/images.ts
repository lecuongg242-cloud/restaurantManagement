import { randomBytes } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { MENU_BUCKET } from "@/lib/storage/public-url";

/**
 * Tiện ích ảnh (CHỈ server). Ghi/xóa Storage qua service role; đọc public.
 * Bucket dùng chung: menu-images (ảnh món + logo tenant). Validate 2 lớp: client
 * (trước upload) + server (ở đây, trước khi ghi Storage). Ngưỡng 10MB/ảnh.
 * QD-005 §4 / 00-TongQuan P2.
 */

export { MENU_BUCKET, duongDanAnh } from "@/lib/storage/public-url";
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB

const MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export type ImageValidation =
  | { ok: true; ext: string; type: string }
  | { ok: false; error: string };

/** Validate loại + kích thước ảnh (≤10MB, png/jpeg/webp). Dùng ở server trước khi ghi. */
export function validateImage(file: File): ImageValidation {
  if (!file || file.size === 0) return { ok: false, error: "Chưa chọn tệp ảnh." };
  const ext = MIME_EXT[file.type];
  if (!ext) {
    return { ok: false, error: "Chỉ chấp nhận ảnh PNG, JPEG hoặc WebP." };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, error: "Ảnh vượt quá 10MB." };
  }
  return { ok: true, ext, type: file.type };
}


/**
 * Upload ảnh vào menu-images tại `dir` (vd tenantId hoặc `${tenantId}`),
 * tên tệp `${prefix}-${rand}.${ext}`. Ghi bằng service role.
 *
 * Trả cả `path` (đường dẫn tương đối — thứ đem LƯU vào DB, xem QD-014) lẫn `publicUrl` (tiện khi
 * cần dùng ngay, không lưu).
 */
export async function uploadImage(
  file: File,
  dir: string,
  prefix: string
): Promise<{ publicUrl: string; path: string }> {
  const v = validateImage(file);
  if (!v.ok) throw new Error(v.error);

  const rand = randomBytes(6).toString("hex");
  const path = `${dir}/${prefix}-${rand}.${v.ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  const admin = createAdminClient();
  const { error } = await admin.storage.from(MENU_BUCKET).upload(path, bytes, {
    contentType: v.type,
    upsert: true,
  });
  if (error) throw new Error(`Upload ảnh lỗi: ${error.message}`);

  const { data } = admin.storage.from(MENU_BUCKET).getPublicUrl(path);
  return { publicUrl: data.publicUrl, path };
}

/** Upload ảnh cho một món: menu-images/{tenantId}/{itemId}-{rand}.{ext}. */
export function uploadMenuImage(tenantId: string, itemId: string, file: File) {
  return uploadImage(file, tenantId, itemId);
}

/** Xóa 1 object trong bucket theo path (bỏ qua lỗi nếu không tồn tại). */
export async function deleteMenuImage(path: string | null): Promise<void> {
  if (!path) return;
  const admin = createAdminClient();
  await admin.storage.from(MENU_BUCKET).remove([path]);
}
