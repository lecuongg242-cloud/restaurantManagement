// scripts/print-upload.mjs — Đưa bộ cài cầu in chung lên Storage để chủ quán tải ở Admin → Máy in (PRINT-17).
//
// Chạy trên MÁY DEV (cần SUPABASE_SERVICE_ROLE_KEY trong .env.local). Thường gọi qua
// `print-pack.ps1 -Upload`; chạy tay: `node scripts/print-upload.mjs [đường-dẫn-zip]` (mặc định ./cau-in.zip).
// Ghi đè bản cũ cùng tên. Từ chối nếu zip chứa bí mật (chốt chặn thứ hai sau print-pack).
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

const BUCKET = "bridge-installer";
const FILE = "cau-in.zip";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Thiếu NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY trong .env.local");
  process.exit(1);
}

const zipPath = path.resolve(process.argv[2] ?? "cau-in.zip");
if (!fs.existsSync(zipPath)) {
  console.error(`Không thấy ${zipPath} — chạy print-pack.ps1 trước.`);
  process.exit(1);
}
const buf = fs.readFileSync(zipPath);

/** Tên + nội dung (đã giải nén) mọi file văn bản trong zip — đọc central directory, không cần thư viện. */
function* fileTrongZip(zip) {
  const eocd = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error("Không phải file zip.");
  let p = zip.readUInt32LE(eocd + 16);
  const n = zip.readUInt16LE(eocd + 10);
  for (let i = 0; i < n; i++) {
    const method = zip.readUInt16LE(p + 10);
    const size = zip.readUInt32LE(p + 20);
    const nameLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const commentLen = zip.readUInt16LE(p + 32);
    const local = zip.readUInt32LE(p + 42);
    const name = zip.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith(".exe") || name.endsWith("/")) continue;
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const raw = zip.subarray(start, start + size);
    yield { name, text: (method === 8 ? zlib.inflateRawSync(raw) : raw).toString("utf8") };
  }
}

const tenFile = [];
for (const f of fileTrongZip(buf)) {
  tenFile.push(f.name);
  if (/^\.env/i.test(path.basename(f.name.replace(/\\/g, "/")))) throw new Error(`Bộ cài có ${f.name} — không được.`);
  if (/^\s*(PRINT_BRIDGE_PASSWORD|SUPABASE_SERVICE_ROLE_KEY)=\S|AGE-SECRET-KEY-/m.test(f.text)) {
    throw new Error(`Bộ cài chứa bí mật trong ${f.name} — dừng, KHÔNG đưa lên.`);
  }
}
// Ngoài cùng CHỈ có CAI-DAT.bat + bo-cai/ — người lắp không phải đoán bấm file nào. PowerShell 5.1 ghi tên
// mục zip bằng "\" nên chuẩn hóa trước khi so.
const chuan = tenFile.map((t) => t.replace(/\\/g, "/"));
const ngoai = [...new Set(chuan.map((t) => t.split("/")[0]))].sort();
if (ngoai.join(",") !== "CAI-DAT.bat,bo-cai") {
  throw new Error(`Ngoài cùng bộ cài phải chỉ có CAI-DAT.bat + bo-cai, đang có: ${ngoai.join(", ")}`);
}
for (const can of ["bo-cai/print-bridge.mjs", "bo-cai/print-setup.ps1", "bo-cai/print-activate.ps1"]) {
  if (!chuan.includes(can)) throw new Error(`Bộ cài thiếu ${can} — đóng gói lại.`);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const { error } = await admin.storage.from(BUCKET).upload(FILE, buf, { contentType: "application/zip", upsert: true });
if (error) {
  console.error(`Đưa lên thất bại: ${error.message}`);
  process.exit(1);
}
console.log(`Đã đưa ${FILE} lên (${(buf.length / 1048576).toFixed(1)} MB, ${tenFile.length} file văn bản đã kiểm).`);
