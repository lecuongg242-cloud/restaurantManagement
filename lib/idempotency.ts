/**
 * Khóa idempotent — dùng chung cho đường TẠO ĐƠN (`lib/orders`) và đường THU TIỀN (`lib/billing`).
 *
 * VẤN ĐỀ: máy POS chạy WiFi trong nhà hàng, rớt mạng vài giây là chuyện thường. Server commit xong
 * mà phản hồi không về được thì client KHÔNG BIẾT lượt ghi đó đã vào DB hay chưa. Nó chỉ có hai lựa
 * chọn tệ như nhau: bấm lại (đơn/khoản thu nhân đôi) hoặc không bấm (khách chờ món không bao giờ
 * tới). Khóa idempotent xóa thế lưỡng nan đó — bấm lại luôn AN TOÀN.
 *
 * KHÓA SINH Ở CLIENT. Server không phân biệt được "người dùng bấm hai lần CỐ Ý cho hai đơn khác
 * nhau" với "một lần bấm bị gửi lại"; chỉ client biết đâu là MỘT hành động của người dùng.
 *
 * LUẬT: một lần bấm = một khóa. Mọi lượt GỬI LẠI của chính lần bấm đó dùng lại đúng khóa cũ; người
 * dùng bắt đầu một hành động MỚI thì phải sinh khóa mới.
 */

/** Giữ khóa của hành động đang dở. Tạo một cái cho mỗi bề mặt có nút gửi (xem `createActionKey`). */
export type ActionKey = {
  /**
   * Khóa cho lần gửi này. `signature` mô tả NỘI DUNG sắp gửi: giống hệt lần trước ⇒ đây là lượt gửi
   * lại của cùng một hành động ⇒ trả lại đúng khóa cũ; khác đi ⇒ hành động mới ⇒ khóa mới.
   */
  keyFor(signature: string): string;
  /** Hành động đã XONG (server trả thành công) — lần bấm kế tiếp là một hành động khác. */
  done(): void;
};

/** Khóa đang dở + chữ ký nội dung đã sinh ra nó. Hình dạng dùng chung cho bản trong RAM và bản lưu. */
export type PendingActionKey = { signature: string; key: string };

/**
 * Luật lõi: chữ ký giống lần trước ⇒ giữ khóa cũ; khác đi (hoặc chưa có gì) ⇒ khóa mới.
 *
 * Vì sao ràng buộc "khóa mới" vào NỘI DUNG chứ không vào các mốc thao tác (mở/đóng hộp thoại, đổi
 * bàn, sửa giỏ): đặt `reset()` rải rác ở từng chỗ sửa giỏ là đường sai sót cao nhất — quên một chỗ
 * là hỏng theo hướng NGUY HIỂM. Ca cụ thể: gửi hỏng vì mạng, nhân viên thêm một món rồi bấm lại;
 * nếu khóa còn nguyên thì server thấy trùng và trả lại ĐƠN CŨ, món vừa thêm im lặng biến mất. So
 * chữ ký thì ca đó tự có khóa mới, không cần ai nhớ gọi gì.
 *
 * Chiều ngược lại — cùng nội dung nhưng là hành động THẬT SỰ mới (hai khách liên tiếp gọi y hệt
 * nhau) — do `done()` lo: gửi xong là quên khóa, lần sau chắc chắn khóa mới.
 *
 * Tách thành hàm thuần vì có HAI nơi giữ khóa với vòng đời khác nhau (RAM theo component; hoặc
 * `sessionStorage` sống qua F5 — xem `usePersistedActionKey`), mà luật thì chỉ được có một bản.
 */
export function nextActionKey(
  previous: PendingActionKey | null,
  signature: string,
  newId: () => string
): PendingActionKey {
  if (previous && previous.signature === signature) return previous;
  return { signature, key: newId() };
}

/** Bản giữ khóa TRONG RAM — mất khi component unmount hoặc tải lại trang. `newId` tách ra để test. */
export function createActionKey(newId: () => string = () => crypto.randomUUID()): ActionKey {
  let pending: PendingActionKey | null = null;
  return {
    keyFor(signature: string): string {
      pending = nextActionKey(pending, signature, newId);
      return pending.key;
    },
    done(): void {
      pending = null;
    },
  };
}

/** Đọc `{signature, key}` đã lưu; trả `null` nếu chưa có / hỏng hình dạng. Thuần, không chạm storage. */
export function parsePendingActionKey(raw: string | null): PendingActionKey | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as { signature?: unknown; key?: unknown };
    // Khóa lưu mà không phải uuid thì coi như chưa có — thà sinh khóa mới còn hơn gửi lên rác.
    if (typeof v?.signature !== "string" || normalizeIdempotencyKey(v?.key) === null) return null;
    return { signature: v.signature, key: v.key as string };
  } catch {
    return null;
  }
}

/**
 * Chữ ký của nội dung sắp gửi. KHÔNG phải hàm băm — chỉ cần so bằng được giữa hai lần bấm liền nhau
 * trên cùng một màn, nơi dữ liệu là chính những object đang nằm trong state (thứ tự khóa không đổi).
 */
export function actionSignature(parts: unknown[]): string {
  return JSON.stringify(parts);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Khóa từ client → giá trị ghi được vào cột `uuid`, hoặc `null` nếu không dùng được.
 *
 * Cột là `uuid` nên chuỗi rác làm Postgres ném 22P02 và cả lượt ghi HỎNG — tức một client gửi bậy
 * (route đơn khách QR/online nhận body ẩn danh) sẽ chặn được cả việc gọi món. Lọc ở đây thì tệ nhất
 * chỉ là mất lớp chống trùng cho chính lượt gửi đó, còn đơn vẫn vào bình thường.
 */
export function normalizeIdempotencyKey(raw: unknown): string | null {
  return typeof raw === "string" && UUID_RE.test(raw) ? raw.toLowerCase() : null;
}

/**
 * Lỗi từ Postgres có phải VI PHẠM UNIQUE (23505) không — tức "khóa này đã có bản ghi rồi".
 *
 * VÌ SAO GHI TRƯỚC RỒI BẮT LỖI, chứ không kiểm tra trước rồi mới ghi: hai request cùng khóa tới gần
 * như đồng thời sẽ CÙNG kiểm và CÙNG không thấy gì, rồi cùng ghi — đúng thứ cần chặn. Ghi trước thì
 * Postgres phân xử: đúng một lệnh INSERT thắng, lệnh kia nhận 23505 và đi tra lại bản ghi vừa thắng.
 * Không có cửa sổ đua nào.
 *
 * (Nơi gọi vẫn phải TRA LẠI bản ghi cũ trước khi báo thành công — 23505 chỉ nói "có va chạm", còn
 * bản ghi cũ có thật hay không thì phải đọc mới biết.)
 */
export function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === "23505";
}
