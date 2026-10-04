// android/scripts/thu-quan-ly.mjs — kiểm nghiệm thu 30-03 (MGR-07) trên máy ảo / máy thật Android đang cắm (adb):
// APK "TechMenu Quản lý" cài CẠNH app Thu ngân, mở `/quan-ly` toàn màn hình, đăng nhập chủ quán demo → Tổng quan,
// nhớ đăng nhập khi tắt hẳn app, liên kết "Quản trị đầy đủ" mở ngay trong app, Xuất Excel → Tải xuống.
//
//   node android/scripts/thu-quan-ly.mjs [thư-mục-ảnh]
//
// Máy chủ: mặc định production. Web chưa deploy thì build bản debug trỏ dev server trên máy này:
//   TECHMENU_API_BASE=http://localhost:3000 gradlew assembleQuanLyDebug  +  adb reverse tcp:3000 tcp:3000
// (bản debug cho phép http://localhost — src/debug/res/xml/network_security_config.xml). Chỉ quán demo pho-viet.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { adb, bam, chonGoi, chup as chupMay, datO, doi, js, ketQua, ngu } from "./thiet-bi.mjs";

const ANDROID = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const GOI_QL = "vn.techmenu.quanly";
const THU_MUC_ANH = process.argv[2] || null;
const chup = (ten) => chupMay(THU_MUC_ANH, ten);
const CHU = { email: "ownerA@pho-viet.test", matKhau: process.env.DEMO_PASS || "DemoPass123!" };
const kq = ketQua();
chonGoi(GOI_QL);

adb("install", "-r", path.join(ANDROID, "app/build/outputs/apk/quanLy/debug/app-quanLy-debug.apk"));
const goi = adb("shell", "pm", "list", "packages", "vn.techmenu");
kq.dat("Cài cạnh app Thu ngân (2 mã gói)", goi.includes(GOI_QL) && goi.includes("vn.techmenu.thungan"), goi.replace(/\s+/g, " "));

adb("shell", "pm", "clear", GOI_QL); // bắt đầu như máy mới cài
adb("shell", "am", "start", "-n", `${GOI_QL}/vn.techmenu.thungan.QuanLyActivity`);
await ngu(4000);

// 1. Màn đăng nhập của app Quản lý (web /quan-ly).
kq.dat("Mở vào /quan-ly", await doi(`location.pathname === '/quan-ly' && !!document.querySelector('input[name=password]')`, 40), await js("location.href"));
kq.dat("User agent có TechMenuQuanLy/", /TechMenuQuanLy\//.test(await js("navigator.userAgent")));
chup("p30-ql-apk-dang-nhap");

// 2. Đăng nhập chủ quán → Tổng quan.
await js(datO("input[name=email]", CHU.email));
await js(datO("input[name=password]", CHU.matKhau));
await js(`[...document.querySelectorAll('button')].find(b => /Đăng nhập/.test(b.textContent)).click(), true`);
kq.dat("Đăng nhập → Tổng quan", await doi(`location.pathname === '/r/pho-viet/quan-ly' && /Doanh thu/.test(document.body.innerText)`, 40), await js("location.pathname"));
chup("p30-ql-apk-tong-quan");

// 3. Tắt hẳn app, mở lại → vào thẳng Tổng quan (nhớ đăng nhập).
adb("shell", "am", "force-stop", GOI_QL);
adb("shell", "am", "start", "-n", `${GOI_QL}/vn.techmenu.thungan.QuanLyActivity`);
await ngu(4000);
kq.dat("Mở lại: nhớ đăng nhập", await doi(`location.pathname === '/r/pho-viet/quan-ly'`, 40), await js("location.pathname"));

// 4. Tab Thêm: dòng phiên bản của APK; "Kho hàng" mở trang admin NGAY trong app.
await bam("Thêm"); // bấm tin cậy — xem `bam` (thiet-bi.mjs) về phím Back
kq.dat("Tab Thêm hiện 'Phiên bản …' của APK", await doi(`/Phiên bản \\d/.test(document.body.innerText)`, 30));
chup("p30-ql-apk-them");
await bam("Kho hàng");
kq.dat("Quản trị đầy đủ mở trong app", await doi(`location.pathname.startsWith('/r/pho-viet/admin/inventory')`, 40), await js("location.pathname"));
adb("shell", "input", "keyevent", "KEYCODE_BACK");
kq.dat("Back → về tab Thêm", await doi(`location.pathname === '/r/pho-viet/quan-ly/them'`, 60), await js("location.pathname"));

// 5. Xuất Excel từ báo cáo đầy đủ → Tải xuống.
adb("shell", "rm", "-f", "/sdcard/Download/*.xlsx");
await js(`location.href = '/r/pho-viet/admin/reports', true`);
await doi(`!!document.querySelector('a[href*="/reports/export"]')`, 40);
await js(`document.querySelector('a[href*="/reports/export"]').click(), true`);
let tep = "";
for (let i = 0; i < 30 && !tep.includes(".xlsx"); i++) {
  await ngu(1000);
  tep = adb("shell", "ls", "/sdcard/Download/");
}
kq.dat("Xuất Excel lưu vào Tải xuống", tep.includes(".xlsx"), tep.replace(/\s+/g, " "));

// 6. Đăng xuất → về màn đăng nhập.
await js(`location.href = '/r/pho-viet/quan-ly/them', true`);
await doi(`!![...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Đăng xuất')`, 30);
await js(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Đăng xuất').click(), true`);
kq.dat("Đăng xuất → màn đăng nhập", await doi(`location.pathname === '/quan-ly' && !!document.querySelector('input[name=password]')`, 30));

process.exit(kq.xong());
