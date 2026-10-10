import { describe, it, expect, beforeEach } from "vitest";
import { readHiddenWarnings, hideWarning } from "@/lib/inventory/hidden-warnings";

/** Storage giả đủ dùng — cùng mặt với `localStorage` mà hàm đọc/ghi. */
function fakeStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
  };
}

describe("ẩn nhãn 'Có thể đã hết' tới hết ngày", () => {
  let s: Storage;
  beforeEach(() => {
    s = fakeStorage();
  });

  it("chưa ẩn gì → rỗng", () => {
    expect(readHiddenWarnings(s, "pho-viet", "2026-10-08").size).toBe(0);
  });

  it("ẩn món trong ngày → đọc lại thấy, quán khác không thấy", () => {
    hideWarning(s, "pho-viet", "2026-10-08", "a");
    hideWarning(s, "pho-viet", "2026-10-08", "b");
    expect([...readHiddenWarnings(s, "pho-viet", "2026-10-08")].sort()).toEqual(["a", "b"]);
    expect(readHiddenWarnings(s, "bun-bo", "2026-10-08").size).toBe(0);
  });

  it("sang ngày mới → hiện lại, khóa ngày cũ của quán bị dọn", () => {
    hideWarning(s, "pho-viet", "2026-10-08", "a");
    hideWarning(s, "bun-bo", "2026-10-08", "x");
    expect(readHiddenWarnings(s, "pho-viet", "2026-10-09").size).toBe(0);
    hideWarning(s, "pho-viet", "2026-10-09", "c");
    expect(s.length).toBe(2); // pho-viet hôm nay + bun-bo (quán khác không đụng)
    expect([...readHiddenWarnings(s, "pho-viet", "2026-10-09")]).toEqual(["c"]);
  });

  it("dữ liệu hỏng hoặc trình duyệt chặn lưu trữ → coi như chưa ẩn, không ném lỗi", () => {
    s.setItem("pos-an-canh-bao-het:pho-viet:2026-10-08", "{hỏng");
    expect(readHiddenWarnings(s, "pho-viet", "2026-10-08").size).toBe(0);
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
    } as unknown as Storage;
    expect(readHiddenWarnings(blocked, "pho-viet", "2026-10-08").size).toBe(0);
    expect(() => hideWarning(blocked, "pho-viet", "2026-10-08", "a")).not.toThrow();
  });
});
