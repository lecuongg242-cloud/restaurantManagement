import { describe, it, expect } from "vitest";

/**
 * BUG "giờ trên phiếu không khớp giờ thực tế" — hóa đơn qt-food in ra 23:34 23/09/2026 trong khi
 * lúc đó là sáng 24/09. Lệch đúng 7 tiếng = UTC so với giờ Việt Nam.
 *
 * Nguyên nhân: ba trang in là SERVER COMPONENT, định dạng bằng `toLocaleString("vi-VN", …)` mà
 * không nêu `timeZone`. Node lấy múi giờ của máy chạy: máy dev là UTC+7 nên nhìn đúng, còn Vercel
 * là UTC nên in sớm 7 tiếng. Đó là lý do lỗi sống sót qua mọi lần thử ở local.
 *
 * VÌ SAO ÉP TZ=UTC: chạy dưới múi giờ máy dev thì code HỎNG cũng cho kết quả đúng, test sẽ xanh
 * và chẳng chứng minh được gì. Phải giả lập đúng môi trường production.
 */
process.env.TZ = "UTC";

const SANG_24 = "2026-09-24T06:34:00.000Z"; // 13:34 giờ VN
const KHUYA_23 = "2026-09-23T18:00:00.000Z"; // 01:00 ngày 24 giờ VN — qua ngày khác

// Nạp sau khi đã đặt TZ.
const { gioVn, gioNgayVn, gioNgayNamVn } = await import("@/lib/time/vn");

describe("đối chứng: TZ=UTC thật sự có hiệu lực", () => {
  it("cách định dạng CŨ (không nêu timeZone) cho ra giờ UTC — đây chính là lỗi", () => {
    const cu = new Date(SANG_24).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit" });
    expect(cu, "TZ=UTC không có tác dụng → mọi test dưới đây vô nghĩa").toBe("06:34");
  });
});

describe("gioVn", () => {
  it("trả giờ Việt Nam chứ không phải giờ máy chủ", () => {
    expect(gioVn(SANG_24)).toBe("13:34");
  });

  it("qua nửa đêm giờ VN vẫn đúng", () => {
    expect(gioVn(KHUYA_23)).toBe("01:00");
  });

  it("không có mốc thời gian → chuỗi rỗng, không phải 'Invalid Date'", () => {
    expect(gioVn(null)).toBe("");
    expect(gioVn(undefined)).toBe("");
    expect(gioVn("khong-phai-ngay")).toBe("");
  });
});

describe("gioNgayVn", () => {
  it("kèm ngày/tháng theo lịch Việt Nam", () => {
    expect(gioNgayVn(SANG_24)).toBe("13:34 24/09");
  });

  it("18h UTC ngày 23 là ngày 24 ở Việt Nam — phiếu bếp phải ghi ngày 24", () => {
    expect(gioNgayVn(KHUYA_23)).toBe("01:00 24/09");
  });

  it("không có mốc thời gian → chuỗi rỗng", () => {
    expect(gioNgayVn(null)).toBe("");
  });
});

describe("gioNgayNamVn", () => {
  it("kèm cả năm — dạng dùng trên hóa đơn", () => {
    expect(gioNgayNamVn(SANG_24)).toBe("13:34 24/09/2026");
  });

  it("đúng cái đã in sai ở qt-food: 23:34 23/09/2026 phải là 06:34 24/09/2026", () => {
    expect(gioNgayNamVn("2026-09-23T23:34:00.000Z")).toBe("06:34 24/09/2026");
  });

  it("không có mốc thời gian → chuỗi rỗng", () => {
    expect(gioNgayNamVn(null)).toBe("");
  });
});

/**
 * Chốt chặn tái phát. Lỗi này không nằm ở một dòng code sai mà ở một THÓI QUEN: gọi thẳng
 * `toLocale*` để hiện giờ. Nó trông đúng trên máy dev và chỉ sai trên máy chủ, nên review bằng mắt
 * không bắt được. Test này bắt.
 *
 * Định dạng TIỀN (`toLocaleString("vi-VN")` trên một con số) thì không liên quan — chỉ chặn các
 * lời gọi có tuỳ chọn thời gian.
 */
describe("không ai được quay lại gọi toLocale* để hiện giờ", () => {
  it("app/ và components/ chỉ dùng helper trong lib/time/vn.ts", async () => {
    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");

    const tepTs: string[] = [];
    const quet = (d: string) => {
      for (const ten of readdirSync(d)) {
        const p = join(d, ten);
        if (statSync(p).isDirectory()) quet(p);
        else if (/\.tsx?$/.test(ten)) tepTs.push(p);
      }
    };
    quet("app");
    quet("components");

    const viPham = tepTs.filter((p) => {
      const src = readFileSync(p, "utf8");
      if (/toLocaleTimeString/.test(src)) return true;
      // toLocaleString kèm tuỳ chọn giờ/ngày mà không nêu timeZone.
      return /toLocaleString\([^)]*\{[^}]*\b(hour|day|month|year)\b/s.test(src)
        && !/timeZone/.test(src);
    });

    expect(viPham, `Dùng gioVn/gioNgayVn/gioNgayNamVn thay vì tự định dạng:\n${viPham.join("\n")}`)
      .toEqual([]);
  });
});
