// desktop/scripts/tao-bieu-tuong.mjs — vẽ biểu tượng app (build/icon.png 512×512) bằng chính Chromium của Electron.
// Chạy: npx electron scripts/tao-bieu-tuong.mjs   (chỉ khi đổi biểu tượng; tệp PNG được commit)
import { app, BrowserWindow } from "electron";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DAY = path.dirname(fileURLToPath(import.meta.url));
const DICH = path.join(DAY, "..", "build", "icon.png");
const FONT = pathToFileURL(path.join(DAY, "..", "..", "assets", "fonts", "BeVietnamPro-Bold.ttf")).href;
const html = `<!doctype html><style>
@font-face{font-family:B;src:url("${FONT}")}
html,body{margin:0;width:512px;height:512px;background:transparent}
div{width:512px;height:512px;border-radius:112px;background:#fa520f;color:#fff;display:grid;place-items:center;
font:700 360px/1 B,"Segoe UI",sans-serif;padding-bottom:24px;box-sizing:border-box}</style><div>T</div>`;

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const tam = path.join(os.tmpdir(), "techmenu-bieu-tuong.html");
  fs.writeFileSync(tam, html);
  const w = new BrowserWindow({ width: 512, height: 512, show: false, transparent: true, frame: false, webPreferences: { offscreen: true } });
  await w.loadFile(tam);
  await w.webContents.executeJavaScript("document.fonts.ready.then(() => true)");
  await new Promise((r) => setTimeout(r, 300));
  const anh = await w.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 });
  fs.mkdirSync(path.dirname(DICH), { recursive: true });
  fs.writeFileSync(DICH, anh.resize({ width: 512, height: 512 }).toPNG());
  fs.rmSync(tam, { force: true });
  console.log("Đã ghi", DICH);
  app.quit();
});
