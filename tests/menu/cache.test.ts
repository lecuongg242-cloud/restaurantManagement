import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { menuTag } from "@/lib/menu/cache";

/**
 * PERF-02 — Cache thực đơn theo tenant.
 *
 * Rủi ro của việc cache KHÔNG phải hiệu năng mà là **dữ liệu cũ**: nhân viên bấm "hết món" mà
 * khách vẫn đặt được là hỏng nghiệp vụ (MENU-02, MENU-04) — tệ hơn nhiều so với chậm mà đúng.
 *
 * Nên lưới an toàn chính là test đọc mã nguồn dưới đây: MỌI hàm ghi thực đơn phải xóa cache.
 * Ai thêm hàm ghi mới mà quên thì test đỏ ngay, chứ không phải đợi khách phát hiện hộ.
 */

const FILE_MENU = "app/r/[slug]/admin/(protected)/menu/actions.ts";
const FILE_MODIFIERS = "app/r/[slug]/admin/(protected)/menu/modifiers/actions.ts";
const FILE_ONBOARDING = "app/r/[slug]/admin/(protected)/onboarding/actions.ts";

/** Tách từng `export async function` thành (tên, thân) để soi riêng. */
function cacHamXuat(path: string): { ten: string; than: string }[] {
  const src = fs.readFileSync(path, "utf8");
  const ra: { ten: string; than: string }[] = [];
  const re = /export async function (\w+)/g;
  const moc: { ten: string; tu: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) moc.push({ ten: m[1], tu: m.index });
  for (let i = 0; i < moc.length; i++) {
    const den = i + 1 < moc.length ? moc[i + 1].tu : src.length;
    ra.push({ ten: moc[i].ten, than: src.slice(moc[i].tu, den) });
  }
  return ra;
}

describe("menuTag", () => {
  it("gắn theo tenantId (không theo slug — slug đổi được, tenant_id thì không)", () => {
    expect(menuTag("abc-123")).toContain("abc-123");
    expect(menuTag("abc-123")).toBe(menuTag("abc-123"));
    expect(menuTag("abc-123")).not.toBe(menuTag("khac"));
  });
});

describe("mọi hàm ghi thực đơn đều xóa cache", () => {
  it.each([FILE_MENU, FILE_MODIFIERS])("mọi hàm xuất trong %s gọi revalidateMenu", (file) => {
    const thieu = cacHamXuat(file)
      .filter((h) => !h.than.includes("revalidateMenu"))
      .map((h) => h.ten);

    expect(
      thieu,
      `Các hàm sau ghi thực đơn nhưng KHÔNG xóa cache: ${thieu.join(", ")}. ` +
        `Thêm revalidateMenu(tenantId) vào chúng, nếu không khách sẽ thấy thực đơn cũ.`
    ).toEqual([]);
  });

  it("seedSampleMenu trong onboarding cũng xóa cache", () => {
    const seed = cacHamXuat(FILE_ONBOARDING).find((h) => h.ten === "seedSampleMenu");
    expect(seed, "không tìm thấy seedSampleMenu — đổi tên rồi?").toBeTruthy();
    expect(seed!.than).toContain("revalidateMenu");
  });

  it("phủ đủ 16 hàm ghi ở hai tệp thực đơn (đổi số này thì phải kiểm lại danh sách)", () => {
    expect(cacHamXuat(FILE_MENU).length + cacHamXuat(FILE_MODIFIERS).length).toBe(16);
  });
});
