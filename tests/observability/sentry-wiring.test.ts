import { describe, it, expect, afterEach } from "vitest";
import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "@/lib/observability/sentry-options";

/**
 * OPS-10 — nối thật với SDK: `scrubEvent` là hàm thuần có test riêng, nhưng thứ cần chứng minh là
 * SDK THỰC SỰ gọi nó trước khi gửi. Transport giả bắt payload đúng lúc nó rời SDK.
 */
const TOKEN = "bimat123";
const DSN = "https://public@o0.ingest.sentry.io/0";

function batPayload() {
  const da: string[] = [];
  const transport = () =>
    Sentry.createTransport({ recordDroppedEvent: () => {} }, async (req) => {
      da.push(typeof req.body === "string" ? req.body : new TextDecoder().decode(req.body));
      return { statusCode: 200 };
    });
  return { da, transport };
}

afterEach(async () => {
  await Sentry.close();
});

describe("Sentry nối với scrubEvent", () => {
  it("payload rời SDK không mang token bàn, body, cookie; có tenant_slug", async () => {
    const { da, transport } = batPayload();
    Sentry.init({ ...sentryOptions(DSN), transport });

    Sentry.captureEvent({
      message: "lỗi thử",
      request: {
        url: `https://app.example/r/pho-viet/menu?t=${TOKEN}`,
        query_string: `t=${TOKEN}`,
        data: { customerPhone: "0901234567" },
        cookies: { sb: "jwt" },
        headers: { authorization: "Bearer jwt" },
      },
    });
    await Sentry.flush(2000);

    const payload = da.join("\n");
    expect(payload).toContain("lỗi thử");
    expect(payload).toContain("pho-viet");
    expect(payload).not.toContain(TOKEN);
    expect(payload).not.toContain("0901234567");
    expect(payload).not.toContain("Bearer jwt");
  });

  it("không có DSN → không gửi gì", async () => {
    const { da, transport } = batPayload();
    Sentry.init({ ...sentryOptions(undefined), transport });
    Sentry.captureMessage("không được đi");
    await Sentry.flush(500);
    expect(da).toHaveLength(0);
  });
});
