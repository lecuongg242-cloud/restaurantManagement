// android/scripts/thu-in-lan.mjs — kiểm nghiệm thu 24-03 (tablet tự in LAN) trên máy ảo / máy thật đang cắm adb.
//
//   node android/scripts/thu-in-lan.mjs [thư-mục-ảnh]
//
// Máy in GIẢ trên máy dev (cổng 9101 = bếp, 9102 = quầy; máy ảo gọi máy dev qua 10.0.2.2) ghi lại mọi byte nhận được.
// Kích hoạt app "Có — máy quầy" vào quán DEMO pho-viet (KHÔNG qt-food) → cài máy in → In thử → trình duyệt máy tính bấm
// "Phiếu bếp" / "In tạm tính" ⇒ máy in giả nhận. Cuối cùng trả quán demo về như cũ (chế độ in, nhịp tim, bàn V2) và đăng
// xuất app. App phải là bản DEBUG đã build (android/app/build/outputs/apk/debug/app-debug.apk).
import fs from "node:fs";
import net from "node:net";
import zlib from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { adb, chup as chupMay, datO, doi, GOI, js, ketQua, ngu } from "./thiet-bi.mjs";
import { donBan } from "../../tests/e2e/don-ban.ts";
import { getPrintMode, setPrintMode } from "../../tests/e2e/tenant-mode.ts";

config({ path: ".env.local", quiet: true });
const ANDROID = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ANH = process.argv[2] || null;
const chup = (ten) => chupMay(ANH, ten);
const SLUG = "pho-viet";
const WEB = process.env.TECHMENU_WEB || "https://restaurant-management-zeta.vercel.app";
const CHU = { email: "ownerA@pho-viet.test", matKhau: process.env.DEMO_PASS || "DemoPass123!" };
const BAN = "V2";
const kq = ketQua();
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// ── Máy in giả ──
const may = { bep: [], quay: [] };
function mayInGia(cong, ten) {
  const s = net.createServer((sock) => {
    const phan = [];
    sock.on("data", (d) => phan.push(d));
    // Một kết nối = một lần gửi. Kết nối không byte nào là lần "thử máy in" (nhịp tim) — không tính là phiếu.
    sock.on("close", () => phan.length && may[ten].push({ luc: Date.now(), du: Buffer.concat(phan) }));
    sock.on("error", () => {});
  });
  s.listen(cong, "0.0.0.0");
  return s;
}
let bep = mayInGia(9101, "bep");
const quay = mayInGia(9102, "quay");
const choIn = async (ten, sau, giay) => {
  for (let i = 0; i < giay * 4; i++) {
    const x = may[ten].find((p) => p.luc > sau);
    if (x) return x;
    await ngu(250);
  }
  return null;
};

/** Dựng lại ẢNH từ các lệnh `GS v 0` máy in nhận được — thấy đúng thứ sẽ ra giấy (PNG xám, tự mã hóa bằng zlib). */
function rasterRaPng(du) {
  const hang = [];
  let rongByte = 0;
  for (let i = du.indexOf(Buffer.from([0x1d, 0x76, 0x30])); i >= 0; i = du.indexOf(Buffer.from([0x1d, 0x76, 0x30]), i + 1)) {
    rongByte = du[i + 4] | (du[i + 5] << 8);
    const cao = du[i + 6] | (du[i + 7] << 8);
    for (let y = 0; y < cao; y++) hang.push(du.subarray(i + 8 + y * rongByte, i + 8 + (y + 1) * rongByte));
    i += 8 + cao * rongByte - 1;
  }
  const rong = rongByte * 8;
  const tho = Buffer.alloc(hang.length * (rong + 1), 255);
  hang.forEach((r, y) => {
    tho[y * (rong + 1)] = 0;
    for (let x = 0; x < rong; x++) if (r[x >> 3] & (0x80 >> (x & 7))) tho[y * (rong + 1) + 1 + x] = 0;
  });
  const khuc = (loai, data) => {
    const d = Buffer.concat([Buffer.from(loai), data]);
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(d) >>> 0);
    return Buffer.concat([len, d, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(rong, 0); ihdr.writeUInt32BE(hang.length, 4); ihdr[8] = 8; ihdr[9] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), khuc("IHDR", ihdr), khuc("IDAT", zlib.deflateSync(tho)), khuc("IEND", Buffer.alloc(0))]);
}

