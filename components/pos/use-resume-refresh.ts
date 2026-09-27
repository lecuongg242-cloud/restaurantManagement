"use client";

import { useEffect, useRef } from "react";

/**
 * Tải lại khi máy THỨC DẬY hoặc CÓ MẠNG LẠI (ORDER-19).
 *
 * iPad, điện thoại, tablet ngủ liên tục. Trong lúc ngủ WebSocket realtime chết mà không có sự kiện nào
 * báo; supabase-js tự nối lại nhưng KHÔNG phát lại các thay đổi đã lỡ ⇒ không tải lại là POS hiện bàn
 * trống trong khi bàn đang có khách. Mỗi lần tải lại là một lượt render server (PERF-04), nên sự kiện
 * dồn dập (hiện lại + có mạng cùng lúc) được gộp: không tải lại nếu lần trước chưa đủ `khoangCachMs`.
 */
export function taoBoLamMoi({
  goi,
  now,
  khoangCachMs,
}: {
  goi: () => void;
  now: () => number;
  khoangCachMs: number;
}) {
  let lanCuoi = -Infinity;
  const thu = () => {
    const t = now();
    if (t - lanCuoi < khoangCachMs) return;
    lanCuoi = t;
    goi();
  };
  return {
    khiHienLai: (trangThai: DocumentVisibilityState) => {
      if (trangThai === "visible") thu();
    },
    khiCoMang: thu,
  };
}

export function useResumeRefresh(onResume: () => void, khoangCachMs = 5000) {
  const goiRef = useRef(onResume);
  goiRef.current = onResume;

  useEffect(() => {
    const bo = taoBoLamMoi({ goi: () => goiRef.current(), now: () => Date.now(), khoangCachMs });
    const hien = () => bo.khiHienLai(document.visibilityState);
    const mang = () => bo.khiCoMang();
    document.addEventListener("visibilitychange", hien);
    window.addEventListener("online", mang);
    return () => {
      document.removeEventListener("visibilitychange", hien);
      window.removeEventListener("online", mang);
    };
  }, [khoangCachMs]);
}
