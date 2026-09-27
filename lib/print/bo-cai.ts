import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { themFileVaoZip } from "@/lib/print/zip-them";

/**
 * Bộ cài cầu in chung `cau-in.zip` (PRINT-17) — nằm ở bucket riêng, không công khai. `print-pack.ps1
 * -Upload` đưa bản mới lên (ghi đè cùng tên); màn Admin → Máy in cho owner/manager tải qua link ký hạn.
 * CHỈ server, với admin client (service role).
 */
export const BO_CAI_BUCKET = "bridge-installer";
export const BO_CAI_FILE = "cau-in.zip";
const HAN_LINK_GIAY = 60;

export type ThongTinBoCai = { kichThuoc: number; capNhatLuc: string };

/** Bộ cài hiện có trên Storage — `null` nếu chưa đóng gói lần nào. */
export async function thongTinBoCai(admin: SupabaseClient): Promise<ThongTinBoCai | null> {
  const { data, error } = await admin.storage.from(BO_CAI_BUCKET).list("", { search: BO_CAI_FILE });
  if (error) return null;
  const f = data?.find((o) => o.name === BO_CAI_FILE);
  if (!f) return null;
  const kichThuoc = Number((f.metadata as { size?: number } | null)?.size ?? 0);
  return { kichThuoc, capNhatLuc: f.updated_at ?? f.created_at ?? "" };
}

/** Link tải ký hạn 60 giây tới `duongDan` trong bucket (trình duyệt lưu thành `cau-in.zip`). */
async function linkKyHan(admin: SupabaseClient, duongDan: string): Promise<string | null> {
  const { data, error } = await admin.storage
    .from(BO_CAI_BUCKET)
    .createSignedUrl(duongDan, HAN_LINK_GIAY, { download: BO_CAI_FILE });
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/** Bộ cài gốc, KHÔNG kèm mã (lúc cài sẽ hỏi) — `null` nếu chưa đóng gói lần nào. */
export async function linkTaiBoCai(admin: SupabaseClient): Promise<string | null> {
  return linkKyHan(admin, BO_CAI_FILE);
}

/** Bản ghép tạm (bộ cài + mã) sống 1 giờ — mã bên trong hết hạn sau 30 phút, sau đó file vô dụng. */
const TAM = "tam";
const TAM_SONG_MS = 60 * 60_000;

/**
 * Bộ cài KÈM MÃ kích hoạt (PRINT-17): chèn `bo-cai\ma-kich-hoat.txt` vào bộ cài gốc → lưu bản tạm → link tải.
 * Cầu in đọc mã từ file đó nên cài không phải gõ. Ghép ở server vì hàm Vercel không trả thẳng được 33 MB
 * (~4,5 MB mỗi phản hồi) — tải/đưa lên Storage thì không bị giới hạn đó.
 */
export async function linkTaiBoCaiKemMa(admin: SupabaseClient, ma: string): Promise<string | null> {
  const kho = admin.storage.from(BO_CAI_BUCKET);
  const { data: goc, error } = await kho.download(BO_CAI_FILE);
  if (error || !goc) return null;

  const zip = themFileVaoZip(Buffer.from(await goc.arrayBuffer()), "bo-cai/ma-kich-hoat.txt", Buffer.from(`${ma}\r\n`));
  const duongDan = `${TAM}/${randomUUID()}.zip`;
  const { error: loiLen } = await kho.upload(duongDan, zip, { contentType: "application/zip" });
  if (loiLen) throw new Error(`Không lưu được bộ cài kèm mã: ${loiLen.message}`);

  await donBanTam(admin);
  return linkKyHan(admin, duongDan);
}

/** Xóa bản ghép tạm quá 1 giờ. Lỗi dọn không làm hỏng lượt tải. */
async function donBanTam(admin: SupabaseClient): Promise<void> {
  try {
    const kho = admin.storage.from(BO_CAI_BUCKET);
    const { data } = await kho.list(TAM, { limit: 1000 });
    const han = Date.now() - TAM_SONG_MS;
    const cu = (data ?? []).filter((o) => o.created_at && new Date(o.created_at).getTime() < han).map((o) => `${TAM}/${o.name}`);
    if (cu.length) await kho.remove(cu);
  } catch {
    /* dọn lần sau */
  }
}
