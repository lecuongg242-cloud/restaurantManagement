import { describe, it, expect, vi } from "vitest";
import { buildWeeklyFacts } from "@/lib/insights/facts.mjs";
import { detectAnomalies, lechNgay } from "@/lib/insights/anomalies.mjs";
import { verifyNumbers, demChu } from "@/lib/insights/verify.mjs";
import { templateInsight } from "@/lib/insights/template.mjs";
import { writeInsight, nhaCungCapTuEnv } from "@/lib/insights/llm.mjs";
import { chonQuanDem } from "@/lib/insights/schedule.mjs";
import { congNgay } from "@/lib/forecast/model.mjs";

/** P18 18-03 (AI-04/05): số liệu tuần, luật bất thường, kiểm số, mẫu câu, chuỗi nguồn AI miễn phí, lịch rải. */
const TU = "2026-09-21"; // thứ Hai
type DuLieu = Parameters<typeof buildWeeklyFacts>[0];
type Nguon = ReturnType<typeof nhaCungCapTuEnv>[number];

function duLieu(o: Partial<DuLieu> = {}): DuLieu {
  // 9 tuần: mỗi ngày 1.000.000đ / 20 hóa đơn; tuần này thứ Bảy 2.000.000đ.
  const ngay = Array.from({ length: 63 }, (_, i) => {
    const d = congNgay(TU, -56 + i);
    return { ngay: d, doanhThu: d === "2026-09-26" ? 2_000_000 : 1_000_000, hoaDon: 20 };
  });
  return {
    tuNgay: TU,
    ngay,
    monTuanNay: [
      { ten: "Phở bò", sl: 120, doanhThu: 6_000_000 },
      { ten: "Combo 2 người", sl: 10, doanhThu: 1_500_000 },
    ],
    monTuanTruoc: [{ ten: "Phở bò", sl: 110, doanhThu: 5_500_000 }],
    nhomTuanNay: [{ ten: "Phở", doanhThu: 6_000_000 }],
    nhomTuanTruoc: [{ ten: "Phở", doanhThu: 5_500_000 }],
    theoGio: [
      { gio: 12, doanhThu: 3_000_000 },
      { gio: 19, doanhThu: 2_000_000 },
    ],
    giamGia: { tuanNay: 80_000, tuanTruoc: 70_000 },
    huy: { tuanNay: 40_000, tuanTruoc: 30_000 },
    duBaoTuanToi: { doanhThu: 7_300_000, saiLechPct: 12.4 },
    ...o,
  };
}

describe("buildWeeklyFacts", () => {
  const f = buildWeeklyFacts(duLieu());

  it("tính đúng tổng tuần, so tuần trước, trung bình 4 tuần", () => {
    expect(f.doanhThu).toEqual({
      tuanNay: 8_000_000,
      tuanTruoc: 7_000_000,
      tb4TuanTruoc: 7_000_000,
      soVoiTuanTruocPct: 14.3,
      soVoiTb4TuanPct: 14.3,
    });
    expect(f.hoaDon.tuanNay).toBe(140);
    expect(f.ngayCaoNhat).toMatchObject({ ngay: "2026-09-26", thu: "Thứ Bảy" });
    expect(f.gioCaoDiem).toEqual({ gio: 12, doanhThu: 3_000_000 });
  });

  it("không có khóa nào về SĐT / tên khách / nhân viên; không chuỗi dạng SĐT", () => {
    const khoa: string[] = [];
    const di = (v: unknown) => {
      if (Array.isArray(v)) v.forEach(di);
      else if (v && typeof v === "object") {
        for (const [k, x] of Object.entries(v)) {
          khoa.push(k);
          di(x);
        }
      }
    };
    di(f);
    for (const k of khoa) expect(k.toLowerCase()).not.toMatch(/phone|sdt|khach|customer|staff|nhanvien|member|email|name$/);
    expect(JSON.stringify(f)).not.toMatch(/0\d{9,10}/);
  });
});

