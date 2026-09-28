/**
 * Viết nhận xét tuần bằng mô hình ngôn ngữ MIỄN PHÍ (P18 18-03, AI-04, QD-025 D7–D10).
 *
 * Chuỗi dự phòng: Gemini Flash-Lite → Groq → Cloudflare Workers AI → mẫu câu cố định. Bên nào lỗi / hết hạn mức (429) /
 * viết quá dài / có số không khớp dữ liệu → sang bên kế tiếp. Hết cả → `templateInsight`, job vẫn thành công.
 * Tên nhà cung cấp + mã mô hình lấy từ biến môi trường của job (D9) — mô hình miễn phí bị rút thì đổi không sửa code.
 * Khóa API CHỈ ở GitHub Actions secrets; không bao giờ ghi ra log.
 */
import { templateInsight } from "./template.mjs";
import { demChu, verifyNumbers } from "./verify.mjs";

export const CHU_TOI_DA = 230; // 200 chữ đoạn văn + phần gợi ý ngắn

const HUONG_DAN = [
  "Bạn là trợ lý phân tích số liệu cho CHỦ QUÁN ĂN ở Việt Nam. Viết tiếng Việt có dấu, giọng ngắn gọn, thân thiện, dễ hiểu.",
  "Viết MỘT đoạn nhận xét tối đa 150 chữ về tuần vừa qua, rồi dòng 'Gợi ý:' và 1–3 gợi ý hành động, mỗi gợi ý một dòng bắt đầu bằng '- '.",
  "CHỈ dùng con số có trong DỮ LIỆU. Được làm tròn (vd 'khoảng 12 triệu', '12%'). KHÔNG tự tính số mới, KHÔNG bịa số.",
  "Các 'batThuong' do hệ thống phát hiện — hãy nhắc tới chúng. KHÔNG đoán nguyên nhân nằm ngoài dữ liệu (thời tiết, đối thủ, ngày lễ, nhân viên…).",
  "Không dùng markdown, không tiêu đề, không lời chào.",
].join("\n");

/**
 * @typedef {{ ten: "gemini" | "groq" | "cloudflare", model: string, goi: (he: string, nguoi: string, f: typeof fetch) => Promise<{ text: string, tokensIn?: number, tokensOut?: number }> }} NhaCungCap
 */

/** @param {Response} r */
async function docLoi(r) {
  const t = await r.text().catch(() => "");
  return new Error(`HTTP ${r.status}${r.status === 429 ? " (hết hạn mức)" : ""}: ${t.slice(0, 160)}`);
}

/**
 * Dựng chuỗi nhà cung cấp từ biến môi trường. Bên nào thiếu khóa thì không có mặt.
 * @param {Record<string, string | undefined>} env
 * @returns {NhaCungCap[]}
 */
export function nhaCungCapTuEnv(env) {
  /** @type {NhaCungCap[]} */
  const ds = [];
  if (env.GEMINI_API_KEY) {
    const model = env.GEMINI_MODEL || "gemini-2.5-flash-lite";
    ds.push({
      ten: "gemini",
      model,
      goi: async (he, nguoi, f) => {
        const r = await f(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY ?? "" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: he }] },
            contents: [{ role: "user", parts: [{ text: nguoi }] }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 700 },
          }),
          signal: AbortSignal.timeout(45_000),
        });
        if (!r.ok) throw await docLoi(r);
        const j = await r.json();
        return {
          text: (j.candidates?.[0]?.content?.parts ?? []).map((/** @type {{text?: string}} */ p) => p.text ?? "").join(""),
          tokensIn: j.usageMetadata?.promptTokenCount,
          tokensOut: j.usageMetadata?.candidatesTokenCount,
        };
      },
    });
  }
  if (env.GROQ_API_KEY) {
    const model = env.GROQ_MODEL || "llama-3.3-70b-versatile";
    ds.push({
      ten: "groq",
      model,
      goi: async (he, nguoi, f) => {
        const r = await f("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.GROQ_API_KEY}` },
          body: JSON.stringify({
            model,
            temperature: 0.3,
            max_tokens: 700,
            messages: [
              { role: "system", content: he },
              { role: "user", content: nguoi },
            ],
          }),
          signal: AbortSignal.timeout(45_000),
        });
        if (!r.ok) throw await docLoi(r);
        const j = await r.json();
        return { text: j.choices?.[0]?.message?.content ?? "", tokensIn: j.usage?.prompt_tokens, tokensOut: j.usage?.completion_tokens };
      },
    });
  }
  if (env.CF_ACCOUNT_ID && env.CF_API_TOKEN) {
    const model = env.CF_MODEL || "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
    ds.push({
      ten: "cloudflare",
      model,
      goi: async (he, nguoi, f) => {
        const r = await f(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/ai/run/${model}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.CF_API_TOKEN}` },
          body: JSON.stringify({
            max_tokens: 700,
            messages: [
              { role: "system", content: he },
              { role: "user", content: nguoi },
            ],
          }),
          signal: AbortSignal.timeout(60_000),
        });
        if (!r.ok) throw await docLoi(r);
        const j = await r.json();
        return { text: j.result?.response ?? "", tokensIn: j.result?.usage?.prompt_tokens, tokensOut: j.result?.usage?.completion_tokens };
      },
    });
  }
  return ds;
}

/**
 * @param {Record<string, unknown>} facts
 * @param {Record<string, unknown>[]} batThuong
 * @param {NhaCungCap[]} nhaCungCap
 * @param {{ fetch?: typeof fetch }} [opts]
 * @returns {Promise<{ body: string, model: string, fallbacks: { nguon: string, lyDo: string }[], tokensIn: number | null, tokensOut: number | null }>}
 */
export async function writeInsight(facts, batThuong, nhaCungCap, opts = {}) {
  const f = opts.fetch ?? fetch;
  const nguoi = `DỮ LIỆU:\n${JSON.stringify({ ...facts, batThuong })}`;
  /** @type {{ nguon: string, lyDo: string }[]} */
  const fallbacks = [];
  for (const n of nhaCungCap) {
    const nguon = `${n.ten}:${n.model}`;
    try {
      const r = await n.goi(HUONG_DAN, nguoi, f);
      const text = r.text.trim();
      if (!text) {
        fallbacks.push({ nguon, lyDo: "rỗng" });
        continue;
      }
      if (demChu(text) > CHU_TOI_DA) {
        fallbacks.push({ nguon, lyDo: `quá dài (${demChu(text)} chữ)` });
        continue;
      }
      const kiem = verifyNumbers(text, facts, batThuong);
      if (!kiem.ok) {
        fallbacks.push({ nguon, lyDo: `số không khớp dữ liệu: ${kiem.sai.slice(0, 5).join(", ")}` });
        continue;
      }
      return { body: text, model: nguon, fallbacks, tokensIn: r.tokensIn ?? null, tokensOut: r.tokensOut ?? null };
    } catch (e) {
      fallbacks.push({ nguon, lyDo: e instanceof Error ? e.message.slice(0, 200) : "lỗi" });
    }
  }
  return {
    body: templateInsight(/** @type {any} */ (facts), /** @type {any} */ (batThuong)),
    model: "mau-cau",
    fallbacks,
    tokensIn: null,
    tokensOut: null,
  };
}
