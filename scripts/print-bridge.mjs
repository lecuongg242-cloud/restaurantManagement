// scripts/print-bridge.mjs — Cầu in ESC/POS cục bộ (V1.x, D1 §7 / QD-005).
//
// App chạy trên Vercel KHÔNG với tới máy in LAN của quán, nên phải có tiến trình này chạy tại
// quán: poll print_jobs status=pending → dựng lệnh ESC/POS → gửi thẳng TCP tới máy in bếp
// (cổng 9100) → đánh dấu printed/failed. POS không đổi nghiệp vụ (PRINT-01).
//
// Chạy:  npm run print:bridge          (vòng lặp thật)
//        npm run print:bridge:test     (in 1 phiếu mẫu, không đụng DB — dùng để thử máy in)
//        node scripts/print-bridge.mjs --test-auth   (kiểm đăng nhập lúc lắp đặt)
//
// Env (đọc từ .env.local): NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
// PRINT_BRIDGE_EMAIL, PRINT_BRIDGE_PASSWORD (cấp ở /super → "Tài khoản cầu in"),
// PRINTER_HOST, PRINTER_PORT, PRINTER_CHARS, POLL_MS, MAX_JOB_AGE_MIN.
//
// KHÔNG dùng service-role: máy này đặt tại quán, service-role bỏ qua RLS nên mất máy là lộ dữ
// liệu MỌI nhà hàng (QD-012 §1). Tenant suy từ token, không cấu hình tay.
//
// KHÔNG phụ thuộc npm nào — chỉ dùng thư viện sẵn của Node (net/fs) + fetch. Nhờ vậy lắp tại quán
// chỉ cần copy FILE NÀY + .env.local sang laptop có Node 20+, không phải clone repo hay npm install.
//
// CHỈ chạy MỘT tiến trình cầu in cho mỗi quán — hai tiến trình sẽ in trùng phiếu.
import net from "node:net";
import crypto from "node:crypto";
import zlib from "node:zlib";
import os from "node:os";
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * Đọc .env.local cạnh file này, rồi tới thư mục cha (repo root khi chạy từ repo).
 * Tự đọc thay vì dùng dotenv để cầu in không cần node_modules — xem ghi chú đầu file.
 * Biến đã có sẵn trong môi trường thì GIỮ NGUYÊN (cho phép ghi đè khi chạy bằng Task Scheduler).
 */
function loadEnv() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  for (const dir of [here, path.join(here, "..")]) {
    const file = path.join(dir, ".env.local");
    if (!fs.existsSync(file)) continue;
    for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      // Bỏ nháy bao quanh nếu có ("..." hoặc '...').
      if (value.length > 1 && /^(".*"|'.*')$/s.test(value)) value = value.slice(1, -1);
      if (process.env[key] === undefined) process.env[key] = value;
    }
    return file;
  }
  return null;
}

const envFile = loadEnv();

const TEST_MODE = process.argv.includes("--test");
const HOST = process.env.PRINTER_HOST || "192.168.1.234";
const PORT = Number(process.env.PRINTER_PORT || 9100);
const CHARS = Number(process.env.PRINTER_CHARS || 48); // 80mm=48, 58mm=32
const POLL_MS = Number(process.env.POLL_MS || 2000);
const SOCKET_TIMEOUT_MS = 8000;
// Số lần THỬ LẠI khi gửi hỏng (ngoài lần đầu). 0 = giữ hành vi cũ.
const SO_LAN_THU_LAI = Number(process.env.PRINT_RETRY ?? 2);
/**
 * Bỏ qua job pending quá cũ. Cầu in tắt một đêm rồi bật lại mà không có chốt này thì toàn bộ phiếu
 * tồn đọng tuôn ra một lượt — bếp nhận cả chục phiếu của hôm qua. Quá hạn thì POS hiện chip đỏ
 * "Bếp CHƯA in", nhân viên chủ động in lại phiếu nào còn cần.
 */
const MAX_JOB_AGE_MIN = Number(process.env.MAX_JOB_AGE_MIN || 30);
// Máy in QUẦY (PRINT-15): "usb:<tên máy in Windows>" hoặc "lan:<ip>[:cổng]". Không khai → cầu in chỉ in
// phiếu bếp, y như trước (hóa đơn vẫn in trình duyệt ở máy quầy).
const COUNTER_PRINTER = process.env.COUNTER_PRINTER || "";
const COUNTER_WIDTH = process.env.COUNTER_WIDTH === "58" ? "58" : "80";

// ── ESC/POS ────────────────────────────────────────────────────────────────────
const ESC = 0x1b;
const GS = 0x1d;
const CMD = {
  init: Buffer.from([ESC, 0x40]),
  alignLeft: Buffer.from([ESC, 0x61, 0]),
  alignCenter: Buffer.from([ESC, 0x61, 1]),
  boldOn: Buffer.from([ESC, 0x45, 1]),
  boldOff: Buffer.from([ESC, 0x45, 0]),
  sizeNormal: Buffer.from([GS, 0x21, 0x00]),
  sizeTall: Buffer.from([GS, 0x21, 0x01]), // cao gấp đôi, rộng giữ nguyên
  sizeBig: Buffer.from([GS, 0x21, 0x11]), // cao + rộng gấp đôi
  cut: Buffer.from([GS, 0x56, 0x42, 0x00]), // cắt một phần, có đẩy giấy
};

/**
 * Bỏ dấu tiếng Việt về ASCII. Máy in nhiệt phổ thông không có sẵn bảng mã Việt (CP1258);
 * "PHO BO TAI" luôn in được, còn "PHỞ BÒ" dễ ra ký tự rác. Bếp vẫn đọc hiểu bình thường.
 */
function ascii(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // dấu tổ hợp (huyền/sắc/hỏi/ngã/nặng + râu ơ/ư)
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^\x20-\x7e]/g, " ")
    .replace(/\s+$/g, "");
}

/** Ngắt dòng theo bề rộng khổ giấy; từ dài hơn 1 dòng thì cắt cứng. */
function wrap(text, width = CHARS) {
  const out = [];
  let line = "";
  for (const word of ascii(text).split(/\s+/).filter(Boolean)) {
    if (!line) line = word;
    else if (line.length + 1 + word.length <= width) line += ` ${word}`;
    else {
      out.push(line);
      line = word;
    }
    while (line.length > width) {
      out.push(line.slice(0, width));
      line = line.slice(width);
    }
  }
  if (line) out.push(line);
  return out.length ? out : [""];
}

