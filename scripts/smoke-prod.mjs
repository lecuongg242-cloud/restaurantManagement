#!/usr/bin/env node
/**
 * Khói hậu-deploy (OPS-08) — kiểm trên PRODUCTION THẬT những điều mà không môi trường local nào trả
 * lời được. Chạy sau mỗi lần deploy, và bắt buộc sau mỗi lần đổi hạ tầng.
 *
 *   npm run smoke:prod
 *   npm run smoke:prod -- --url https://ten-mien --slug pho-viet --vung sin1
 *
 * VÌ SAO: ngày 24/09/2026 hai lỗi lọt tới người dùng mà mọi test đều xanh — hóa đơn in sai giờ 7
 * tiếng (máy dev UTC+7, Vercel UTC) và toàn bộ ảnh món vỡ sau khi đổi database (URL trong dữ liệu
 * trỏ project đã xóa; local và production dùng chung một database nên chưa từng có hai host để lộ
 * ra). Lỗi ảnh thuộc đúng loại này: một lần gọi vào production là thấy ngay.
 *
 * Mặc định kiểm tenant DEMO (pho-viet) — chỉ ĐỌC trang công khai, không ghi gì.
 * Thoát mã 1 nếu có điều kiện HỎNG, và in ra ĐIỀU KIỆN NÀO kèm giá trị thật — "smoke failed" không
 * nói cho ai biết phải sửa gì.
 */
import { pathToFileURL } from "node:url";

/** Giải các ký tự mã hóa hay gặp trong URL của next/image và HTML. */
function giaiMa(html) {
  return String(html ?? "")
    .replace(/%3A/gi, ":")
    .replace(/%2F/gi, "/")
    .replace(/&amp;/g, "&");
}

/**
 * Host Supabase xuất hiện trong HTML mà KHÁC host đang cấu hình — dữ liệu còn trỏ hạ tầng cũ.
 * Mỗi host nêu một lần, theo thứ tự gặp.
 */
export function hostLa(html, hostDung) {
  const thay = new Set();
  for (const m of giaiMa(html).matchAll(/([a-z0-9-]+)\.supabase\.co/gi)) {
    const host = `${m[1].toLowerCase()}.supabase.co`;
    if (host !== hostDung) thay.add(host);
  }
  return [...thay];
}

/**
 * Vùng TÍNH TOÁN từ header `X-Vercel-Id` (`<biên>::<tính toán>::<id>`). Chỉ có vùng biên nghĩa là
 * trả từ cache, hàm không chạy — không kết luận được, trả null thay vì đoán.
 */
export function vungTinhToan(xVercelId) {
  if (!xVercelId) return null;
  const phan = String(xVercelId).split("::");
  return phan.length >= 3 ? phan[phan.length - 2] : null;
}

