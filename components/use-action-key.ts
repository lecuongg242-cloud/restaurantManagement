"use client";

import { useRef } from "react";
import { createActionKey, type ActionKey } from "@/lib/idempotency";

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