/** Một dòng hai đầu: trái căn trái, phải căn phải. */
function row(left, right) {
  const l = ascii(left);
  const r = ascii(right);
  const gap = Math.max(1, CHARS - l.length - r.length);
  return `${l}${" ".repeat(gap)}${r}`;
}

function timeVN(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
  });
}

/**
 * Dựng buffer ESC/POS từ payload print_jobs (KitchenTicketView trong lib/print/adapter.ts).
 * Bố cục KHỚP phiếu trình duyệt (components/print/KitchenTicketDoc.tsx) để bếp đọc quen mắt.
 */
function buildKitchenTicket(ticket) {
  const parts = [];
  const text = (s) => parts.push(Buffer.from(`${s}\n`, "latin1"));
  const cmd = (b) => parts.push(b);

  cmd(CMD.init);
  cmd(CMD.alignCenter);

  cmd(CMD.boldOn);
  for (const l of wrap(ticket.tenantName)) text(l);
  text(`PHIEU BEP${ticket.isReprint ? " (IN LAI)" : ""}`);
  cmd(CMD.boldOff);

  if (ticket.kitchenNo != null) {
    cmd(CMD.sizeBig);
    cmd(CMD.boldOn);
    text(`DON #${ticket.kitchenNo}`);
    cmd(CMD.boldOff);
    cmd(CMD.sizeNormal);
  }

  cmd(CMD.alignLeft);
  text("-".repeat(CHARS));
  text(row(`Ban: ${ticket.tableName ?? "-"}`, `#${ticket.ticketNo ?? ""}`));
  const qty = (ticket.items ?? []).reduce((acc, i) => acc + (i.qty ?? 0), 0);
  text(row(timeVN(ticket.confirmedAt), `${qty} phan`));
  text("-".repeat(CHARS));

  for (const item of ticket.items ?? []) {
    cmd(CMD.boldOn);
    cmd(CMD.sizeTall);
    for (const l of wrap(`${item.qty}x ${item.name}`)) text(l);
    cmd(CMD.sizeNormal);
    cmd(CMD.boldOff);
    for (const m of item.modifiers ?? []) {
      for (const l of wrap(`+ ${m}`, CHARS - 2)) text(`  ${l}`);
    }
    if (item.note) {
      cmd(CMD.boldOn);
      for (const l of wrap(`>> ${item.note}`, CHARS - 2)) text(`  ${l}`);
      cmd(CMD.boldOff);
    }
  }

  text("-".repeat(CHARS));
  cmd(CMD.alignCenter);
  text("-- het phieu --");
  text("");
  cmd(CMD.cut);

  return Buffer.concat(parts);
}

// ── Gửi tới máy in ─────────────────────────────────────────────────────────────
function sendToPrinter(buffer, host = HOST, port = PORT) {
  return new Promise((resolve, reject) => {
    let done = false;
    const socket = net.connect({ host, port });
    socket.setTimeout(SOCKET_TIMEOUT_MS);
    socket.on("connect", () =>
      // Xong khi dữ liệu đã đẩy hết ra socket — nhiều máy in reset kết nối ngay sau khi nhận,
      // chờ 'close' sạch sẽ báo lỗi giả (ECONNRESET) dù giấy đã ra.
      socket.end(buffer, () => {
        done = true;
        socket.destroy();
        resolve();
      })
    );
    socket.on("timeout", () => {
      socket.destroy();
      if (!done) reject(new Error(`Hết thời gian chờ máy in ${host}:${port}`));
    });
    socket.on("error", (err) => {
      if (!done) reject(err);
    });
  });
}

function log(...args) {
  console.log(new Date().toLocaleTimeString("vi-VN"), ...args);
}

/**
 * Gửi byte thô tới máy in Windows theo TÊN qua `print-raw.ps1` (máy quầy cắm USB). Ở cấp module (không trong
 * khối vòng lặp thật) để chế độ in thử `--vai=quay` dùng chung.
 */
function inQuaWindows(buffer, ten) {
  const tep = path.join(os.tmpdir(), `cau-in-${process.pid}-${Date.now()}.bin`);
  fs.writeFileSync(tep, buffer);
  const kichBan = path.join(path.dirname(fileURLToPath(import.meta.url)), "print-raw.ps1");
  return new Promise((resolve, reject) => {
    execFile(
      "powershell",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", kichBan, "-PrinterName", ten, "-Path", tep],
      { timeout: 60_000, windowsHide: true },
      (err, _out, stderr) => {
        fs.rmSync(tep, { force: true });
        if (err) reject(new Error((stderr || err.message).toString().trim()));
        else resolve();
      }
    );
  });
}

// ── Chế độ thử máy in (không cần DB) ───────────────────────────────────────────
if (TEST_MODE) {
  const demo = {
    tenantName: "QUAN THU NGHIEM",
    isReprint: false,
    kitchenNo: 12,
    tableName: "Ban 5",
    ticketNo: "TEST01",
    confirmedAt: new Date().toISOString(),
    items: [
      { qty: 2, name: "Phở bò tái", modifiers: ["Nhiều hành"], note: "Không rau" },
      { qty: 1, name: "Cơm gà xối mỡ", modifiers: [], note: null },
    ],
  };
  // `--vai=quay` (DESK-06): in thử MÁY IN QUẦY theo COUNTER_PRINTER — app "TechMenu Thu ngân" có nút In thử cho cả hai.
  const quay = process.argv.includes("--vai=quay");
  const mayQuay = quay ? docCauHinhMayIn(COUNTER_PRINTER) : null;
  if (quay && !mayQuay) {
    console.error(`Chưa khai máy in quầy hợp lệ (COUNTER_PRINTER="${COUNTER_PRINTER}").`);
    process.exit(1);
  }
  log(
    mayQuay
      ? `In phiếu thử tới máy in quầy ${mayQuay.kieu === "usb" ? mayQuay.ten : `${mayQuay.host}:${mayQuay.port}`}…`
      : `In phiếu thử tới ${HOST}:${PORT} (khổ ${CHARS} ký tự)…`
  );
  try {
    const giay = buildKitchenTicket(demo);
    if (mayQuay?.kieu === "usb") await inQuaWindows(giay, mayQuay.ten);
    else if (mayQuay) await sendToPrinter(giay, mayQuay.host, mayQuay.port);
    else await sendToPrinter(giay);
    log(`Đã gửi xong. Kiểm tra giấy ra ở máy in ${mayQuay ? "quầy" : "bếp"}.`);
    process.exit(0);
  } catch (err) {
    console.error("Lỗi gửi máy in:", err.message);
    process.exit(1);
  }
}

