/**
 * Thu ngân hỏi bếp xong, bếp bảo còn → bấm ✕ để ẩn nhãn "Có thể đã hết" của món đó TỚI HẾT NGÀY,
 * chỉ trên máy này (chủ dự án chốt 08/10/2026). Không đổi sổ kho: mai sổ tính lại, vẫn hết thì nhãn
 * hiện lại. Khóa theo quán + ngày kinh doanh; khóa ngày cũ của quán dọn khi ẩn món mới.
 */
const PREFIX = "pos-an-canh-bao-het";

const keyOf = (slug: string, day: string) => `${PREFIX}:${slug}:${day}`;

export function readHiddenWarnings(storage: Storage, slug: string, day: string): Set<string> {
  try {
    const ids: unknown = JSON.parse(storage.getItem(keyOf(slug, day)) ?? "[]");
    return new Set(Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set(); // dữ liệu hỏng / trình duyệt chặn lưu trữ → coi như chưa ẩn
  }
}

export function hideWarning(storage: Storage, slug: string, day: string, id: string): void {
  try {
    const own = `${PREFIX}:${slug}:`;
    for (let i = storage.length - 1; i >= 0; i--) {
      const k = storage.key(i);
      if (k?.startsWith(own) && k !== keyOf(slug, day)) storage.removeItem(k);
    }
    const ids = readHiddenWarnings(storage, slug, day).add(id);
    storage.setItem(keyOf(slug, day), JSON.stringify([...ids]));
  } catch {
    // không lưu được thì nhãn chỉ ẩn tới khi tải lại trang — vẫn hơn là báo lỗi giữa ca
  }
}
