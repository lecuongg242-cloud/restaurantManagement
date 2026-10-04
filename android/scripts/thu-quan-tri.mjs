// android/scripts/thu-quan-tri.mjs — kiểm nghiệm thu 30-01 (ANDR-09) trên máy ảo / máy thật Android đang cắm (adb):
// ☰ → "Quản trị" mở trang quản trị trong HỒ SƠ WebView RIÊNG — thu ngân đang bán ở POS không bị đăng xuất.
// App bản DEBUG mới cài (chưa kích hoạt hoặc đã kích hoạt). Chỉ dùng quán demo pho-viet (KHÔNG dùng qt-food).
//
//   node android/scripts/thu-quan-tri.mjs [thư-mục-ảnh]
import { adb, cdp, chup as chupMay, datO, doi, GOI, js, ketQua, ngu, timNut } from "./thiet-bi.mjs";

const THU_MUC_ANH = process.argv[2] || null;
const chup = (ten) => chupMay(THU_MUC_ANH, ten);
const CHU = { email: "ownerA@pho-viet.test", matKhau: process.env.DEMO_PASS || "DemoPass123!" };
// Thu ngân thử riêng cho kịch bản này (quán demo pho-viet) — không dùng PIN của nhân viên demo khác.
const THU_NGAN = { email: process.env.DEMO_THU_NGAN || "thu-ngan-p30@pho-viet.staff.local", pin: process.env.DEMO_PIN || "2468" };
const kq = ketQua();

const laPos = (u) => /\/r\/pho-viet\/(pos|kds)/.test(u);
const laQuanTri = (u) => /\/r\/pho-viet\/(admin|print)/.test(u);
const laTrangApp = (u) => u.includes("appassets.androidplatform.net");
/**
 * Email của phiên Supabase trong WebView đang xem. Cookie `sb-…-auth-token` là HttpOnly (trang không đọc được) ⇒ lấy qua
 * DevTools `Network.getCookies` của đúng WebView đó (mỗi hồ sơ một kho cookie riêng); có thể chia mảnh .0 .1.
 */
async function emailPhien(loc) {
  const { cookies = [] } = (await cdp("Network.getCookies", {}, loc)) ?? {};
  const manh = cookies.filter((c) => /^sb-.*-auth-token(\.\d+)?$/.test(c.name)).sort((x, y) => x.name.localeCompare(y.name));
  if (!manh.length) return null;
  let v = manh.map((c) => decodeURIComponent(c.value)).join("");
  if (v.startsWith("base64-")) v = Buffer.from(v.slice(7), "base64url").toString("utf8");
  try {
    return JSON.parse(v).user?.email ?? null;
  } catch {
    return null;
  }
}
const LA_POS = `/Tìm bàn|Chọn một bàn/.test(document.body.innerText)`;

/** Nút gốc theo content-desc (nút ☰ nổi không có chữ). */
function timTheoMoTa(re) {
  adb("shell", "uiautomator", "dump", "/sdcard/ui.xml");
  const xml = adb("shell", "cat", "/sdcard/ui.xml");
  for (const m of xml.matchAll(/<node [^>]*?content-desc="([^"]*)"[^>]*?bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g)) {
    if (re.test(m[1])) return [(+m[2] + +m[4]) >> 1, (+m[3] + +m[5]) >> 1];
  }
  return null;
}
const cham = (xy) => xy && adb("shell", "input", "tap", String(xy[0]), String(xy[1]));
async function bamMenu(nhan) {
  cham(timTheoMoTa(/Menu TechMenu/));
  await ngu(1500);
  const xy = timNut(nhan);
  cham(xy);
  await ngu(1500);
  return Boolean(xy);
}
async function dangNhapWeb(email, matKhau, loc) {
  await doi(`!!document.querySelector('input[type=password]')`, 30, loc);
  await js(datO("input[type=email], input[name=email]", email), loc);
  await js(datO("input[type=password]", matKhau), loc);
  await js(`[...document.querySelectorAll('button')].find(b => /Đăng nhập/.test(b.textContent)).click(), true`, loc);
}
async function kichHoatChiXem() {
  await doi(`!!document.getElementById('mat-khau')`, 30, laTrangApp);
  await js(datO("#email", CHU.email), laTrangApp);
  await js(datO("#mat-khau", CHU.matKhau), laTrangApp);
  await js(`document.querySelector('input[name=co-may-in][value=khong]').click(), document.getElementById('nut').click(), true`, laTrangApp);
}

adb("shell", "svc", "wifi", "enable");
adb("shell", "am", "force-stop", GOI);
adb("shell", "am", "start", "-n", `${GOI}/.MainActivity`);
await ngu(4000);

// 0. Kích hoạt "chỉ xem" nếu app chưa kích hoạt; đổi sang Thu ngân.
if (await js(`location.href.includes('kich-hoat')`).catch(() => false)) await kichHoatChiXem();
await doi(`location.href.includes('/r/pho-viet/')`, 40, (u) => !laTrangApp(u));
await bamMenu(/^(✓ )?Thu ngân$/);
await doi(`location.pathname.includes('/pos')`, 30, laPos);

