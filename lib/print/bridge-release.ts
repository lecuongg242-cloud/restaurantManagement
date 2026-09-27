import "server-only";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * Bản phát hành cầu in mà server công bố cho tự cập nhật (PRINT-12, QD-019 D8).
 *
 * MỘT nguồn duy nhất: chính `scripts/print-bridge.mjs` được deploy cùng app (next.config
 * `outputFileTracingIncludes`). Phiên bản đọc từ hằng `BRIDGE_VERSION` trong tệp, SHA tính từ nội dung
 * — không có bản sao nào trong `public/` có thể lệch với bản gốc, và không có số phiên bản nào phải
 * nhớ sửa ở hai nơi.
 */
export type BanPhatHanh = { version: number; sha256: string; noiDung: Buffer };

const TEP = path.join(process.cwd(), "scripts", "print-bridge.mjs");

export function docPhienBan(noiDung: string): number | null {
  const m = /export const BRIDGE_VERSION = (\d+);/.exec(noiDung);
  return m ? Number(m[1]) : null;
}

let daDoc: BanPhatHanh | null = null;

/** Đọc một lần mỗi tiến trình — tệp chỉ đổi khi deploy. */
export function docBanPhatHanh(): BanPhatHanh {
  if (daDoc) return daDoc;
  const noiDung = fs.readFileSync(TEP);
  const version = docPhienBan(noiDung.toString("utf8"));
  if (version === null) throw new Error("print-bridge.mjs thiếu hằng BRIDGE_VERSION");
  daDoc = { version, sha256: crypto.createHash("sha256").update(noiDung).digest("hex"), noiDung };
  return daDoc;
}
