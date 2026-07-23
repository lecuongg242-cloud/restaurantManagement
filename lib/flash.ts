import { cookies } from "next/headers";
import crypto from "node:crypto";

/**
 * "Flash" thông báo một lần qua cookie: server action ghi (setFlash), layout đọc
 * (readFlash) rồi truyền cho <Toaster> để hiện toast. Không đổi URL, không cần
 * useActionState ở từng form. Cookie sống ngắn + client tự xoá sau khi hiện.
 */
const COOKIE = "admin_flash";

export type Flash = { id: string; type: "ok" | "error"; message: string };
export const FLASH_COOKIE = COOKIE;

/** Ghi flash trong server action (đọc được ngay ở lần render revalidate kế tiếp). */
export async function setFlash(type: Flash["type"], message: string) {
  const store = await cookies();
  store.set(COOKIE, JSON.stringify({ id: crypto.randomUUID(), type, message }), {
    path: "/",
    maxAge: 15,
    httpOnly: false, // client cần đọc/xoá để không hiện lại
    sameSite: "lax",
  });
}

/** Đọc flash ở Server Component (layout). Trả null nếu không có. */
export async function readFlash(): Promise<Flash | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  try {
    const f = JSON.parse(raw) as Flash;
    return f?.message ? f : null;
  } catch {
    return null;
  }
}
