// android/scripts/thiet-bi.mjs — điều khiển máy Android đang cắm (adb) + trang trong WebView của app (DevTools) cho các
// kịch bản kiểm P24. Chỉ dùng thư viện sẵn của Node 22+. App phải là bản DEBUG (bản phát hành không mở cổng gỡ lỗi).
import { execFileSync } from "node:child_process";
import fs from "node:fs";

export const ADB = process.env.ADB || `${process.env.LOCALAPPDATA}/Android/Sdk/platform-tools/adb.exe`;
export const GOI = "vn.techmenu.thungan";

export const adb = (...a) => execFileSync(ADB, a).toString().trim();
export const ngu = (ms) => new Promise((r) => setTimeout(r, ms));

export function chup(thuMuc, ten) {
  if (thuMuc) fs.writeFileSync(`${thuMuc}/${ten}.png`, execFileSync(ADB, ["exec-out", "screencap", "-p"]));
}

/** Chạy biểu thức JS trong trang đang mở của WebView app; tự nối lại khi app vừa khởi động lại. */
export async function js(bieuThuc) {
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

export async function doi(dk, giay = 30) {
  for (let i = 0; i < giay; i++) {
    if (await js(dk)) return true;
    await ngu(1000);
  }
  return false;
}

/** Đặt giá trị ô nhập (kể cả ô React) bằng setter gốc + bắn sự kiện. */
export const datO = (chon, gt) =>
  `(() => { const el = document.querySelector(${JSON.stringify(chon)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(gt)}); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); })()`;

/** Nút gốc của Android có chữ khớp `re` → tâm nút (uiautomator, thử lại khi màn đang chuyển). */
export function timNut(re) {
  let xml = "";
  for (let i = 0; i < 3 && !xml.includes("<node"); i++) {
    try {
      adb("shell", "uiautomator", "dump", "/sdcard/ui.xml");
      xml = adb("shell", "cat", "/sdcard/ui.xml");
    } catch {}
  }
  for (const m of xml.matchAll(/<node [^>]*?text="([^"]*)"[^>]*?bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g)) {
    if (re.test(m[1])) return [(+m[2] + +m[4]) >> 1, (+m[3] + +m[5]) >> 1];
  }
  return null;
}

export function ketQua() {
  const ds = [];
  return {
    dat(ten, dung, chiTiet = "") {
      ds.push(dung);
      console.log(`${dung ? "ĐẠT " : "HỎNG"}  ${ten}${chiTiet ? " — " + chiTiet : ""}`);
    },
    xong() {
      const hong = ds.filter((x) => !x).length;
      console.log(hong ? `\n${hong} mục HỎNG` : "\nTất cả ĐẠT");
      return hong ? 1 : 0;
    },
  };
}
