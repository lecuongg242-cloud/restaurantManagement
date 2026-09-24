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
function sendToPrinter(buffer) {
  return new Promise((resolve, reject) => {
    let done = false;
    const socket = net.connect({ host: HOST, port: PORT });
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
      if (!done) reject(new Error(`Hết thời gian chờ máy in ${HOST}:${PORT}`));
    });
    socket.on("error", (err) => {
      if (!done) reject(err);
    });
  });
}

function log(...args) {
  console.log(new Date().toLocaleTimeString("vi-VN"), ...args);
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
  log(`In phiếu thử tới ${HOST}:${PORT} (khổ ${CHARS} ký tự)…`);
  try {
    await sendToPrinter(buildKitchenTicket(demo));
    log("Đã gửi xong. Kiểm tra giấy ra ở máy in bếp.");
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
      `Tài khoản cầu in cấp ở /super → hàng nhà hàng → "Tài khoản cầu in".`
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
async function baoSong() {
  try {
    await rest(`/rpc/printer_heartbeat`, { method: "POST", body: "{}" });
    if (nhipTimDangLoi) log("Nhịp tim đã nối lại — POS quay về gửi phiếu bếp qua cầu in.");
    nhipTimDangLoi = false;
    return true;
  } catch (err) {
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
baoSong();
setInterval(baoSong, NHIP_TIM_MS);

let tenantId = await resolveTenantId();
const inFlight = new Set(); // chống lấy lại job đang in trong cùng tiến trình

/** Đánh dấu kết quả in. Lỗi mạng ở bước này chỉ ghi log — phiếu đã ra giấy rồi, không in lại. */
async function markJob(id, patch) {
  await rest(`/print_jobs?id=eq.${id}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(patch),
  });
}

async function pollOnce() {
  // Quán có thể bị tạm ngưng rồi bật lại — thử tra lại thay vì chết hẳn.
  if (!tenantId) {
    tenantId = await resolveTenantId();
    // Quán đang tạm ngưng KHÔNG phải "vắng khách" — giữ nhịp nền vì có thể được bật lại bất cứ lúc nào.
    if (!tenantId) return "khong-xac-dinh";
  }

  const since = new Date(Date.now() - MAX_JOB_AGE_MIN * 60_000).toISOString();
  let jobs;
  try {
    jobs = await rest(
      `/print_jobs?select=id,payload&tenant_id=eq.${tenantId}&type=eq.kitchen_ticket` +
        `&status=eq.pending&created_at=gte.${since}&order=created_at.asc&limit=10`
    );
  } catch (err) {
    log("Lỗi đọc print_jobs:", err.message);
    // Lỗi mạng KHÔNG phải "rỗng": mất mạng 2 phút rồi có phiếu ngay khi nối lại thì không được
    // để nhịp đang nằm ở trần.
    return "khong-xac-dinh";
  }

  for (const job of jobs ?? []) {
    if (inFlight.has(job.id)) continue;
    inFlight.add(job.id);
    try {
      await thuLaiGui(() => sendToPrinter(buildKitchenTicket(job.payload ?? {})), SO_LAN_THU_LAI);
      await markJob(job.id, { status: "printed", printed_at: new Date().toISOString() });
      log(`Đã in phiếu ${job.payload?.ticketNo ?? job.id} (đơn #${job.payload?.kitchenNo ?? "?"})`);
    } catch (err) {
      await markJob(job.id, { status: "failed" }).catch(() => {});
      log(`IN LỖI phiếu ${job.id} (đã thử ${SO_LAN_THU_LAI + 1} lần): ${err.message} — bấm in lại ở POS sau khi sửa máy in.`);
    } finally {
      inFlight.delete(job.id);
    }
  }

  return (jobs ?? []).length > 0 ? "co-phieu" : "rong";
}

log(
  `Cầu in bếp: ${HOST}:${PORT}, khổ ${CHARS} ký tự, poll mỗi ${POLL_MS}ms, ` +
    `bỏ qua phiếu cũ hơn ${MAX_JOB_AGE_MIN} phút. Ctrl+C để dừng.`
);
let emptyStreak = 0;
for (;;) {
  const ketQua = await pollOnce();
  if (ketQua === "rong") emptyStreak += 1;
  else if (ketQua === "co-phieu") emptyStreak = 0;
  // "khong-xac-dinh" (lỗi mạng / quán tạm ngưng): giữ nguyên streak, không phạt cũng không thưởng.

  await new Promise((r) => setTimeout(r, nextPollMs(emptyStreak, POLL_MS)));
}

} // hết khối `if (laEntry)` — xem ghi chú ở guard phía trên.
