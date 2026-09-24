/**
 * Log có cấu trúc theo tenant (PERF-04).
 *
 * Mục đích: trả lời ba câu bằng số thay vì bằng cảm giác — quán nào tốn nhất, đường nào chậm nhất,
 * và POS render bao nhiêu lần mỗi giờ cao điểm. Câu cuối là thứ quyết định có viết lại realtime hay
 * không (hướng C), nên nó phải đo được trước khi ai đụng vào `PosBoard`.
 *
 * Cố ý KHÔNG thêm hạ tầng: một dòng JSON trên stdout, log của Vercel truy vấn được. Nếu phải dựng
 * thêm dịch vụ mới biết mình tốn bao nhiêu thì chi phí đo đã lớn hơn cái cần đo.
 *
 * Dùng `console.log` (không phải `info`/`warn`): Vercel gộp các mức khác nhau theo cách khác nhau,
 * trộn mức lên là sau này lọc rất khổ.
 */

export type RequestLog = {
  evt: "req";
  /** Slug nhà hàng; null với route ngoài `/r/*` (vd `/super`, `/`) — vẫn log vì vẫn tốn tiền. */
  tenant: string | null;
  path: string;
  ms: number;
  status: number;
};

type OpLog = {
  evt: "op";
  name: string;
  tenant: string | null;
  ms: number;
  ok: boolean;
};

/**
 * Bỏ query string. Bề mặt khách mang `?t=<qr_token>` — đó là khóa mở bàn, ghi vào log là đem khóa
 * đi rải khắp mọi nơi lưu log. Không có tham số nào trong query đáng để đánh đổi việc đó.
 */
function stripQuery(path: string): string {
  const i = path.indexOf("?");
  return i === -1 ? path : path.slice(0, i);
}

/** Ghi một dòng. Nuốt MỌI lỗi: đường ghi log không bao giờ được làm hỏng request. */
function emit(entry: RequestLog | OpLog): void {
  try {
    console.log(JSON.stringify(entry));
  } catch {
    // Không có gì để làm ở đây. Log hỏng thì im lặng còn hơn làm chết request thật.
  }
}

export function logRequest(entry: RequestLog): void {
  emit({ ...entry, path: stripQuery(entry.path) });
}

/**
 * Đo một thao tác server rồi trả nguyên kết quả. `fn` ném thì vẫn ghi log nhưng **ném tiếp** —
 * nuốt lỗi nghiệp vụ ở đây là biến một sự cố thành một dòng log không ai đọc.
 */
export async function timed<T>(
  name: string,
  tenant: string | null,
  fn: () => Promise<T>
): Promise<T> {
  const t0 = Date.now();
  try {
    const result = await fn();
    emit({ evt: "op", name, tenant, ms: Date.now() - t0, ok: true });
    return result;
  } catch (err) {
    emit({ evt: "op", name, tenant, ms: Date.now() - t0, ok: false });
    throw err;
  }
}
