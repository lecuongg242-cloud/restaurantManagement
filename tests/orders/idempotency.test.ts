import { describe, it, expect } from "vitest";
import {
  actionSignature,
  createActionKey,
  isDuplicateKeyError,
  normalizeIdempotencyKey,
} from "@/lib/idempotency";

/** Sinh id đếm được để khẳng định "khóa mới" / "khóa cũ" mà không phụ thuộc crypto.randomUUID. */
const counter = () => {
  let n = 0;
  return () => `k${++n}`;
};

describe("createActionKey — một lần bấm = một khóa", () => {
  it("gửi lại CÙNG nội dung (mạng rớt rồi bấm lại) → đúng khóa cũ", () => {
    const key = createActionKey(counter());
    const sig = actionSignature(["ban-1", [{ itemId: "pho", qty: 2 }]]);
    expect(key.keyFor(sig)).toBe("k1");
    expect(key.keyFor(sig)).toBe("k1");
    expect(key.keyFor(sig)).toBe("k1");
  });

  it("SỬA GIỎ rồi mới gửi lại → khóa MỚI (nếu không, món vừa thêm sẽ im lặng biến mất)", () => {
    const key = createActionKey(counter());
    expect(key.keyFor(actionSignature([[{ itemId: "pho", qty: 1 }]]))).toBe("k1");
    expect(key.keyFor(actionSignature([[{ itemId: "pho", qty: 2 }]]))).toBe("k2");
  });

  it("đổi BÀN nhưng giỏ y hệt → khóa mới (hai đơn khác nhau, không được gộp)", () => {
    const key = createActionKey(counter());
    const lines = [{ itemId: "pho", qty: 1 }];
    expect(key.keyFor(actionSignature(["ban-1", lines]))).toBe("k1");
    expect(key.keyFor(actionSignature(["ban-2", lines]))).toBe("k2");
  });

  it("done() rồi gửi lại nội dung Y HỆT → khóa mới (hai khách liên tiếp gọi giống nhau)", () => {
    const key = createActionKey(counter());
    const sig = actionSignature([[{ itemId: "tra-da", qty: 1 }]]);
    expect(key.keyFor(sig)).toBe("k1");
    key.done();
    expect(key.keyFor(sig)).toBe("k2");
  });

  it("quay lại nội dung CŨ sau khi đã đổi → vẫn là khóa mới (chỉ nhớ lần gửi gần nhất)", () => {
    const key = createActionKey(counter());
    const a = actionSignature(["A"]);
    const b = actionSignature(["B"]);
    expect(key.keyFor(a)).toBe("k1");
    expect(key.keyFor(b)).toBe("k2");
    expect(key.keyFor(a)).toBe("k3");
  });

  it("done() hai lần liên tiếp không làm hỏng gì", () => {
    const key = createActionKey(counter());
    key.done();
    key.done();
    expect(key.keyFor(actionSignature(["x"]))).toBe("k1");
  });

  it("mặc định sinh uuid thật — dùng được thẳng cho cột uuid", () => {
    const k = createActionKey().keyFor(actionSignature(["x"]));
    expect(normalizeIdempotencyKey(k)).toBe(k);
  });
});

describe("actionSignature", () => {
  it("cùng dữ liệu → cùng chữ ký", () => {
    expect(actionSignature([1, "a", { q: 2 }])).toBe(actionSignature([1, "a", { q: 2 }]));
  });

  it("phân biệt được số 2 với chuỗi '2' (giỏ 2 suất ≠ ghi chú '2')", () => {
    expect(actionSignature([2])).not.toBe(actionSignature(["2"]));
  });

  it("undefined và null ở cùng vị trí không được lẫn thành một", () => {
    // JSON.stringify biến `undefined` trong mảng thành `null`; nơi gọi phải tự chuẩn hóa về `null`
    // trước — test này ghim lại giới hạn đó để không ai trông chờ điều ngược lại.
    expect(actionSignature([undefined])).toBe(actionSignature([null]));
  });
});

describe("normalizeIdempotencyKey — lọc trước khi chạm cột uuid", () => {
  it("uuid hợp lệ → giữ nguyên (đã hạ về chữ thường)", () => {
    expect(normalizeIdempotencyKey("3F2504E0-4F89-11D3-9A0C-0305E82C3301")).toBe(
      "3f2504e0-4f89-11d3-9a0c-0305e82c3301"
    );
  });

  it("chuỗi rác / rỗng / sai độ dài → null, KHÔNG để Postgres ném 22P02 chặn cả lượt gọi món", () => {
    expect(normalizeIdempotencyKey("")).toBeNull();
    expect(normalizeIdempotencyKey("abc")).toBeNull();
    expect(normalizeIdempotencyKey("3f2504e0-4f89-11d3-9a0c-0305e82c33011")).toBeNull();
    expect(normalizeIdempotencyKey("zzzzzzzz-4f89-11d3-9a0c-0305e82c3301")).toBeNull();
    expect(normalizeIdempotencyKey("'; drop table orders; --")).toBeNull();
  });

  it("không phải chuỗi → null", () => {
    expect(normalizeIdempotencyKey(undefined)).toBeNull();
    expect(normalizeIdempotencyKey(null)).toBeNull();
    expect(normalizeIdempotencyKey(42)).toBeNull();
    expect(normalizeIdempotencyKey({ key: "x" })).toBeNull();
  });
});

describe("isDuplicateKeyError", () => {
  it("23505 (vi phạm unique) → true", () => {
    expect(isDuplicateKeyError({ code: "23505", message: "duplicate key value" })).toBe(true);
  });

  it("mã lỗi khác → false (không được nhận nhầm lỗi ghi thành 'đã có đơn rồi')", () => {
    expect(isDuplicateKeyError({ code: "23503" })).toBe(false);
    expect(isDuplicateKeyError({ code: "22P02" })).toBe(false);
    expect(isDuplicateKeyError({ code: 23505 })).toBe(false); // số, không phải chuỗi
  });

  it("null / undefined / chuỗi → false", () => {
    expect(isDuplicateKeyError(null)).toBe(false);
    expect(isDuplicateKeyError(undefined)).toBe(false);
    expect(isDuplicateKeyError("23505")).toBe(false);
  });
});