// ── Thử lại khi gửi hỏng ──────────────────────────────────────────────────────
/**
 * Khoảng chờ giữa các lần thử, giãn dần. Máy in đang nghẽn mà dội liên tiếp vào thì chỉ nghẽn
 * thêm; chờ một nhịp rồi thử lại mới có cơ hội qua.
 */
export const CHO_GIUA_LAN_MS = [1000, 3000];

/**
 * Gửi tới máy in, hỏng thì thử lại `soLanThuLai` lần trước khi bỏ cuộc.
 *
 * VÌ SAO: trước đây hỏng một lần là đánh `failed` luôn. Dữ liệu qt-food (24/09/2026): 174 lượt
 * failed, chỉ 52 được in lại — **122 phiếu không bao giờ tới bếp**. Phục hồi dựa hoàn toàn vào
 * người để ý chip đỏ giữa giờ cao điểm, và họ bỏ sót 70%.
 *
 * Phần lớn lỗi là chớp nhoáng (nghẽn LAN, timeout socket). Máy in rút dây thật thì thử mấy lần
 * cũng hỏng — và lúc đó đánh `failed` mới đúng, chip đỏ vẫn hiện.
 *
 * Ném lỗi của LẦN CUỐI để log nói đúng nguyên nhân thật, không phải lỗi của lần đầu.
 *
 * @param {() => Promise<unknown>} gui
 * @param {number} [soLanThuLai]
 * @param {number|null} [choMs] Ép khoảng chờ (test dùng 0); bỏ trống = dùng CHO_GIUA_LAN_MS.
 */
export async function thuLaiGui(gui, soLanThuLai = 2, choMs = null) {
  let loiCuoi;
  for (let lan = 0; lan <= soLanThuLai; lan++) {
    try {
      return await gui();
    } catch (err) {
      loiCuoi = err;
      if (lan === soLanThuLai) break;
      const cho = choMs ?? CHO_GIUA_LAN_MS[Math.min(lan, CHO_GIUA_LAN_MS.length - 1)];
      if (cho > 0) await new Promise((r) => setTimeout(r, cho));
    }
  }
  throw loiCuoi;
}

// ── Nhịp poll thích ứng (PERF-03) ─────────────────────────────────────────────
/**
 * Nhịp poll kế tiếp theo số nhịp RỖNG liên tiếp (nhịp không tìm thấy phiếu nào).
 *
 * Quán đóng cửa mà vẫn hỏi 2 giây/lần là 1.800 request/giờ cho một câu trả lời "không có gì".
 * Bậc thang: 0–4 → nhịp nền · 5–14 → ×2.5 · ≥15 → ×5 (trần).
 *
 * Trần cố ý thấp. Giãn tới 30–60 giây tiết kiệm thêm chẳng bao nhiêu nhưng đổi lấy việc bếp đứng
 * nhìn máy in, và ở quán thì không ai đoán được nguyên nhân là nhịp poll.
 *
 * Nhân theo tỉ lệ `baseMs` để ai đặt POLL_MS khác vẫn giữ đúng tinh thần bậc thang.
 */
export function nextPollMs(emptyStreak, baseMs) {
  const base = Number(baseMs) > 0 ? Number(baseMs) : 2000;
  if (emptyStreak >= 15) return base * 5;
  if (emptyStreak >= 5) return base * 2.5;
  return base;
}

// ── Nhịp tim (PRINT-08) ───────────────────────────────────────────────────────
/**
 * Cầu in báo "còn sống" mỗi 30 giây. Server coi là chết sau 90 giây không nghe (3 nhịp) và
 * chuyển POS sang in trình duyệt — xem lib/print/cau-in.ts. Hai con số dính nhau; test khẳng định
 * ngưỡng ≥ 3 × nhịp.
 *
 * Chạy bằng timer RIÊNG, không nằm trong vòng poll: đang kẹt gửi máy in (8 giây timeout × 3 lần
 * thử × 10 phiếu) mà ngừng báo sống thì POS tưởng cầu in chết, chuyển sang in trình duyệt, rồi cầu
 * in gửi xong → bếp nhận hai tờ.
 */
export const NHIP_TIM_MS = 30_000;

// ── Một cầu in mỗi máy (PRINT-08) ─────────────────────────────────────────────
/**
 * Bộ cài chạy cầu in bằng tác vụ SYSTEM lúc bật máy — KHÔNG có cửa sổ. Nhân viên tưởng nó tắt,
 * double-click print-bridge.bat → hai cầu in cùng thấy một phiếu `pending` → bếp nhận HAI tờ.
 *
 * Khóa bằng cổng TCP trên 127.0.0.1 thay vì tệp .lock: hệ điều hành tự nhả cổng khi tiến trình
 * chết, kể cả chết đột ngột — không bao giờ kẹt khóa mồ côi bắt ai đó ra quán xóa tay. Cổng là
 * toàn máy nên chặn được cả bản chạy dưới SYSTEM lẫn bản chạy dưới người dùng.
 */
export const CONG_KHOA = 47291;

/** Mã thoát khi đã có cầu in khác chạy. Khác 1 để print-bridge.bat không coi là "chết, chạy lại". */
export const MA_THOAT_DA_CHAY = 3;

// ── Tự cập nhật (PRINT-12, QD-019 D8) ─────────────────────────────────────────
/**
 * Phiên bản cầu in — số nguyên, TĂNG MỖI LẦN SỬA TỆP NÀY. Server đọc chính hằng này từ tệp được
 * deploy (`lib/print/bridge-release.ts`) để công bố bản mới; cầu in ở quán so với nó để biết có bản
 * mới. Bản 1 = mọi cầu in trước 11-06 (không báo phiên bản).
 */
export const BRIDGE_VERSION = 4;

/** Mã thoát sau khi đã thay tệp bằng bản mới — print-bridge.bat chạy lại NGAY, không tính là chết. */
export const MA_THOAT_DA_CAP_NHAT = 4;

/** Kiểm bản mới lúc khởi động và mỗi giờ. Đổi được qua env chỉ để thử nghiệm. */
export const KIEM_CAP_NHAT_MS = Number(process.env.UPDATE_CHECK_MS || 60 * 60_000);

