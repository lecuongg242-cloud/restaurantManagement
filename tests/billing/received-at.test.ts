import { describe, it, expect } from "vitest";
import { resolveReceivedAt, isWithinBackdateWindow, BACKDATE_MAX_DAYS } from "@/lib/billing/received-at";

const NOW = new Date("2026-08-14T06:00:00+07:00");
const iso = (s: string) => new Date(s).toISOString();

/** Tiện đọc: lấy `at` khi mong đợi thành công, ném nếu hàm trả lỗi. */
function at(r: ReturnType<typeof resolveReceivedAt>): string {
  if ("error" in r) throw new Error(`Mong đợi thành công, nhận lỗi: ${r.error}`);
  return r.at;
}
/** Tiện đọc: lấy `error` khi mong đợi bị chặn. */
function err(r: ReturnType<typeof resolveReceivedAt>): string {
  if (!("error" in r)) throw new Error(`Mong đợi lỗi, nhận mốc: ${r.at}`);
  return r.error;
}

describe("resolveReceivedAt — mốc tiền về của một lần thu", () => {
  it("bỏ trống ⇒ lấy bây giờ (luồng thu tiền thường ngày)", () => {
    expect(at(resolveReceivedAt(undefined, false, NOW))).toBe(NOW.toISOString());
    expect(at(resolveReceivedAt(null, false, NOW))).toBe(NOW.toISOString());
  });

  it("quản lý ghi lùi về hôm trước ⇒ giữ nguyên mốc đó", () => {
    // Đúng ca 37 đơn ngày 13/08/2026: tạo 06:09 hôm trước, sáng hôm sau mới bấm.
    const thucTe = iso("2026-08-13T06:09:00+07:00");
    expect(at(resolveReceivedAt(thucTe, true, NOW))).toBe(thucTe);
  });

  it("nhân viên thường KHÔNG được ghi lùi", () => {
    const r = resolveReceivedAt(iso("2026-08-13T06:09:00+07:00"), false, NOW);
    expect(err(r)).toContain("chủ quán hoặc quản lý");
  });

  it("lệch đồng hồ vài phút vẫn qua, kể cả nhân viên thường", () => {
    // Máy trạm chậm 2 phút là chuyện thường — chặn ở đây là chặn nhầm việc thu tiền bình thường.
    const lech = iso("2026-08-14T05:58:00+07:00");
    expect(at(resolveReceivedAt(lech, false, NOW))).toBe(lech);
  });

  it("từ chối mốc ở tương lai, kể cả quản lý", () => {
    const r = resolveReceivedAt(iso("2026-08-14T09:00:00+07:00"), true, NOW);
    expect(err(r)).toContain("tương lai");
  });

  it(`không cho lùi quá ${BACKDATE_MAX_DAYS} ngày`, () => {
    const quaXa = iso("2026-08-06T06:00:00+07:00"); // 8 ngày trước
    expect(err(resolveReceivedAt(quaXa, true, NOW))).toContain("tối đa");

    const vuaDu = iso("2026-08-07T07:00:00+07:00"); // trong hạn 7 ngày
    expect(at(resolveReceivedAt(vuaDu, true, NOW))).toBe(vuaDu);
  });

  it("chuỗi thời gian rác ⇒ báo lỗi, không âm thầm lấy bây giờ", () => {
    expect(err(resolveReceivedAt("hôm qua", true, NOW))).toContain("không hợp lệ");
  });
});

describe("isWithinBackdateWindow — giao diện có nên mời ghi lùi không", () => {
  it("đơn hôm qua / 3 ngày trước ⇒ còn hạn", () => {
    expect(isWithinBackdateWindow(iso("2026-08-13T06:09:00+07:00"), NOW)).toBe(true);
    expect(isWithinBackdateWindow(iso("2026-08-11T19:30:00+07:00"), NOW)).toBe(true);
  });

  it(`đơn quá ${BACKDATE_MAX_DAYS} ngày ⇒ hết hạn (khớp chốt server)`, () => {
    const quaXa = iso("2026-08-04T06:00:00+07:00"); // 10 ngày trước
    expect(isWithinBackdateWindow(quaXa, NOW)).toBe(false);
    expect(err(resolveReceivedAt(quaXa, true, NOW))).toContain("tối đa");
  });

  it("đúng ranh giới: trong hạn thì true, vừa quá thì false — không lệch với chốt server", () => {
    const vuaDu = iso("2026-08-07T07:00:00+07:00"); // trong hạn 7 ngày
    expect(isWithinBackdateWindow(vuaDu, NOW)).toBe(true);
    expect(at(resolveReceivedAt(vuaDu, true, NOW))).toBe(vuaDu);

    const vuaQua = iso("2026-08-07T05:00:00+07:00"); // quá 7 ngày một chút
    expect(isWithinBackdateWindow(vuaQua, NOW)).toBe(false);
    expect(err(resolveReceivedAt(vuaQua, true, NOW))).toContain("tối đa");
  });

  it("mốc tương lai và chuỗi rác ⇒ false (fail-closed, không mời bấm)", () => {
    expect(isWithinBackdateWindow(iso("2026-08-14T09:00:00+07:00"), NOW)).toBe(false);
    expect(isWithinBackdateWindow("hôm qua", NOW)).toBe(false);
    expect(isWithinBackdateWindow(null, NOW)).toBe(false);
  });
});