/** Mọi URL ảnh Storage khách sẽ tải, kể cả nằm trong next/image. Không trùng lặp. */
export function anhTrongHtml(html) {
  const re = /https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/public\/[^"'\s&,)\\<>]+/gi;
  return [...new Set(giaiMa(html).match(re) ?? [])];
}

// ── Chạy thật ──────────────────────────────────────────────────────────────────
const laEntry = import.meta.url === pathToFileURL(process.argv[1] ?? "").href;

if (laEntry) {
  const { config } = await import("dotenv");
  config({ path: ".env.local", quiet: true });

  const thamSo = (ten, macDinh) => {
    const i = process.argv.indexOf(`--${ten}`);
    return i > -1 ? process.argv[i + 1] : macDinh;
  };
  const GOC = thamSo("url", process.env.SMOKE_URL ?? "https://restaurant-management-zeta.vercel.app").replace(/\/+$/, "");
  const SLUG = thamSo("slug", process.env.SMOKE_SLUG ?? "pho-viet");
  const VUNG = thamSo("vung", process.env.SMOKE_VUNG ?? "sin1");
  const HOST = thamSo("supabase", new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://x.supabase.co").host);

  /** @type {{ten: string, kq: "ĐẠT" | "HỎNG" | "KHÔNG KIỂM ĐƯỢC", chiTiet: string}[]} */
  const kq = [];
  const ghi = (ten, dat, chiTiet) => kq.push({ ten, kq: dat, chiTiet });

  console.log(`Khói hậu-deploy: ${GOC}  ·  tenant ${SLUG}  ·  vùng ${VUNG}  ·  Supabase ${HOST}\n`);

  // Query ngẫu nhiên phá cache CDN. KHÔNG phá được unstable_cache của Next — ngày 24/09 trang menu
  // trả 200 với dữ liệu đúng trong khi database đã bị xóa, vì đang phục vụ từ cache dữ liệu.
  let html = "";
  let res;
  try {
    res = await fetch(`${GOC}/r/${SLUG}/menu?khoi=${Date.now()}`, { redirect: "manual" });
    html = await res.text();
  } catch (err) {
    ghi("1. Trang menu trả 200 và có món từ database", "HỎNG", `không gọi được: ${err.message}`);
  }

  if (res) {
    const coMon = html.includes("base_price");
    ghi(
      "1. Trang menu trả 200 và có món từ database",
      res.status === 200 && coMon ? "ĐẠT" : "HỎNG",
      `HTTP ${res.status}, ${html.length} byte, ${coMon ? "có" : "KHÔNG có"} dữ liệu món` +
        " (lưu ý: dữ liệu có thể đến từ cache, không chứng minh database đang sống)"
    );

    const vung = vungTinhToan(res.headers.get("x-vercel-id"));
    ghi(
      `2. Compute chạy ở vùng ${VUNG}`,
      vung === null ? "KHÔNG KIỂM ĐƯỢC" : vung === VUNG ? "ĐẠT" : "HỎNG",
      `X-Vercel-Id = ${res.headers.get("x-vercel-id") ?? "(không có)"}`
    );

    const anh = anhTrongHtml(html);
    if (anh.length === 0) {
      ghi("3. Mọi ảnh trong trang tải được", "KHÔNG KIỂM ĐƯỢC", "trang không có ảnh nào");
    } else {
      const hong = [];
      for (const u of anh) {
        const r = await fetch(u, { method: "HEAD" }).catch((e) => ({ status: `lỗi mạng: ${e.message}` }));
        if (r.status !== 200) hong.push(`${r.status} ${u}`);
      }
      ghi(
        "3. Mọi ảnh trong trang tải được",
        hong.length === 0 ? "ĐẠT" : "HỎNG",
        hong.length === 0 ? `${anh.length}/${anh.length} ảnh trả 200` : hong.join("\n      ")
      );
    }

    const la = hostLa(html, HOST);
    ghi(
      "4. Không còn host Supabase lạ trong trang",
      la.length === 0 ? "ĐẠT" : "HỎNG",
      la.length === 0 ? `chỉ có ${HOST}` : `host lạ: ${la.join(", ")}`
    );
  }

  ghi(
    "5. Giờ hiển thị khớp giờ Việt Nam",
    "KHÔNG KIỂM ĐƯỢC",
    "không có trang công khai nào hiển thị giờ (hóa đơn/phiếu cần đăng nhập). Lớp lỗi này chặn " +
      "ở bộ test: vitest chạy dưới TZ=UTC + chốt chặn toLocale* trong tests/time/vn.test.ts"
  );

  for (const { ten, kq: k, chiTiet } of kq) {
    console.log(`[${k}] ${ten}\n      ${chiTiet}`);
  }
  const hong = kq.filter((x) => x.kq === "HỎNG").length;
  const khong = kq.filter((x) => x.kq === "KHÔNG KIỂM ĐƯỢC").length;
  console.log(`\n${kq.length - hong - khong} đạt · ${hong} hỏng · ${khong} không kiểm được`);
  process.exit(hong > 0 ? 1 : 0);
}