/** Chạy khỏe liên tục chừng này → xóa bộ đếm "chết liên tiếp" mà bat dùng để quay về bản cũ. */
export const KHOE_SAU_MS = 5 * 60_000;

/**
 * Có nên cập nhật không. Đang in thì KHÔNG: thoát giữa lúc gửi máy in là mất phiếu đang gửi. Phản
 * hồi rác từ server (không phải số nguyên) cũng không — cầu in không được chết vì một bản deploy lỗi.
 */
export function nenCapNhat({ hienTai, moiNhat, dangIn }) {
  return Number.isInteger(moiNhat) && moiNhat > hienTai && !dangIn;
}

/** Nội dung tải về có đúng SHA-256 server công bố không. Thiếu SHA → không. */
export function khopSha(buf, sha) {
  if (typeof sha !== "string" || !sha) return false;
  return crypto.createHash("sha256").update(buf).digest("hex") === sha.toLowerCase();
}

// ── In ảnh: hóa đơn / phiếu khách có dấu ra máy in QUẦY (PRINT-15, QD-020 D4–D6) ──────────────
/**
 * Máy in nhiệt phổ thông không có bảng mã tiếng Việt ⇒ hóa đơn in dạng ẢNH: server dựng PNG có dấu
 * (`/api/print/jobs/[id]/image`), cầu in giải mã PNG → đen trắng → lệnh in ảnh `GS v 0`. Tự giải mã PNG
 * bằng `zlib` có sẵn — cầu in không dùng gói npm nào (PERF-03).
 */

/** Chiều cao mỗi dải ảnh gửi máy in. Máy rẻ giới hạn kích thước một lệnh `GS v 0` — chia nhỏ cho chắc. */
export const DAI_ANH = Number(process.env.RASTER_BAND || 128);

/** PNG 8-bit (xám / xám+alpha / RGB / RGBA / bảng màu), không xen kẽ → { rong, cao, rgba }. */
export function giaiMaPng(buf) {
  const CHU_KY = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!Buffer.isBuffer(buf) || buf.length < 33 || CHU_KY.some((b, i) => buf[i] !== b)) {
    throw new Error("Không phải tệp PNG");
  }
  let rong = 0, cao = 0, doSau = 0, kieuMau = 0, xenKe = 0, bangMau = null;
  const idat = [];
  for (let i = 8; i + 8 <= buf.length; ) {
    const dai = buf.readUInt32BE(i);
    const loai = buf.toString("latin1", i + 4, i + 8);
    const data = buf.subarray(i + 8, i + 8 + dai);
    if (loai === "IHDR") {
      rong = data.readUInt32BE(0);
      cao = data.readUInt32BE(4);
      doSau = data[8];
      kieuMau = data[9];
      xenKe = data[12];
    } else if (loai === "PLTE") bangMau = data;
    else if (loai === "IDAT") idat.push(data);
    else if (loai === "IEND") break;
    i += 12 + dai;
  }
  if (!rong || !cao) throw new Error("PNG thiếu IHDR");
  if (doSau !== 8 || xenKe !== 0) throw new Error(`PNG không hỗ trợ (độ sâu ${doSau}, xen kẽ ${xenKe})`);
  const kenh = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[kieuMau];
  if (!kenh) throw new Error(`PNG kiểu màu ${kieuMau} không hỗ trợ`);

  const tho = zlib.inflateSync(Buffer.concat(idat));
  const bpp = kenh; // byte mỗi điểm (8-bit)
  const hang = rong * bpp;
  const ra = Buffer.alloc(hang * cao);
  for (let y = 0; y < cao; y++) {
    const loc = tho[y * (hang + 1)];
    const vao = tho.subarray(y * (hang + 1) + 1, (y + 1) * (hang + 1));
    const off = y * hang;
    for (let x = 0; x < hang; x++) {
      const a = x >= bpp ? ra[off + x - bpp] : 0;
      const b = y > 0 ? ra[off - hang + x] : 0;
      const c = x >= bpp && y > 0 ? ra[off - hang + x - bpp] : 0;
      let v = vao[x];
      if (loc === 1) v += a;
      else if (loc === 2) v += b;
      else if (loc === 3) v += (a + b) >> 1;
      else if (loc === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (loc !== 0) throw new Error(`PNG kiểu lọc ${loc} không hợp lệ`);
      ra[off + x] = v & 0xff;
    }
  }

  const rgba = Buffer.alloc(rong * cao * 4);
  for (let i = 0; i < rong * cao; i++) {
    const s = i * bpp;
    let r, g, bl, al = 255;
    if (kieuMau === 0) r = g = bl = ra[s];
    else if (kieuMau === 4) { r = g = bl = ra[s]; al = ra[s + 1]; }
    else if (kieuMau === 2) { r = ra[s]; g = ra[s + 1]; bl = ra[s + 2]; }
    else if (kieuMau === 6) { r = ra[s]; g = ra[s + 1]; bl = ra[s + 2]; al = ra[s + 3]; }
    else { const k = ra[s] * 3; r = bangMau[k]; g = bangMau[k + 1]; bl = bangMau[k + 2]; }
    rgba[i * 4] = r; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = bl; rgba[i * 4 + 3] = al;
  }
  return { rong, cao, rgba };
}

/**
 * Ảnh → điểm đen/trắng cho máy nhiệt (bit 1 = đốt đen). Alpha phủ lên nền trắng rồi lấy ngưỡng độ
 * sáng. Điểm trái nhất là bit CAO của byte. Cắt các dòng trắng ở đáy — server ước dư chiều cao ảnh.
 */
export function thanhAnhDen({ rong, cao, rgba }, nguong = 160) {
  const rongByte = Math.ceil(rong / 8);
  const bits = Buffer.alloc(rongByte * cao);
  let dongCuoiCoMuc = -1;
  for (let y = 0; y < cao; y++) {
    for (let x = 0; x < rong; x++) {
      const i = (y * rong + x) * 4;
      const a = rgba[i + 3] / 255;
      const sang = (0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]) * a + 255 * (1 - a);
      if (sang < nguong) {
        bits[y * rongByte + (x >> 3)] |= 0x80 >> (x & 7);
        dongCuoiCoMuc = y;
      }
    }
  }
  const caoMoi = dongCuoiCoMuc + 1;
  return { rongByte, cao: caoMoi, bits: bits.subarray(0, rongByte * caoMoi) };
}

