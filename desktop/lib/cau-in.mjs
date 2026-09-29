// desktop/lib/cau-in.mjs — chạy + giám sát cầu in trong app (DESK-05). Không import electron: `node` là đường dẫn
// chương trình chạy cầu in (trong app là chính electron.exe với ELECTRON_RUN_AS_NODE=1, trong test là node).
//
// Một tiến trình con duy nhất. Chết → chạy lại (giãn dần). Tắt → xin cầu in thoát ở điểm an toàn qua IPC trước,
// chỉ giết ngang khi quá hạn: trên Windows kill là giết ngang, bỏ dở phiếu đang gửi có thể ra hai tờ lúc chạy lại.
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { doiTruocKhiChayLai } from "./moi-truong.mjs";

/** Mã thoát của cầu in khi máy đã có cầu in khác (print-bridge.mjs MA_THOAT_DA_CHAY). */
export const MA_THOAT_DA_CHAY = 3;
/** Chạy khỏe chừng này thì xóa bộ đếm "chết liên tiếp". */
const KHOE_SAU_MS = 5 * 60_000;
/** Chờ cầu in tự thoát tối đa — vòng poll rảnh dài nhất là 10 giây. */
const CHO_THOAT_MS = 20_000;
const GIU_LOG_NGAY = 7;

export class QuanLyCauIn {
  /**
   * @param {{
   *   node: string, tepCauIn: string, thuMucLog: string,
   *   taoMoiTruong: () => Record<string, string> | null,
   *   khiTrangThai?: (s: { chay: boolean, nhipOk?: boolean, bep?: boolean | null, quay?: boolean | null, loi?: string }) => void,
   *   khiCoCauInKhac?: () => void,
   * }} tuyChon
   */
  constructor(tuyChon) {
    this.t = tuyChon;
    this.con = null;
    this.dangDung = false;
    this.soLanChet = 0;
    this.henChayLai = null;
    this.batDauLuc = 0;
  }

  /** Chạy nếu máy có in (môi trường không null). Gọi lại khi đang chạy: không làm gì. */
  batDau() {
    if (this.con) return;
    this.dangDung = false;
    const env = this.t.taoMoiTruong();
    if (!env) {
      this.t.khiTrangThai?.({ chay: false });
      return;
    }
    this.don();
    const con = spawn(this.t.node, [this.t.tepCauIn], {
      cwd: path.dirname(this.t.tepCauIn),
      env,
      stdio: ["ignore", "pipe", "pipe", "ipc"],
      windowsHide: true,
    });
    this.con = con;
    this.batDauLuc = Date.now();
    const ghi = (d) => this.ghiLog(d);
    con.stdout?.on("data", ghi);
    con.stderr?.on("data", ghi);
    con.on("message", (m) => {
      if (m && m.loai === "trang-thai") this.t.khiTrangThai?.({ chay: true, nhipOk: m.nhipOk, bep: m.bep, quay: m.quay });
    });
    con.on("error", (err) => this.ghiLog(`Không chạy được cầu in: ${err.message}\n`));
    con.on("exit", (ma) => {
      this.con = null;
      this.ghiLog(`Cầu in thoát, mã ${ma}.\n`);
      if (this.dangDung) return;
      if (ma === MA_THOAT_DA_CHAY) {
        this.t.khiTrangThai?.({ chay: false, loi: "Máy này đang có cầu in khác chạy" });
        this.t.khiCoCauInKhac?.();
        return;
      }
      if (Date.now() - this.batDauLuc >= KHOE_SAU_MS) this.soLanChet = 0;
      const doi = doiTruocKhiChayLai(this.soLanChet++);
      this.t.khiTrangThai?.({ chay: false, loi: "Cầu in vừa dừng — đang chạy lại" });
      this.henChayLai = setTimeout(() => {
        this.henChayLai = null;
        this.batDau();
      }, doi);
    });
  }

  /** Xin cầu in thoát ở điểm an toàn; quá hạn mới giết. Xong khi tiến trình đã thoát. */
  async dungLai(choToiDaMs = CHO_THOAT_MS) {
    this.dangDung = true;
    if (this.henChayLai) clearTimeout(this.henChayLai);
    this.henChayLai = null;
    const con = this.con;
    if (!con) return;
    const daThoat = new Promise((r) => con.once("exit", r));
    try {
      if (con.connected) con.send("thoat");
      else con.kill();
    } catch {
      con.kill();
    }
    const quaHan = new Promise((r) => setTimeout(() => r("qua-han"), choToiDaMs));
    if ((await Promise.race([daThoat, quaHan])) === "qua-han") {
      this.ghiLog("Cầu in không tự thoát kịp — dừng hẳn.\n");
      con.kill();
      await daThoat;
    }
  }

  async khoiDongLai() {
    await this.dungLai();
    this.soLanChet = 0;
    this.batDau();
  }

  get dangChay() {
    return Boolean(this.con);
  }

  ghiLog(d) {
    try {
      fs.mkdirSync(this.t.thuMucLog, { recursive: true });
      const ngay = new Date().toISOString().slice(0, 10);
      fs.appendFileSync(path.join(this.t.thuMucLog, `cau-in-${ngay}.log`), String(d));
    } catch {
      /* đầy ổ / không ghi được log không được làm dừng in */
    }
  }

  /** Xóa log quá 7 ngày. */
  don() {
    try {
      const han = Date.now() - GIU_LOG_NGAY * 86_400_000;
      for (const f of fs.readdirSync(this.t.thuMucLog)) {
        const p = path.join(this.t.thuMucLog, f);
        if (/^cau-in-.*\.log$/.test(f) && fs.statSync(p).mtimeMs < han) fs.rmSync(p, { force: true });
      }
    } catch {
      /* chưa có thư mục log */
    }
  }
}

/**
 * Chạy cầu in một lần ở chế độ in thử (`--test`, `--test --vai=quay`) với môi trường cho trước. Trả kết quả + dòng
 * log cuối để màn Cài đặt máy in hiện lỗi cụ thể.
 */
export function inThu({ node, tepCauIn, env, vai }) {
  return new Promise((resolve) => {
    const thamSo = [tepCauIn, "--test", ...(vai === "quay" ? ["--vai=quay"] : [])];
    const con = spawn(node, thamSo, { cwd: path.dirname(tepCauIn), env, windowsHide: true });
    let log = "";
    con.stdout.on("data", (d) => (log += d));
    con.stderr.on("data", (d) => (log += d));
    const han = setTimeout(() => con.kill(), 20_000);
    con.on("exit", (ma) => {
      clearTimeout(han);
      const dong = log.trim().split(/\r?\n/).filter(Boolean);
      resolve({ ok: ma === 0, thongDiep: dong.at(-1)?.replace(/^\d{1,2}:\d{2}:\d{2}\s+/, "") ?? "" });
    });
    con.on("error", (err) => {
      clearTimeout(han);
      resolve({ ok: false, thongDiep: err.message });
    });
  });
}