describe("detectAnomalies — mỗi luật dương + âm", () => {
  const lichSu = (sua: Record<string, number> = {}) => {
    const m = new Map(duLieu().ngay.map((x) => [x.ngay, x.doanhThu]));
    // Cùng thứ các tuần trước dao động nhẹ để có độ lệch chuẩn > 0.
    for (let k = 1; k <= 8; k++) m.set(congNgay("2026-09-26", -7 * k), 1_000_000 + (k % 2 ? 50_000 : -50_000));
    for (const [d, v] of Object.entries(sua)) m.set(d, v);
    return m;
  };

  it("doanh thu ngày lệch > 2σ so với cùng thứ → có; lệch ít → không; < 4 mẫu → không", () => {
    expect(lechNgay("2026-09-26", lichSu())).toMatchObject({ loai: "doanh-thu-ngay", huong: "cao", doanhThu: 2_000_000 });
    expect(lechNgay("2026-09-26", lichSu({ "2026-09-26": 1_040_000 }))).toBeNull();
    expect(lechNgay("2026-09-26", new Map([["2026-09-26", 5]]))).toBeNull();
  });

  it("tỷ lệ hủy tăng > 3 điểm → có; tăng ít → không", () => {
    const co = buildWeeklyFacts(duLieu({ huy: { tuanNay: 800_000, tuanTruoc: 30_000 } }));
    expect(detectAnomalies(co, new Map(), []).some((a) => a.loai === "huy-tang")).toBe(true);
    expect(detectAnomalies(buildWeeklyFacts(duLieu()), new Map(), []).some((a) => a.loai === "huy-tang")).toBe(false);
  });

  it("tỷ lệ giảm giá tăng > 3 điểm → có; không tăng → không", () => {
    const co = buildWeeklyFacts(duLieu({ giamGia: { tuanNay: 900_000, tuanTruoc: 0 } }));
    expect(detectAnomalies(co, new Map(), []).some((a) => a.loai === "giam-gia-tang")).toBe(true);
    expect(detectAnomalies(buildWeeklyFacts(duLieu()), new Map(), []).some((a) => a.loai === "giam-gia-tang")).toBe(false);
  });

  it("món top 5 tuần trước rơi khỏi top 10 → có; vẫn trong top → không", () => {
    const f = buildWeeklyFacts(duLieu());
    expect(detectAnomalies(f, new Map(), [{ ten: "Bún chả", doanhThu: 9_000_000 }])).toContainEqual({
      loai: "mon-tut-hang",
      ten: "Bún chả",
      hangTuanTruoc: 1,
    });
    expect(detectAnomalies(f, new Map(), [{ ten: "Phở bò", doanhThu: 9_000_000 }]).some((a) => a.loai === "mon-tut-hang")).toBe(false);
  });
});

describe("verifyNumbers", () => {
  const f = buildWeeklyFacts(duLieu());

  it("số bịa → phát hiện", () => {
    expect(verifyNumbers("Doanh thu tuần này 9.500.000đ.", f).ok).toBe(false);
    expect(verifyNumbers("Doanh thu tăng 45% so với tuần trước.", f).ok).toBe(false);
    expect(verifyNumbers("Khoảng 99 triệu.", f).ok).toBe(false);
    expect(verifyNumbers("Ngày 30/08 bán tốt.", f).ok).toBe(false);
  });

  it("làm tròn theo quy tắc: 'khoảng 8 triệu', '14%', '14,3%', ngày 26/9", () => {
    expect(verifyNumbers("Doanh thu khoảng 8 triệu, tăng 14% (14,3%) so với tuần trước; Thứ Bảy 26/9 cao nhất.", f)).toEqual({
      ok: true,
      sai: [],
    });
    expect(verifyNumbers("Tuần này 8.000.000đ, 140 hóa đơn, đông nhất 12 giờ.", f).ok).toBe(true);
  });

  it("'khoảng 12 triệu' khớp 12.350.000 (lệch ≤ 5%); 'khoảng 13 triệu' thì không", () => {
    const g = { doanhThu: 12_350_000 };
    expect(verifyNumbers("khoảng 12 triệu", g).ok).toBe(true);
    expect(verifyNumbers("khoảng 13 triệu", g).ok).toBe(false);
  });

  it("số nằm trong tên món ('Combo 2 người') không bị coi là số liệu", () => {
    expect(verifyNumbers("Món Combo 2 người bán 10 phần.", f).ok).toBe(true);
  });
});

describe("templateInsight", () => {
  it("mọi con số lấy từ facts / bất thường (qua được verifyNumbers), có gợi ý, ≤ 200 chữ", () => {
    const f = buildWeeklyFacts(duLieu({ huy: { tuanNay: 800_000, tuanTruoc: 30_000 } }));
    const bt = detectAnomalies(f, new Map(duLieu().ngay.map((x) => [x.ngay, x.doanhThu])), [{ ten: "Bún chả", doanhThu: 9_000_000 }]);
    const body = templateInsight(f, bt);
    expect(verifyNumbers(body, f, bt)).toEqual({ ok: true, sai: [] });
    expect(body).toContain("Gợi ý:");
    expect(demChu(body)).toBeLessThanOrEqual(200);
  });
});

