import { describe, it, expect } from "vitest";
import { scrubEvent, type ScrubbableEvent } from "@/lib/observability/scrub";

/**
 * OPS-10 — sự kiện lỗi gửi ra dịch vụ ngoài (Sentry) KHÔNG được mang: token bàn (`?t=` là khóa mở
 * bàn), body request (tên/SĐT/địa chỉ khách, mật khẩu cầu in), cookie, header xác thực.
 * Cùng nguyên tắc với `lib/observability/log.ts` — log ra đâu thì cũng không mang khóa theo.
 */
const TOKEN = "bimat123";

function suKien(): ScrubbableEvent {
  return {
    message: "lỗi thử",
    request: {
      url: `https://app.example/r/pho-viet/menu?t=${TOKEN}`,
      query_string: `t=${TOKEN}`,
      data: { customerPhone: "0901234567", password: "p@ss" },
      cookies: { "sb-access-token": "jwt" },
      headers: {
        authorization: "Bearer jwt",
        cookie: "sb=jwt",
        "user-agent": "Mozilla",
      },
    },
    breadcrumbs: [
      { category: "fetch", data: { url: `/r/pho-viet/api/order/1?t=${TOKEN}`, method: "GET" } },
      { category: "navigation", data: { from: `/r/pho-viet/menu?t=${TOKEN}`, to: "/r/pho-viet/cart" } },
    ],
  };
}

describe("scrubEvent", () => {
  it("không còn token bàn ở bất kỳ đâu trong sự kiện", () => {
    const out = scrubEvent(suKien());
    expect(JSON.stringify(out)).not.toContain(TOKEN);
  });

  it("gỡ body, cookie, authorization, cookie header", () => {
    const out = scrubEvent(suKien());
    expect(out.request?.data).toBeUndefined();
    expect(out.request?.cookies).toBeUndefined();
    expect(out.request?.query_string).toBeUndefined();
    expect(out.request?.headers?.authorization).toBeUndefined();
    expect(out.request?.headers?.cookie).toBeUndefined();
    expect(JSON.stringify(out)).not.toContain("0901234567");
  });

  it("giữ những gì cần để điều tra: đường dẫn, user-agent, thông điệp", () => {
    const out = scrubEvent(suKien());
    expect(out.request?.url).toBe("https://app.example/r/pho-viet/menu");
    expect(out.request?.headers?.["user-agent"]).toBe("Mozilla");
    expect(out.message).toBe("lỗi thử");
    expect(out.breadcrumbs?.[1].data?.to).toBe("/r/pho-viet/cart");
  });

  it("gắn tag tenant_slug từ đường dẫn /r/[slug]", () => {
    expect(scrubEvent(suKien()).tags?.tenant_slug).toBe("pho-viet");
  });

  it("route ngoài /r/* → không gắn tenant, không lỗi", () => {
    const out = scrubEvent<ScrubbableEvent>({ request: { url: "https://app.example/super" } });
    expect(out.tags?.tenant_slug).toBeUndefined();
  });

  it("sự kiện không có request vẫn đi qua nguyên vẹn", () => {
    expect(scrubEvent({ message: "x" })).toEqual({ message: "x" });
  });
});