const { data: quan } = await admin.from("tenants").select("id").eq("slug", SLUG).single();
const cheDoCu = await getPrintMode(SLUG);
let trinhDuyet;
try {
  await donBan(quan.id, [BAN]);
  // ── 1. Cài app sạch + kích hoạt "Có — máy quầy" ──
  // Kịch bản bắt đầu từ app SẠCH: gỡ bản cũ (có thể là bản mã cao hơn từ phép thử cập nhật — không cài lùi được).
  try {
    adb("uninstall", GOI);
  } catch {}
  adb("install", path.join(ANDROID, "app/build/outputs/apk/debug/app-debug.apk"));
  adb("shell", "pm", "grant", GOI, "android.permission.POST_NOTIFICATIONS");
  adb("shell", "dumpsys", "deviceidle", "whitelist", `+${GOI}`); // như người dùng đã bấm "Cho phép" ở màn bỏ tối ưu pin
  adb("shell", "am", "start", "-n", `${GOI}/.MainActivity`);
  await doi(`!!document.getElementById('email')`, 30);
  await js(datO("#email", CHU.email));
  await js(datO("#mat-khau", CHU.matKhau));
  await js(`document.querySelector('input[name=co-may-in][value=co]').click(), document.getElementById('nut').click(), true`);
  kq.dat("Kích hoạt 'Có — máy quầy' ⇒ mở Cài đặt máy in", await doi(`location.href.includes('cai-dat-may-in.html') && document.getElementById('quan').textContent.length > 0`, 40));
  kq.dat("Trang Cài đặt máy in trên Android: ẩn USB, có 'Giữ màn hình sáng'",
    (await js(`document.getElementById('chon-usb').classList.contains('an') && !document.getElementById('khoi-giu-sang').classList.contains('an')`)) === true);

  // ── 2. Cài máy in (giả) + In thử ──
  await js(`(() => { for (const [n, v] of [['bep','lan'],['quay','lan'],['kho','80']]) { const o = document.querySelector('input[name=' + n + '][value=' + v + ']'); o.checked = true; o.dispatchEvent(new Event('change', { bubbles: true })); } })()`);
  for (const [o, v] of [["#bep-ip", "10.0.2.2"], ["#bep-cong", "9101"], ["#quay-ip", "10.0.2.2"], ["#quay-cong", "9102"]]) await js(datO(o, v));
  chup("24-03-cai-dat-may-in");
  let t = Date.now();
  await js(`document.querySelector('[data-in-thu=bep]').click(), true`);
  const thuBep = await choIn("bep", t, 15);
  kq.dat("In thử bếp ⇒ máy in bếp nhận", !!thuBep && thuBep.du.includes(Buffer.from("PHIEU BEP")), thuBep ? `${thuBep.du.length} byte` : "không nhận");
  t = Date.now();
  await js(`document.querySelector('[data-in-thu=quay]').click(), true`);
  kq.dat("In thử quầy ⇒ máy in quầy nhận", !!(await choIn("quay", t, 15)));
  await ngu(500);
  chup("24-03-in-thu");
  await js(`document.getElementById('luu').click(), true`);
  kq.dat("Lưu ⇒ vào POS", await doi(`location.pathname.includes('/r/${SLUG}/pos')`, 30));
  // App vừa cài sạch ⇒ POS trên tablet chưa có nhân viên đăng nhập.
  if (await doi(`!!document.querySelector('input[type=password]')`, 15)) {
    await js(datO("input[type=email], input[name=email]", CHU.email));
    await js(datO("input[type=password]", CHU.matKhau));
    await js(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('Đăng nhập')).click(), true`);
    await doi(`/Tìm bàn|Chọn một bàn/.test(document.body.innerText)`, 30);
  }

  // ── 3. Nhịp tim: máy chủ thấy tablet là trạm in ──
  let nhip = null;
  for (let i = 0; i < 40 && !nhip; i++) {
    const { data } = await admin.from("printer_heartbeats").select("agent, seen_at, printer_ok, counter_ok").eq("tenant_id", quan.id).maybeSingle();
    if (data?.agent?.startsWith("android/") && Date.now() - Date.parse(data.seen_at) < 60_000) nhip = data;
    else await ngu(1500);
  }
  kq.dat("Nhịp tim 'android/…' + máy in phản hồi", !!nhip && nhip.printer_ok === true && nhip.counter_ok === true, JSON.stringify(nhip));

  // ── 4. Máy tính bấm "Phiếu bếp" ⇒ tablet in ra máy in bếp ──
  trinhDuyet = await chromium.launch();
  const p = await trinhDuyet.newPage({ viewport: { width: 1280, height: 800 } });
  await p.goto(`${WEB}/r/${SLUG}/admin/login`);
  await p.fill('input[name="email"]', CHU.email);
  await p.fill('input[name="password"]', CHU.matKhau);
  await Promise.all([p.waitForLoadState("networkidle"), p.click('button[type="submit"]')]);
  await p.goto(`${WEB}/r/${SLUG}/pos`, { waitUntil: "networkidle" });
  const soDo = p.locator("aside").filter({ has: p.getByRole("button", { name: /^Bán mang về/ }) }).first();
  await soDo.getByRole("button", { name: new RegExp(`^${BAN}\\b`) }).click();
  await p.getByRole("button", { name: /^Thêm / }).first().click();
  const themVaoGio = p.getByRole("button", { name: /Thêm vào giỏ/ });
  if (await themVaoGio.isVisible().catch(() => false)) await themVaoGio.click();
  await p.getByRole("button", { name: /^Xác nhận thêm \d+ món/ }).click();
  await p.getByText(/Đơn #\d+/).first().waitFor({ timeout: 20_000 });
  await ngu(3000); // POS đọc trạng thái cầu in (nhịp tim) để chọn đường in
  const inBep = async () => {
    const t0 = Date.now();
    await p.getByRole("button", { name: /Phiếu bếp/ }).first().click();
    return { t0, x: await choIn("bep", t0, 30) };
  };
  const lan1 = await inBep();
  kq.dat("Phiếu bếp từ máy tính ⇒ tablet in ≤ 5 giây", !!lan1.x && lan1.x.luc - lan1.t0 <= 5_000, lan1.x ? `${lan1.x.luc - lan1.t0} ms` : "không nhận");
  const { data: viec } = await admin.from("print_jobs").select("status, type").eq("tenant_id", quan.id).eq("type", "kitchen_ticket").order("created_at", { ascending: false }).limit(1).single();
  await ngu(2000);
  const { data: viec2 } = await admin.from("print_jobs").select("status").eq("tenant_id", quan.id).eq("type", "kitchen_ticket").order("created_at", { ascending: false }).limit(1).single();
  kq.dat("print_jobs ⇒ printed", viec2?.status === "printed", `${viec?.status} → ${viec2?.status}`);

  // ── 5. Hóa đơn ảnh ra máy in quầy — bấm NGAY TRÊN TABLET (máy quầy). Máy tính màn rộng được coi là "có máy in riêng"
  //       nên in hóa đơn bằng hộp in trình duyệt (PRINT-16); trong app có cầu in thì mọi phiếu đi qua cầu in.
  const bam = (re) => `(() => { const b = [...document.querySelectorAll('button')].find(x => ${re}.test(x.textContent.trim())); if (b) b.click(); return !!b; })()`;
  await js(`location.reload(), true`);
  // Ô bàn ghi tên bàn rồi tới tạm tính ("V2" + "50.000₫" — textContent dính liền) ⇒ so đúng ô tên (span đầu của nút).
  const nutBan = `[...document.querySelectorAll('button')].find(x => x.querySelector('span')?.textContent.trim() === '${BAN}')`;
  await doi(`!!${nutBan}`, 30);
  // Nút có sẵn trong HTML máy chủ dựng TRƯỚC khi React gắn sự kiện — bấm sớm là mất. Bấm lại tới khi panel bàn mở.
  await doi(`[...document.querySelectorAll('h2')].some(h => h.textContent.trim() === 'Bàn ${BAN}') || (${nutBan}?.click(), false)`, 30);
  await doi(bam(`/^(Tính tiền|Xem hóa đơn)/`), 20);
  await doi(`[...document.querySelectorAll('button')].some(x => /In tạm tính/.test(x.textContent))`, 30);
  const t5 = Date.now();
  await js(bam(`/In tạm tính/`));
  const hd = await choIn("quay", t5, 40);
  const anh = hd ? hd.du.indexOf(Buffer.from([0x1d, 0x76, 0x30])) : -1;
  chup("24-03-hoa-don-tablet");
  if (hd && ANH) fs.writeFileSync(`${ANH}/24-03-hoa-don-in-ra.png`, rasterRaPng(hd.du));
  kq.dat("Tablet 'In tạm tính' ⇒ máy in quầy nhận lệnh in ảnh (576 chấm = 72 byte/dòng)", anh >= 0 && hd.du[anh + 4] === 72 && hd.du[anh + 5] === 0, hd ? `${hd.du.length} byte, ${Math.round((hd.luc - t5) / 100) / 10} s` : "không nhận");
  await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })), true`);

  // ── 6. Máy in bếp hỏng ⇒ phiếu failed + thông báo đỏ; sửa xong ⇒ in lại được ──
  await new Promise((r) => bep.close(r));
  await p.goto(`${WEB}/r/${SLUG}/pos`, { waitUntil: "networkidle" });
  await soDo.getByRole("button", { name: new RegExp(`^${BAN}\\b`) }).click();
  await p.getByRole("button", { name: /Phiếu bếp/ }).first().click();
  let trangThai = null;
  for (let i = 0; i < 40 && trangThai !== "failed"; i++) {
    await ngu(1000);
    trangThai = (await admin.from("print_jobs").select("status").eq("tenant_id", quan.id).eq("type", "kitchen_ticket").order("created_at", { ascending: false }).limit(1).single()).data?.status;
  }
  kq.dat("Máy in bếp tắt ⇒ phiếu failed (sau 3 lần thử)", trangThai === "failed");
  const tb = adb("shell", "dumpsys", "notification", "--noredact");
  kq.dat("Thông báo thường trực báo 'Máy in bếp không phản hồi'", /Máy in bếp không phản hồi/.test(tb));
  adb("shell", "cmd", "statusbar", "expand-notifications");
  await ngu(1500);
  chup("24-03-thong-bao-loi");
  adb("shell", "cmd", "statusbar", "collapse");
  bep = mayInGia(9101, "bep");

  // ── 7. Chạy nền: về màn chính + tắt màn hình ⇒ vẫn in ──
  adb("shell", "input", "keyevent", "3");
  adb("shell", "input", "keyevent", "223"); // tắt màn
  await ngu(90_000);
  const lan2 = await inBep();
  kq.dat("Tắt màn 90 giây ⇒ phiếu vẫn ra", !!lan2.x, lan2.x ? `${lan2.x.luc - lan2.t0} ms` : "không nhận");
  adb("shell", "input", "keyevent", "224"); // bật màn
} finally {
  // ── Trả quán demo + máy về như cũ ──
  await trinhDuyet?.close().catch(() => {});
  // GIU_MAY=1: giữ app đã kích hoạt để soi tiếp (vẫn trả chế độ in + nhịp tim của quán demo như cũ).
  if (process.env.GIU_MAY !== "1") {
    try {
      adb("shell", "pm", "clear", GOI); // đăng xuất máy, dừng cầu in trong app
    } catch {}
  }
  await donBan(quan.id, [BAN]).catch(() => {});
  await setPrintMode(SLUG, cheDoCu).catch(() => {});
  await admin.from("printer_heartbeats").delete().eq("tenant_id", quan.id);
  bep.close();
  quay.close();
}
process.exit(kq.xong());