describe("writeInsight — chuỗi nguồn miễn phí", () => {
  const f = buildWeeklyFacts(duLieu());
  const nguon = (ten: Nguon["ten"], goi: Nguon["goi"]): Nguon => ({ ten, model: "m", goi });

  it("bên 1 trả 429 → gọi bên 2; bên 2 trả lời đúng số → dùng bên 2", async () => {
    const hai = vi.fn(async () => ({ text: "Doanh thu khoảng 8 triệu, tăng 14% so với tuần trước.\nGợi ý:\n- Giữ nhịp.", tokensIn: 10, tokensOut: 5 }));
    const r = await writeInsight(f, [], [
      nguon("gemini", async () => {
        throw new Error("HTTP 429 (hết hạn mức)");
      }),
      nguon("groq", hai),
    ]);
    expect(hai).toHaveBeenCalledOnce();
    expect(r.model).toBe("groq:m");
    expect(r.fallbacks).toEqual([{ nguon: "gemini:m", lyDo: "HTTP 429 (hết hạn mức)" }]);
  });

  it("bên nào bịa số → bỏ, sang bên sau; cả ba lỗi → mẫu câu cố định, không ném lỗi", async () => {
    const r = await writeInsight(f, [], [
      nguon("gemini", async () => ({ text: "Doanh thu 99 triệu." })),
      nguon("groq", async () => {
        throw new Error("HTTP 500");
      }),
      nguon("cloudflare", async () => ({ text: "" })),
    ]);
    expect(r.model).toBe("mau-cau");
    expect(r.fallbacks.map((x) => x.nguon)).toEqual(["gemini:m", "groq:m", "cloudflare:m"]);
    expect(verifyNumbers(r.body, f).ok).toBe(true);
  });

  it("không có khóa → chuỗi rỗng → mẫu câu; có khóa → đúng thứ tự Gemini → Groq → Cloudflare", async () => {
    expect(nhaCungCapTuEnv({})).toEqual([]);
    expect(
      nhaCungCapTuEnv({ CF_ACCOUNT_ID: "a", CF_API_TOKEN: "b", GROQ_API_KEY: "g", GEMINI_API_KEY: "k" }).map((n) => n.ten)
    ).toEqual(["gemini", "groq", "cloudflare"]);
    expect((await writeInsight(f, [], [])).model).toBe("mau-cau");
  });

  it("gọi HTTP đúng dạng: Gemini 429 → Groq (fetch giả)", async () => {
    const goi: string[] = [];
    const fetchGia = (async (url: string) => {
      goi.push(String(url));
      if (String(url).includes("generativelanguage")) return new Response("quota", { status: 429 });
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "Tuần này 8.000.000đ.\nGợi ý:\n- Giữ nhịp." } }],
          usage: { prompt_tokens: 100, completion_tokens: 20 },
        }),
        { status: 200 }
      );
    }) as unknown as typeof fetch;
    const r = await writeInsight(f, [], nhaCungCapTuEnv({ GEMINI_API_KEY: "k", GROQ_API_KEY: "g" }), { fetch: fetchGia });
    expect(goi[0]).toContain("generativelanguage.googleapis.com");
    expect(goi[1]).toContain("api.groq.com");
    expect(r).toMatchObject({ model: "groq:llama-3.3-70b-versatile", tokensIn: 100, tokensOut: 20 });
    expect(r.fallbacks[0].lyDo).toContain("429");
  });
});

describe("chonQuanDem — lịch rải", () => {
  it("mỗi quán đúng một lần trong tuần, mỗi đêm ≤ ngưỡng", () => {
    const ds = Array.from({ length: 45 }, (_, i) => `t${String(i).padStart(2, "0")}`);
    const daCo = new Set<string>();
    const lanGoi = new Map<string, number>();
    for (let dem = 0; dem < 7; dem++) {
      const chon = chonQuanDem(ds, daCo, 8);
      expect(chon.length).toBeLessThanOrEqual(8);
      for (const id of chon) {
        daCo.add(id);
        lanGoi.set(id, (lanGoi.get(id) ?? 0) + 1);
      }
    }
    expect(lanGoi.size).toBe(45);
    expect([...lanGoi.values()].every((n) => n === 1)).toBe(true);
  });
});
