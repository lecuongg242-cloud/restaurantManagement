"use client";

import { useEffect, useState } from "react";

/**
 * Phần chỉ biết được ở máy người dùng (tab Thêm, Giao diện B9): hướng dẫn "Thêm vào MH chính" — CHỈ trên Safari iPhone /
 * iPad chưa cài; dòng phiên bản — app Android gắn `TechMenuQuanLy/x.y.z` vào user agent, còn lại là bản web.
 */
export function HuongDanIphone() {
  const [hien, setHien] = useState(false);
  useEffect(() => {
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const daCai = (navigator as Navigator & { standalone?: boolean }).standalone === true || matchMedia("(display-mode: standalone)").matches;
    setHien(ios && !daCai);
  }, []);
  if (!hien) return null;
  return (
    <section className="rounded-lg border border-hairline-soft bg-canvas p-md shadow-card">
      <h2 className="text-sm font-medium text-ink">Cài lên màn hình chính iPhone</h2>
      <ol className="mt-xs list-decimal pl-lg text-sm text-slate">
        <li>Mở trang này bằng Safari.</li>
        <li>
          Bấm nút <strong>Chia sẻ</strong> (ô vuông có mũi tên lên) ở thanh dưới.
        </li>
        <li>
          Chọn <strong>“Thêm vào MH chính”</strong> → <strong>Thêm</strong>. Biểu tượng “TM Quản lý” sẽ có trên màn hình chính.
        </li>
      </ol>
    </section>
  );
}

export function DongPhienBan() {
  const [chu, setChu] = useState("");
  useEffect(() => {
    const m = /TechMenuQuanLy\/([\d.]+)/.exec(navigator.userAgent);
    setChu(m ? `Phiên bản ${m[1]}` : "Bản web");
  }, []);
  return <p className="text-center text-xs text-steel">{chu}</p>;
}