// 1. Thu ngân Lan đăng nhập POS (email + PIN).
if (await js(`!!document.querySelector('input[type=password]')`, laPos)) await dangNhapWeb(THU_NGAN.email, THU_NGAN.pin, laPos);
kq.dat("Thu ngân vào POS", await doi(LA_POS, 40, laPos));
kq.dat("Phiên POS là thu ngân", (await emailPhien(laPos)) === THU_NGAN.email, await emailPhien(laPos));

// 2. ☰ → Quản trị → màn đăng nhập quản trị (hồ sơ riêng, chưa đăng nhập).
kq.dat("Menu ☰ có mục Quản trị", await bamMenu(/^Quản trị$/));
const coManQuanTri = await doi(`location.pathname.includes('/admin')`, 30, laQuanTri);
kq.dat("Mở màn Quản trị trong app (hồ sơ riêng)", coManQuanTri, "nếu HỎNG: WebView của máy có thể chưa hỗ trợ MULTI_PROFILE");
kq.dat("Thanh trên có '← Về Thu ngân'", Boolean(timNut(/Về Thu ngân/)));
kq.dat("Vào qua cờ chi-quan-tri", String(await js("location.search", laQuanTri)).includes("chi-quan-tri=1"), await js("location.href", laQuanTri));
chup("p30-and-quan-tri-dang-nhap");

// 3. Chủ quán đăng nhập quản trị → Tổng quan.
await dangNhapWeb(CHU.email, CHU.matKhau, laQuanTri);
kq.dat("Chủ quán vào admin", await doi(`/\\/r\\/pho-viet\\/admin\\/?$/.test(location.pathname)`, 40, laQuanTri), await js("location.pathname", laQuanTri));
kq.dat("Phiên quản trị là chủ quán", (await emailPhien(laQuanTri)) === CHU.email.toLowerCase(), await emailPhien(laQuanTri));
kq.dat("Trang admin không có window.techmenu", (await js("typeof window.techmenu", laQuanTri)) === "undefined");
chup("p30-and-quan-tri-tong-quan");

// 4. Xuất Excel từ Báo cáo → thư mục Tải xuống.
adb("shell", "rm", "-f", "/sdcard/Download/*.xlsx");
await js(`location.href = '/r/pho-viet/admin/reports', true`, laQuanTri);
await doi(`!!document.querySelector('a[href*="/reports/export"]')`, 40, laQuanTri);
await js(`document.querySelector('a[href*="/reports/export"]').click(), true`, laQuanTri);
let tep = "";
for (let i = 0; i < 30 && !tep.includes(".xlsx"); i++) {
  await ngu(1000);
  tep = adb("shell", "ls", "/sdcard/Download/");
}
kq.dat("Xuất Excel lưu vào Tải xuống", tep.includes(".xlsx"), tep.replace(/\s+/g, " "));

// 5. "← Về Thu ngân" → POS VẪN là thu ngân Lan.
cham(timNut(/Về Thu ngân/));
await ngu(1500);
await js("location.reload(), true", laPos);
await ngu(3000);
kq.dat("Sau khi chủ đăng nhập quản trị, POS vẫn là thu ngân", (await emailPhien(laPos)) === THU_NGAN.email, await emailPhien(laPos));
kq.dat("POS vẫn bán được", await doi(LA_POS, 30, laPos));
chup("p30-and-pos-van-thu-ngan");

// 6. Mở lại Quản trị → nhớ đăng nhập, vào thẳng admin.
await bamMenu(/^Quản trị$/);
kq.dat("Mở lại Quản trị: nhớ đăng nhập", await doi(`/\\/r\\/pho-viet\\/admin\\/?$/.test(location.pathname)`, 30, laQuanTri));
adb("shell", "input", "keyevent", "KEYCODE_BACK");
await ngu(1000);
adb("shell", "input", "keyevent", "KEYCODE_BACK");
await ngu(1500);

// 7. Đăng xuất máy → kích hoạt lại → Quản trị phải hỏi đăng nhập (hồ sơ quản trị đã bị xóa).
await bamMenu(/^Đăng xuất máy$/);
cham(timNut(/^ĐĂNG XUẤT$|^Đăng xuất$/));
await ngu(3000);
kq.dat("Đăng xuất máy → màn kích hoạt", await doi(`location.href.includes('kich-hoat')`, 20, laTrangApp));
await kichHoatChiXem();
await doi(`location.href.includes('/r/pho-viet/')`, 40, (u) => !laTrangApp(u));
await bamMenu(/^Quản trị$/);
kq.dat("Sau đăng xuất máy, Quản trị hỏi đăng nhập lại", await doi(`!!document.querySelector('input[type=password]')`, 30, laQuanTri));
cham(timNut(/Về Thu ngân/));

process.exit(kq.xong());