/** Lệnh in ảnh: khởi tạo → các dải `GS v 0` → đẩy giấy → cắt. */
export function lenhInAnh({ rongByte, cao, bits }, dai = DAI_ANH) {
  const phan = [Buffer.from([0x1b, 0x40])];
  for (let y = 0; y < cao; y += dai) {
    const h = Math.min(dai, cao - y);
    phan.push(Buffer.from([0x1d, 0x76, 0x30, 0, rongByte & 0xff, rongByte >> 8, h & 0xff, h >> 8]));
    phan.push(bits.subarray(y * rongByte, (y + h) * rongByte));
  }
  phan.push(Buffer.from([0x1b, 0x64, 4])); // đẩy 4 dòng trước khi cắt
  phan.push(Buffer.from([0x1d, 0x56, 0x42, 0x00]));
  return Buffer.concat(phan);
}

/** `COUNTER_PRINTER` = "usb:<tên máy in Windows>" | "lan:<ip>[:cổng]". Sai → null (không in quầy). */
export function docCauHinhMayIn(s) {
  if (typeof s !== "string") return null;
  const m = /^(usb|lan):(.+)$/i.exec(s.trim());
  if (!m || !m[2].trim()) return null;
  if (m[1].toLowerCase() === "usb") return { kieu: "usb", ten: m[2].trim() };
  const [host, cong] = m[2].trim().split(":");
  const port = cong ? Number(cong) : 9100;
  if (!host || !Number.isInteger(port)) return null;
  return { kieu: "lan", host, port };
}

/** Phiếu nào ra máy nào. Hóa đơn / phiếu khách chỉ nhận khi đã khai máy in quầy. */
export function dichInCua(loai, coQuay) {
  if (loai === "kitchen_ticket") return "bep";
  if ((loai === "receipt" || loai === "customer_ticket") && coQuay) return "quay";
  return null;
}

// ── Thử máy in (PRINT-09) ──────────────────────────────────────────────────────
/**
 * Máy in có phản hồi không: mở kết nối TCP rồi đóng NGAY, KHÔNG gửi byte nào — máy in không ra
 * giấy. Nhịp tim chỉ biết cầu in còn sống; máy in rút dây mà cầu in vẫn chạy thì trước đây chỉ lộ
 * ra khi có phiếu `failed`.
 */
export function thuMayIn(host, port, timeoutMs = 3000) {
  return new Promise((resolve) => {
    let xong = false;
    const ket = (ok) => {
      if (xong) return;
      xong = true;
      socket.destroy();
      resolve(ok);
    };
    const socket = net.connect({ host, port });
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => ket(true));
    socket.once("timeout", () => ket(false));
    socket.once("error", () => ket(false));
  });
}

/** Giữ khóa một phiên. Trả về `{ thaRa }` nếu giữ được, `null` nếu đã có cầu in khác giữ. */
export function giuMotPhien(cong = CONG_KHOA) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(null));
    server.listen(cong, "127.0.0.1", () => {
      // Không để riêng cổng khóa giữ tiến trình sống — vòng poll mới là thứ giữ.
      server.unref();
      resolve({ thaRa: () => new Promise((r) => server.close(() => r())) });
    });
  });
}

/**
 * Tệp này vừa là script chạy tại quán, vừa là module để test import `nextPollMs`.
 * Không có guard thì `import` từ vitest sẽ nối vào Supabase và poll thật — và vì thiếu biến môi
 * trường, nó gọi luôn `process.exit(1)` giữa lúc chạy test.
 */
const laEntry = import.meta.url === pathToFileURL(process.argv[1] ?? "").href;

