"use client";

import { useRef } from "react";
import {
  createActionKey,
  nextActionKey,
  parsePendingActionKey,
  type ActionKey,
} from "@/lib/idempotency";

/**
 * Giữ khóa idempotent của bề mặt đang dùng, SỐNG QUA MỌI LƯỢT RENDER (0034).
 *
 * Đây là chỗ dễ sai nhất của cả tính năng: đặt khóa vào `useState` hay tính thẳng trong thân
 * component là nó sinh lại theo nhịp render, và lượt gửi lại sẽ mang khóa MỚI — tức không chống
 * trùng gì cả, chỉ tốn thêm một cột. `useRef` neo đúng một cái vào vòng đời component.
 *
 * `createActionKey()` gọi trong nhánh khởi tạo chứ không đặt thẳng vào `useRef(createActionKey())`:
 * cách sau chạy hàm ở MỌI lượt render rồi vứt kết quả đi — vô hại nhưng gây hiểu nhầm là khóa đổi
 * theo render, đúng thứ đoạn ghi chú này đang cảnh báo.
 */
export function useActionKey(): ActionKey {
  const ref = useRef<ActionKey | null>(null);
  if (ref.current === null) ref.current = createActionKey();
  return ref.current;
}

/**
 * Như `useActionKey` nhưng khóa sống trong `sessionStorage` — tức SỐNG QUA CẢ VIỆC TẢI LẠI TRANG.
 *
 * Chỉ dùng cho bề mặt mà GIỎ HÀNG cũng được lưu qua tải lại (màn khách QR/online — MenuBrowser).
 * Ở đó, "tải lại trang" là phản xạ phổ biến nhất của khách khi mất phản hồi trên điện thoại, và
 * giỏ được khôi phục NGUYÊN VẸN. Nếu khóa chỉ nằm trong RAM thì lượt gửi sau F5 mang khóa mới trên
 * đúng nội dung cũ ⇒ đơn thứ hai — đúng cái mà cả tính năng này sinh ra để chặn.
 *
 * Ngược lại, POS quầy giữ giỏ trong state React: F5 là giỏ sạch, nhân viên phải gõ lại từ đầu, nên
 * đó THẬT SỰ là một hành động mới và `useActionKey` (RAM) mới là đúng. Vòng đời khóa phải bám đúng
 * vòng đời của thứ nó bảo vệ.
 *
 * `storageKey` null (khách chưa có token bàn) ⇒ rơi về bản RAM, không tự bịa chỗ lưu.
 */
export function usePersistedActionKey(storageKey: string | null): ActionKey {
  const fallback = useActionKey();
  const ref = useRef<ActionKey | null>(null);
  const currentKey = useRef<string | null>(null);

  // storageKey đổi (khách quét QR bàn khác) ⇒ dựng lại bộ giữ khóa trỏ vào đúng chỗ lưu mới.
  if (ref.current === null || currentKey.current !== storageKey) {
    currentKey.current = storageKey;
    ref.current =
      storageKey === null
        ? fallback
        : {
            keyFor(signature: string): string {
              const slot = `${storageKey}:idem`;
              // Đọc lại từ storage mỗi lần thay vì nhớ trong RAM: sau F5 thì RAM rỗng nhưng storage
              // vẫn giữ khóa của lần bấm dở — đó chính là ca cần cứu.
              let pending = null;
              try {
                pending = parsePendingActionKey(sessionStorage.getItem(slot));
              } catch {
                /* storage bị chặn (chế độ riêng tư) — coi như chưa có khóa nào */
              }
              const next = nextActionKey(pending, signature, () => crypto.randomUUID());
              try {
                sessionStorage.setItem(slot, JSON.stringify(next));
              } catch {
                /* quota — vẫn trả khóa dùng được cho lượt gửi này */
              }
              return next.key;
            },
            done(): void {
              try {
                sessionStorage.removeItem(`${storageKey}:idem`);
              } catch {
                /* storage bị chặn */
              }
            },
          };
  }
  return ref.current;
}
