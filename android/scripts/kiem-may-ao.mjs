// android/scripts/kiem-may-ao.mjs — kiểm nghiệm thu 24-01 trên máy ảo / máy thật Android đang cắm (adb), app bản DEBUG
// đã cài và đã kích hoạt "chỉ xem" vào quán demo pho-viet (KHÔNG dùng qt-food).
//
//   node android/scripts/kiem-may-ao.mjs [thư-mục-ảnh]
//
// Điều khiển trang trong WebView của app qua giao thức DevTools (bản debug bật cổng gỡ lỗi; bản phát hành không có).
// Không cần Playwright: Playwright `connectOverCDP` không chạy với WebView của Android (thiếu quản lý context).
// Chỉ dùng thư viện sẵn của Node 22+ (fetch, WebSocket).
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const ADB = process.env.ADB || `${process.env.LOCALAPPDATA}/Android/Sdk/platform-tools/adb.exe`;
const GOI = "vn.techmenu.thungan";
const THU_MUC_ANH = process.argv[2] || null;
const TAI_KHOAN = { email: "ownerA@pho-viet.test", matKhau: process.env.DEMO_PASS || "DemoPass123!" };

const adb = (...a) => execFileSync(ADB, a).toString().trim();
const ngu = (ms) => new Promise((r) => setTimeout(r, ms));
const chup = (ten) => {
  if (THU_MUC_ANH) fs.writeFileSync(`${THU_MUC_ANH}/${ten}.png`, execFileSync(ADB, ["exec-out", "screencap", "-p"]));
};

/** Chạy biểu thức JS trong trang đang mở của WebView app; tự nối lại khi app vừa khởi động lại. */
async function js(bieuThuc) {
  for (let lan = 0; lan < 30; lan++) {
    try {
      const pid = adb("shell", "pidof", GOI);
      adb("forward", "tcp:9333", `localabstract:webview_devtools_remote_${pid}`);
      const trang = (await (await fetch("http://127.0.0.1:9333/json/list")).json()).find((t) => t.type === "page");
      const ws = new WebSocket(trang.webSocketDebuggerUrl);
      await new Promise((ok, loi) => ((ws.onopen = ok), (ws.onerror = loi)));
      const kq = await new Promise((ok) => {
        ws.onmessage = (e) => {
          const m = JSON.parse(e.data);
          if (m.id === 1) ok(m.result);
        };
        ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression: bieuThuc, awaitPromise: true, returnByValue: true } }));
      });
      ws.close();
      return kq?.result?.value;
    } catch {
      await ngu(1000);
    }
  }
  throw new Error("Không nối được WebView của app — app bản debug đã cài và đang chạy chưa?");
}
const doi = async (dk, giay = 30) => {
  for (let i = 0; i < giay; i++) {
    if (await js(dk)) return true;
    await ngu(1000);
  }
  return false;
};
const LA_POS = `/Tìm bàn|Chọn một bàn/.test(document.body.innerText) && !/Mất mạng/.test(document.body.innerText)`;
const kq = {};
const dat = (ten, dung, chiTiet = "") => ((kq[ten] = { dung, chiTiet }), console.log(`${dung ? "ĐẠT " : "HỎNG"}  ${ten}${chiTiet ? " — " + chiTiet : ""}`));

// 1. Đăng nhập nhân viên (ô React: đặt giá trị bằng setter gốc + bắn sự kiện input).
adb("shell", "svc", "wifi", "enable");
adb("shell", "svc", "data", "enable");
if (await js(`!!document.querySelector('input[type=password]')`)) {
  await js(`(() => {
    const dat = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
    dat(document.querySelector('input[type=email], input[name=email]'), ${JSON.stringify(TAI_KHOAN.email)});
    dat(document.querySelector('input[type=password]'), ${JSON.stringify(TAI_KHOAN.matKhau)});
    [...document.querySelectorAll('button')].find(b => b.textContent.includes('Đăng nhập')).click();
  })()`);
}
dat("Vào POS sau đăng nhập", await doi(LA_POS), await js("location.pathname"));
chup("and-pos");

// 2. An toàn: trang POS (web) không có lệnh có quyền của app; chỉ có dữ liệu techmenuDesktop.
dat("POS không có window.techmenu", (await js("typeof window.techmenu")) === "undefined");
dat("POS không có kênh TechMenuAndroid", (await js("typeof window.TechMenuAndroid")) === "undefined");
const td = await js("JSON.stringify(window.techmenuDesktop ?? null)");
dat("POS nhận techmenuDesktop (nenTang android)", /"nenTang":"android"/.test(td ?? ""), td);

// 3. Tắt hẳn app, mở lại ⇒ vào thẳng POS (nhớ đăng nhập nhân viên).
adb("shell", "am", "force-stop", GOI);
adb("shell", "am", "start", "-n", `${GOI}/.MainActivity`);
await ngu(4000);
dat("Mở lại vào thẳng POS", await doi(LA_POS, 30), await js("location.pathname"));
chup("and-mo-lai");

// 4. Mất mạng giữa chừng ⇒ màn xem offline của P17 (service worker); có mạng lại ⇒ POS sống lại.
adb("shell", "svc", "wifi", "disable");
adb("shell", "svc", "data", "disable");
await ngu(3000);
await js("location.reload(), true").catch(() => {});
dat("Mất mạng: hiện màn xem offline P17", await doi(`/Mất mạng/.test(document.body.innerText)`, 20));
chup("and-mat-mang-p17");

// 5. Địa chỉ service worker không phục vụ ⇒ màn "Chưa kết nối được" của app (trang app Windows), tự thử lại.
await js(`location.href = location.origin + '/r/pho-viet/kds?thu=' + Date.now(), true`).catch(() => {});
dat("Mất mạng: màn 'Chưa kết nối được' của app", await doi(`location.href.includes('mat-mang.html')`, 20), await js("document.body.innerText.slice(0, 60)"));
dat("Trang của app có window.techmenu", (await js("typeof window.techmenu")) === "object");
chup("and-mat-mang-app");
adb("shell", "svc", "wifi", "enable");
adb("shell", "svc", "data", "enable");
const t0 = Date.now();
const ve = await doi(`location.href.includes('/r/pho-viet/') && !location.href.includes('mat-mang')`, 40);
dat("Có mạng lại tự vào lại ≤ 15 giây", ve && Date.now() - t0 <= 15_000, `${Math.round((Date.now() - t0) / 1000)} giây`);

const hong = Object.entries(kq).filter(([, v]) => !v.dung);
console.log(hong.length ? `\n${hong.length} mục HỎNG` : "\nTất cả ĐẠT");
process.exit(hong.length ? 1 : 0);
