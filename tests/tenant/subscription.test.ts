import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CA_HAN, HOM_NAY, cong } from "./ca-han";
import {
  GRACE_DAYS,
  congThang,
  soThangToiNgay,
  daysLeft,
  hanSauGiaHan,
  homNayHanDung,
  noiDungGiaHan,
  subscriptionBanner,
  subscriptionState,
} from "@/lib/tenant/subscription";
import { SubscriptionBannerView } from "@/components/tenant/SubscriptionBanner";

/**
 * SUB-01..04 — hạn dùng. Chạy dưới TZ=UTC (vitest.config) như máy chủ Vercel. Bảng ca `CA_HAN`
 * (./ca-han.ts) được dùng lại ở tests/rls/suspend.test.ts để đối chiếu với hàm SQL (MỘT định nghĩa).
 */
describe("subscriptionState", () => {
  it.each(CA_HAN)("$ten → $state", ({ paidUntil, state }) => {
    expect(subscriptionState(paidUntil, HOM_NAY)).toBe(state);
  });

  it("daysLeft qua ranh giới tháng/năm", () => {
    expect(daysLeft("2027-01-02", "2026-12-30")).toBe(3);
    expect(daysLeft("2026-09-20", "2026-09-27")).toBe(-7);
  });
});

describe("homNayHanDung — giờ VN, đổi ngày lúc 04:00", () => {
  it("23:30 giờ VN 27/09 (16:30Z) → 27/09", () => {
    expect(homNayHanDung(new Date("2026-09-27T16:30:00Z"))).toBe("2026-09-27");
  });
  it("00:30 giờ VN 28/09 (17:30Z) → VẪN 27/09: quán đang mở bàn qua nửa đêm không bị khóa giữa ca", () => {
    expect(homNayHanDung(new Date("2026-09-27T17:30:00Z"))).toBe("2026-09-27");
  });
  it("03:59 giờ VN → hôm trước; 04:00 → hôm nay", () => {
    expect(homNayHanDung(new Date("2026-09-27T20:59:00Z"))).toBe("2026-09-27");
    expect(homNayHanDung(new Date("2026-09-27T21:00:00Z"))).toBe("2026-09-28");
  });
});

describe("cộng tháng khi gia hạn", () => {
  it("hạn còn 10 ngày + 1 tháng → cộng từ hạn cũ", () => {
    expect(hanSauGiaHan("2026-10-07", HOM_NAY, 1)).toBe("2026-11-07");
  });
  it("hạn đã qua 20 ngày + 1 tháng → cộng từ hôm nay", () => {
    expect(hanSauGiaHan("2026-09-07", HOM_NAY, 1)).toBe("2026-10-27");
  });
  it("quy ước tháng thiếu ngày (như Postgres): 31/01 + 1 tháng = cuối tháng 2", () => {
    expect(congThang("2027-01-31", 1)).toBe("2027-02-28");
    expect(congThang("2028-01-31", 1)).toBe("2028-02-29"); // năm nhuận
    expect(congThang("2026-08-31", 1)).toBe("2026-09-30");
  });
  it("12 tháng qua năm; 31/12 + 2 tháng = 28/02", () => {
    expect(congThang("2026-09-27", 12)).toBe("2027-09-27");
    expect(congThang("2026-12-31", 2)).toBe("2027-02-28");
  });
});

describe("noiDungGiaHan — `GIAHAN {mã quán} {số tháng}T`", () => {
  it("mã quán ngắn → đủ việc, quán, số tháng; vĩnh viễn → VV", () => {
    expect(noiDungGiaHan("qt-food", null)).toBe("GIAHAN QTFOOD VV");
    expect(noiDungGiaHan("qt-food", 1)).toBe("GIAHAN QTFOOD 1T");
    expect(noiDungGiaHan("qt-food", 24)).toBe("GIAHAN QTFOOD 24T");
  });
  it("mã quán dài → ≤ 25 ký tự ASCII, hai quán cùng tiền tố vẫn khác nhau", () => {
    const a = noiDungGiaHan("com-tam-suon-bi-cha-chi-hai-quan-1", 24);
    const b = noiDungGiaHan("com-tam-suon-bi-cha-chi-hai-quan-2", 24);
    for (const s of [a, b]) {
      expect(s.length).toBeLessThanOrEqual(25);
      expect(s).toMatch(/^GIAHAN [A-Z0-9]+ 24T$/);
    }
    expect(a).not.toBe(b);
  });
  it("mã quán đúng 14 ký tự vẫn giữ nguyên, 24 tháng vừa 25 ký tự", () => {
    const s = noiDungGiaHan("abcdefghijklmn", 24);
    expect(s).toBe("GIAHAN ABCDEFGHIJKLMN 24T");
    expect(s.length).toBe(25);
  });
});

describe("banner nhắc hạn — theo vai", () => {
  const sapHet = cong(3);
  const quaHan = cong(-2);

  it.each(["owner", "manager"])("%s thấy vàng khi sắp hết, đỏ khi quá hạn", (role) => {
    expect(subscriptionBanner(role, sapHet, HOM_NAY)?.tone).toBe("warn");
    expect(subscriptionBanner(role, quaHan, HOM_NAY)?.tone).toBe("danger");
  });

  it.each(["cashier", "waiter", "kitchen", "station"])("%s không thấy gì", (role) => {
    expect(subscriptionBanner(role, sapHet, HOM_NAY)).toBeNull();
    expect(subscriptionBanner(role, quaHan, HOM_NAY)).toBeNull();
  });

  it("còn hạn xa / không giới hạn → không banner", () => {
    expect(subscriptionBanner("owner", cong(30), HOM_NAY)).toBeNull();
    expect(subscriptionBanner("owner", null, HOM_NAY)).toBeNull();
  });

  it("ngày ân hạn cuối → nói rõ khóa từ 04:00 sáng mai", () => {
    expect(subscriptionBanner("owner", cong(-GRACE_DAYS), HOM_NAY)?.text).toMatch(/04:00 sáng mai/);
  });

  it("render: owner có nút Gia hạn, manager không", () => {
    const b = subscriptionBanner("owner", quaHan, HOM_NAY)!;
    const owner = renderToStaticMarkup(createElement(SubscriptionBannerView, { banner: b, giaHanHref: "/r/x/admin/gia-han" }));
    const manager = renderToStaticMarkup(createElement(SubscriptionBannerView, { banner: b, giaHanHref: null }));
    expect(owner).toContain('data-subscription-banner="danger"');
    expect(owner).toContain("/r/x/admin/gia-han");
    expect(manager).not.toContain("gia-han");
  });
});

describe("soThangToiNgay — gợi ý số tháng khi super-admin chọn ngày", () => {
  it("làm tròn lên từ mốc; ngày không sau mốc / quá xa → null", () => {
    expect(soThangToiNgay("2026-09-27", "2026-10-27")).toBe(1);
    expect(soThangToiNgay("2026-09-27", "2026-10-28")).toBe(2);
    expect(soThangToiNgay("2026-09-27", "2026-09-27")).toBeNull();
    expect(soThangToiNgay("2026-09-27", "2030-01-01")).toBeNull();
  });
});