if (laEntry) {

// ── Vòng lặp thật ──────────────────────────────────────────────────────────────
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const bridgeEmail = process.env.PRINT_BRIDGE_EMAIL;
const bridgePassword = process.env.PRINT_BRIDGE_PASSWORD;

if (!url || !anonKey || !bridgeEmail || !bridgePassword) {
  console.error(
    `Thiếu NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / PRINT_BRIDGE_EMAIL / ` +
      `PRINT_BRIDGE_PASSWORD${envFile ? ` trong ${envFile}` : " (không tìm thấy .env.local)"}.
` +
      `Chạy lại CAI-DAT.bat và nhập MÃ KÍCH HOẠT (tạo ở /super → hàng nhà hàng → "Mã cài cầu in").`
  );
  process.exit(1);
}

const BASE = url.replace(/\/+$/, "");
const REST = `${BASE}/rest/v1`;

/**
 * Máy này đặt TẠI QUÁN nên KHÔNG bao giờ giữ service-role (QD-012 §1): service-role bỏ qua RLS,
 * một laptop bị mất là lộ dữ liệu của mọi nhà hàng. Cầu in đăng nhập như mọi client khác, bằng
 * tài khoản thiết bị vai trò `printer` chỉ thuộc đúng quán này. RLS lo phần còn lại.
 */
let accessToken = null;

async function login() {
  const res = await fetch(`${BASE}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email: bridgeEmail, password: bridgePassword }),
  });
  if (!res.ok) {
    throw new Error(
      `Đăng nhập cầu in thất bại (HTTP ${res.status}). Kiểm tra PRINT_BRIDGE_EMAIL/PASSWORD, ` +
        `hoặc cấp lại tài khoản ở /super.`
    );
  }
  const body = await res.json();
  accessToken = body.access_token;
}

/**
 * Gọi PostgREST bằng fetch — không dùng @supabase/supabase-js để cầu in không cần npm.
 * Token hết hạn (401) thì đăng nhập lại MỘT lần rồi thử lại: đơn giản hơn theo dõi hạn token và
 * bền hơn với tiến trình chạy liên tục nhiều ngày.
 */
async function rest(pathAndQuery, init = {}, allowRetry = true) {
  if (!accessToken) await login();

  const res = await fetch(`${REST}${pathAndQuery}`, {
    ...init,
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

  if (res.status === 401 && allowRetry) {
    accessToken = null;
    return rest(pathAndQuery, init, false);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${(await res.text()).slice(0, 200)}`);
  if (res.status === 204) return null;
  const body = await res.text();
  return body ? JSON.parse(body) : null;
}

/**
 * Tenant suy từ CHÍNH token, không phải từ biến môi trường: cấu hình nhầm quán trở thành chuyện
 * không thể xảy ra, và RLS là thứ quyết định chứ không phải quy ước trong file này.
 *
 * Trả null thay vì thoát khi chưa tra được: quán bị tạm ngưng làm auth_tenant_ids() rỗng, và cầu
 * in phải tự hoạt động lại khi quán được kích hoạt, không cần ai ra tận nơi bật lại.
 */
async function resolveTenantId() {
  let rows;
  try {
    rows = await rest(`/memberships?select=tenant_id&role=eq.printer&active=is.true&limit=1`);
  } catch (err) {
    log(`Chưa tra được nhà hàng: ${err.message}`);
    return null;
  }
  if (!rows?.length) {
    log("Tài khoản cầu in chưa gắn nhà hàng nào, hoặc nhà hàng đang tạm ngưng. Sẽ thử lại.");
    return null;
  }
  return rows[0].tenant_id;
}

/**
 * Báo "còn sống" cho server (PRINT-08). Mốc giờ do database ghi — hàm không nhận tham số giờ.
 *
 * Chỉ ghi log khi TRẠNG THÁI đổi (hỏng → lành, lành → hỏng). Mất mạng một tiếng mà ghi mỗi 30 giây
 * là 120 dòng giống hệt nhau, và người xem log bỏ qua luôn dòng quan trọng.
 */
let nhipTimDangLoi = false;

const inFlight = new Set(); // chống lấy lại job đang in trong cùng tiến trình

/**
 * Kết quả gần nhất về máy in (PRINT-09): cập nhật bởi lần THỬ máy in lúc rảnh, và bởi KẾT QUẢ IN
 * THẬT. Đang in liên tục thì không thử (máy in rẻ chỉ nhận một kết nối một lúc — thử đúng lúc in là
 * làm hỏng lượt in), nhưng lượt in vừa xong đã là câu trả lời, nên màn admin không rơi vào "không
 * biết" giữa giờ cao điểm.
 */
let mayInPhanHoi = null;
/** Máy in quầy (null = không khai) và kết quả gần nhất của nó. */
const MAY_QUAY = docCauHinhMayIn(COUNTER_PRINTER);
let quayPhanHoi = null;
if (COUNTER_PRINTER && !MAY_QUAY) {
  log(`COUNTER_PRINTER="${COUNTER_PRINTER}" không hợp lệ (cần usb:<tên> hoặc lan:<ip>) — bỏ qua máy in quầy.`);
}

/**
 * Nguồn cầu in (DESK-05): app "TechMenu Thu ngân" đặt `BRIDGE_AGENT` (vd `app/1.0.0`) để màn Máy in phân biệt với
 * cầu in cũ. Cầu in cũ không đặt ⇒ thân nhịp tim y như bản 4. Máy chủ chưa có migration 0075 (không nhận
 * `p_agent`) ⇒ bỏ trường này, gửi lại, và thôi gửi luôn — cầu in không được chết vì máy chủ cũ hơn.
 */
let guiAgent = Boolean(process.env.BRIDGE_AGENT);

/** Chạy trong app (có kênh IPC): báo tình trạng cho biểu tượng khay sau mỗi nhịp tim. Chạy tay / bat: không làm gì. */
function baoChoApp(nhipOk) {
  if (typeof process.send !== "function" || !process.connected) return;
  try {
    process.send({ loai: "trang-thai", nhipOk, bep: mayInPhanHoi, quay: MAY_QUAY ? quayPhanHoi : undefined });
  } catch {
    /* app đang tắt */
  }
}

async function baoSong() {
  if (inFlight.size === 0) {
    mayInPhanHoi = await thuMayIn(HOST, PORT);
    // Máy quầy LAN: thử kết nối như máy bếp. USB: không thử được rẻ — dùng kết quả lần in gần nhất.
    if (MAY_QUAY?.kieu === "lan") quayPhanHoi = await thuMayIn(MAY_QUAY.host, MAY_QUAY.port);
  }
  const than = () =>
    JSON.stringify({
      p_printer_ok: mayInPhanHoi,
      p_printer_host: `${HOST}:${PORT}`,
      p_version: BRIDGE_VERSION,
      ...(MAY_QUAY ? { p_counter_ok: quayPhanHoi, p_counter_target: COUNTER_PRINTER.trim().slice(0, 150) } : {}),
      ...(guiAgent ? { p_agent: String(process.env.BRIDGE_AGENT).slice(0, 40) } : {}),
    });
  try {
    try {
      await rest(`/rpc/printer_heartbeat`, { method: "POST", body: than() });
    } catch (err) {
      if (!guiAgent || !/PGRST202|p_agent/.test(err.message)) throw err;
      guiAgent = false;
      await rest(`/rpc/printer_heartbeat`, { method: "POST", body: than() });
    }
    if (nhipTimDangLoi) log("Nhịp tim đã nối lại — POS quay về gửi phiếu bếp qua cầu in.");
    nhipTimDangLoi = false;
    baoChoApp(true);
    return true;
  } catch (err) {
    baoChoApp(false);
    if (!nhipTimDangLoi) {
      log(`KHÔNG báo sống được (${err.message}). Sau 90 giây POS sẽ tự in phiếu bếp bằng trình duyệt.`);
    }
    nhipTimDangLoi = true;
    return false;
  }
}

// Xác minh thông tin đăng nhập LÚC LẮP ĐẶT, không phải chờ tới phiếu in đầu tiên mới biết sai.
// Không giữ khóa một phiên: bộ cài chạy lệnh này trong lúc tác vụ nền có thể đang chạy.
if (process.argv.includes("--test-auth")) {
  const id = await resolveTenantId();
  if (!id) {
    console.error("Đăng nhập được nhưng chưa gắn nhà hàng nào. Kiểm tra lại ở /super.");
    process.exit(1);
  }
  log(`Đăng nhập OK. Cầu in phục vụ tenant ${id}.`);
  if (!(await baoSong())) {
    console.error(
      "Đăng nhập được nhưng KHÔNG báo sống được. POS sẽ không gửi phiếu bếp qua cầu in này.\n" +
        "Máy chủ có thể chưa cập nhật (thiếu migration 0043) — báo người phụ trách kỹ thuật."
    );
    process.exit(1);
  }
  log("Nhịp tim OK. POS sẽ gửi phiếu bếp qua cầu in này.");
  // Chỉ báo, không làm lệnh thất bại: lúc cài có thể chưa biết IP máy in bếp.
  log(
    mayInPhanHoi
      ? `Máy in ${HOST}:${PORT}: phản hồi.`
      : `Máy in ${HOST}:${PORT}: KHÔNG phản hồi — kiểm tra nguồn, dây mạng, địa chỉ PRINTER_HOST.`
  );
  process.exit(0);
}

const khoa = await giuMotPhien();
if (!khoa) {
  log(
    "Đã có một cầu in khác đang chạy trên máy này (có thể đang chạy nền, không có cửa sổ). " +
      "Không chạy thêm — hai cầu in là mỗi phiếu bếp ra hai tờ."
  );
  process.exit(MA_THOAT_DA_CHAY);
}

// Timer riêng, không nằm trong vòng poll: đang kẹt gửi máy in mà ngừng báo sống thì POS tưởng cầu
// in chết, chuyển sang in trình duyệt, rồi cầu in gửi xong → bếp nhận hai tờ.
// Giữ lượt nhịp tim đang chạy (gồm cả bước thử máy in mở/đóng socket) để lúc thoát chờ nó xong.
let nhipDangChay = null;
function henNhipTim() {
  nhipDangChay = baoSong().finally(() => {
    nhipDangChay = null;
  });
}
henNhipTim();
const henNhip = setInterval(henNhipTim, NHIP_TIM_MS);

// ── Tự cập nhật (PRINT-12) ──
// Địa chỉ app lấy từ POS_URL do bước kích hoạt ghi (11-05). Bộ cài cũ không có dòng này → không tự
// cập nhật được, phải cài lại bằng bộ cài chung một lần.
const APP_BASE = (() => {
  try {
    return process.env.POS_URL ? new URL(process.env.POS_URL).origin : null;
  } catch {
    return null;
  }
})();
const TEP_NAY = fileURLToPath(import.meta.url);
const TEP_CU = path.join(path.dirname(TEP_NAY), "print-bridge.old.mjs");
const TEP_DEM_LOI = path.join(path.dirname(TEP_NAY), "loi-lien-tiep.txt");

/**
 * Mã thoát đang chờ (đã thay tệp xong). KHÔNG `process.exit` ngay trong lúc tải: trên Windows, thoát
 * khi một socket khác đang đóng dở (bước thử máy in của nhịp tim) làm libuv hủy ngang tiến trình
 * ("Assertion failed … UV_HANDLE_CLOSING") với mã 127 thay vì 4 → bat tưởng cầu in chết. Thoát ở điểm
 * an toàn trong vòng poll — xem `thoatNeuCanThoat`.
 */
let yeuCauThoat = null;
/** Đánh thức vòng poll đang ngủ giữa hai lượt — xin thoát thì thoát ngay, không chờ hết nhịp nghỉ (tới 10 giây). */
let danhThuc = null;

// Chạy trong app "TechMenu Thu ngân" (DESK-05): app xin thoát bằng tin "thoat" — thoát ở điểm an toàn, không bỏ dở
// phiếu đang gửi (kill tiến trình con trên Windows là giết ngang). App chết mất kênh IPC → cũng thoát, không để
// cầu in mồ côi chạy song song với cầu in của lần mở app sau.
if (typeof process.send === "function") {
  const xinThoat = () => {
    if (yeuCauThoat === null) yeuCauThoat = 0;
    danhThuc?.();
  };
  process.on("message", (m) => {
    if (m === "thoat") xinThoat();
  });
  process.on("disconnect", xinThoat);
}

/**
 * Tải bản mới nếu có: kiểm SHA → giữ bản đang chạy làm `print-bridge.old.mjs` (bat quay về nó nếu bản
 * mới chết liên tục) → thay tệp → hẹn thoát `MA_THOAT_DA_CAP_NHAT`. Lỗi bất kỳ → giữ bản hiện tại, thử
 * lại lần sau. Tệp đã thay trước khi thoát: tiến trình có chết kiểu gì thì bat cũng chạy bản mới.
 */
async function capNhatNeuCo() {
  // App "TechMenu Thu ngân" tự cập nhật cả gói (DESK-10) — tệp cầu in trong thư mục cài là chỉ đọc, không tự thay.
  if (!APP_BASE || process.env.BRIDGE_TU_CAP_NHAT === "0") return;
  try {
    const r = await fetch(`${APP_BASE}/api/bridge/latest`, { signal: AbortSignal.timeout(15_000) });
    if (!r.ok) return;
    const ban = await r.json();
    if (!nenCapNhat({ hienTai: BRIDGE_VERSION, moiNhat: ban.version, dangIn: inFlight.size > 0 })) return;

    const tai = await fetch(new URL(ban.url, APP_BASE), { signal: AbortSignal.timeout(60_000) });
    if (!tai.ok) return;
    const noiDung = Buffer.from(await tai.arrayBuffer());
    if (!khopSha(noiDung, ban.sha256)) {
      log(`Bản cầu in ${ban.version} tải về KHÔNG khớp SHA-256 — bỏ qua, giữ bản ${BRIDGE_VERSION}.`);
      return;
    }
    if (inFlight.size > 0) return;
    fs.writeFileSync(`${TEP_NAY}.moi`, noiDung);
    fs.copyFileSync(TEP_NAY, TEP_CU);
    fs.renameSync(`${TEP_NAY}.moi`, TEP_NAY);
    log(`Đã tải cầu in bản ${ban.version} (đang chạy bản ${BRIDGE_VERSION}) — khởi động lại bằng bản mới.`);
    yeuCauThoat = MA_THOAT_DA_CAP_NHAT;
  } catch (err) {
    log(`Không kiểm được bản cập nhật (${err.message}) — thử lại sau.`);
  }
}
capNhatNeuCo();
const henCapNhat = setInterval(capNhatNeuCo, KIEM_CAP_NHAT_MS);

/** Gọi giữa hai lượt poll (không phiếu nào đang gửi): dừng nhịp định kỳ, chờ nhịp tim dở dang, rồi thoát. */
async function thoatNeuCanThoat() {
  if (yeuCauThoat === null) return;
  clearInterval(henNhip);
  clearInterval(henCapNhat);
  await nhipDangChay;
  process.exit(yeuCauThoat);
}

// Chạy khỏe đủ lâu (nhịp tim đang thông) → bản này ổn: xóa bộ đếm chết liên tiếp của bat.
setTimeout(() => {
  if (!nhipTimDangLoi) fs.rmSync(TEP_DEM_LOI, { force: true });
}, KHOE_SAU_MS);

let tenantId = await resolveTenantId();

/** Đánh dấu kết quả in. Lỗi mạng ở bước này chỉ ghi log — phiếu đã ra giấy rồi, không in lại. */
async function markJob(id, patch) {
  await rest(`/print_jobs?id=eq.${id}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(patch),
  });
}

/**
 * Phiếu ĐÃ ra giấy nhưng chưa báo "đã in" lên máy chủ được (mạng rớt đúng lúc đó — P17). Không có sổ này thì phiếu vẫn
 * `pending` và lượt poll sau in thêm một tờ. Phiếu trong sổ không bao giờ in lại; đầu mỗi lượt poll báo bù.
 */
const daInChuaBao = new Map();

async function baoDaIn(job, nhan) {
  const patch = { status: "printed", printed_at: new Date().toISOString() };
  try {
    await markJob(job.id, patch);
    log(`Đã in ${nhan}.`);
  } catch (err) {
    daInChuaBao.set(job.id, patch);
    log(`Đã in ${nhan} nhưng chưa báo được lên máy chủ (${err.message}) — sẽ báo lại, KHÔNG in lại.`);
  }
}

async function baoBu() {
  for (const [id, patch] of daInChuaBao) {
    try {
      await markJob(id, patch);
      daInChuaBao.delete(id);
      log(`Đã báo bù phiếu ${id} là đã in.`);
    } catch {
      return; // vẫn mất mạng — lượt sau
    }
  }
}

/** Tải ẢNH phiếu từ server bằng token của cầu in (401 → đăng nhập lại một lần). */
async function taiAnhPhieu(jobId, thuLai = true) {
  if (!APP_BASE) throw new Error("thiếu POS_URL trong .env.local — chạy lại CAI-DAT.bat để kích hoạt lại");
  if (!accessToken) await login();
  const res = await fetch(`${APP_BASE}/api/print/jobs/${jobId}/image?w=${COUNTER_WIDTH}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (res.status === 401 && thuLai) {
    accessToken = null;
    return taiAnhPhieu(jobId, false);
  }
  if (!res.ok) throw new Error(`tải ảnh phiếu HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** In MỘT hóa đơn / phiếu khách ra máy quầy: ảnh PNG có dấu → lệnh in ảnh → USB hoặc LAN. */
async function inRaQuay(job) {
  const lenh = lenhInAnh(thanhAnhDen(giaiMaPng(await taiAnhPhieu(job.id))));
  if (MAY_QUAY.kieu === "usb") await inQuaWindows(lenh, MAY_QUAY.ten);
  else await thuLaiGui(() => sendToPrinter(lenh, MAY_QUAY.host, MAY_QUAY.port), SO_LAN_THU_LAI);
}

async function pollOnce() {
  // Quán có thể bị tạm ngưng rồi bật lại — thử tra lại thay vì chết hẳn.
  if (!tenantId) {
    tenantId = await resolveTenantId();
    // Quán đang tạm ngưng KHÔNG phải "vắng khách" — giữ nhịp nền vì có thể được bật lại bất cứ lúc nào.
    if (!tenantId) return "khong-xac-dinh";
  }

  await baoBu();
  const since = new Date(Date.now() - MAX_JOB_AGE_MIN * 60_000).toISOString();
  let jobs;
  try {
    jobs = await rest(
      `/print_jobs?select=id,type,payload&tenant_id=eq.${tenantId}` +
        (MAY_QUAY ? `&type=in.(kitchen_ticket,receipt,customer_ticket)` : `&type=eq.kitchen_ticket`) +
        `&status=eq.pending&created_at=gte.${since}&order=created_at.asc&limit=10`
    );
  } catch (err) {
    log("Lỗi đọc print_jobs:", err.message);
    // Lỗi mạng KHÔNG phải "rỗng": mất mạng 2 phút rồi có phiếu ngay khi nối lại thì không được
    // để nhịp đang nằm ở trần.
    return "khong-xac-dinh";
  }

  for (const job of jobs ?? []) {
    if (inFlight.has(job.id) || daInChuaBao.has(job.id)) continue;
    const dich = dichInCua(job.type ?? "kitchen_ticket", !!MAY_QUAY);
    if (!dich) continue;
    if (dich === "quay") {
      inFlight.add(job.id);
      try {
        await inRaQuay(job);
      } catch (err) {
        quayPhanHoi = false;
        await markJob(job.id, { status: "failed" }).catch(() => {});
        log(`IN LỖI ${job.type} ${job.id} ra máy quầy: ${err.message}`);
        inFlight.delete(job.id);
        continue;
      }
      quayPhanHoi = true;
      await baoDaIn(job, `${job.type === "receipt" ? "hóa đơn" : "phiếu khách"} ra máy quầy (${COUNTER_PRINTER})`);
      inFlight.delete(job.id);
      continue;
    }
    inFlight.add(job.id);
    try {
      await thuLaiGui(() => sendToPrinter(buildKitchenTicket(job.payload ?? {})), SO_LAN_THU_LAI);
    } catch (err) {
      mayInPhanHoi = false;
      await markJob(job.id, { status: "failed" }).catch(() => {});
      log(`IN LỖI phiếu ${job.id} (đã thử ${SO_LAN_THU_LAI + 1} lần): ${err.message} — bấm in lại ở POS sau khi sửa máy in.`);
      inFlight.delete(job.id);
      continue;
    }
    mayInPhanHoi = true;
    await baoDaIn(job, `phiếu ${job.payload?.ticketNo ?? job.id} (đơn #${job.payload?.kitchenNo ?? "?"})`);
    inFlight.delete(job.id);
  }

  return (jobs ?? []).length > 0 ? "co-phieu" : "rong";
}

log(
  `Cầu in bếp: ${HOST}:${PORT}, khổ ${CHARS} ký tự, poll mỗi ${POLL_MS}ms, ` +
    `bỏ qua phiếu cũ hơn ${MAX_JOB_AGE_MIN} phút. Ctrl+C để dừng.`
);
let emptyStreak = 0;
for (;;) {
  // Điểm an toàn duy nhất để thoát: lượt poll trước đã xong, không phiếu nào đang gửi dở.
  await thoatNeuCanThoat();
  const ketQua = await pollOnce();
  if (ketQua === "rong") emptyStreak += 1;
  else if (ketQua === "co-phieu") emptyStreak = 0;
  // "khong-xac-dinh" (lỗi mạng / quán tạm ngưng): giữ nguyên streak, không phạt cũng không thưởng.

  await new Promise((r) => {
    const hen = setTimeout(r, nextPollMs(emptyStreak, POLL_MS));
    danhThuc = () => {
      clearTimeout(hen);
      r();
    };
  });
  danhThuc = null;
}

} // hết khối `if (laEntry)` — xem ghi chú ở guard phía trên.
