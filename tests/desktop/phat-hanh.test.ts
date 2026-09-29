import { describe, it, expect, vi, afterEach } from "vitest";
import { docLatestYml, goiPhatHanh, TEP_HOP_LE } from "@/lib/desktop/phat-hanh";
import { docNguonCauIn, nguonCauIn } from "@/lib/print/nguon-cau-in";
import { GET as capNhat } from "@/app/api/desktop/update/[file]/route";

/** DESK-05/10/11 — nguồn cầu in, đọc latest.yml, và chuyển tiếp nguồn cập nhật chỉ tới đúng tệp phát hành. */

afterEach(() => vi.unstubAllEnvs());

const LATEST = `version: 1.0.1
files:
  - url: TechMenu-ThuNgan-Setup-1.0.1.exe
    sha512: abc==
    size: 91234567
path: TechMenu-ThuNgan-Setup-1.0.1.exe
sha512: abc==
releaseDate: '2026-09-29T03:00:00.000Z'
`;

describe("latest.yml", () => {
  it("đọc phiên bản, tên tệp, kích thước", () => {
    expect(docLatestYml(LATEST)).toEqual({ phienBan: "1.0.1", tenTep: "TechMenu-ThuNgan-Setup-1.0.1.exe", kichThuoc: 91234567 });
  });
  it("tên tệp lạ / thiếu phiên bản → null", () => {
    expect(docLatestYml(LATEST.replace(/^path: .*$/m, "path: ../../evil.exe"))).toBeNull();
    expect(docLatestYml("path: TechMenu-ThuNgan-Setup-1.0.1.exe")).toBeNull();
  });
});

describe("nơi phát hành", () => {
  it("chỉ nhận https; không cấu hình → null", () => {
    vi.stubEnv("DESKTOP_RELEASE_BASE", "https://github.com/x/y/releases/latest/download/");
    expect(goiPhatHanh()).toBe("https://github.com/x/y/releases/latest/download");
    vi.stubEnv("DESKTOP_RELEASE_BASE", "http://insecure.test");
    expect(goiPhatHanh()).toBeNull();
    vi.stubEnv("DESKTOP_RELEASE_BASE", "");
    expect(goiPhatHanh()).toBeNull();
  });

  it("chỉ đúng tệp electron-builder sinh ra", () => {
    for (const t of ["latest.yml", "TechMenu-ThuNgan-Setup-1.2.3.exe", "TechMenu-ThuNgan-Setup-1.2.3.exe.blockmap"]) expect(TEP_HOP_LE.test(t)).toBe(true);
    for (const t of ["../x", "evil.exe", "latest.yml/../x", "TechMenu-ThuNgan-Setup-1.exe"]) expect(TEP_HOP_LE.test(t)).toBe(false);
  });
});

describe("GET /api/desktop/update/[file]", () => {
  const goi = (file: string) => capNhat(new Request("https://app.test/"), { params: Promise.resolve({ file }) });

  it("tệp hợp lệ → 302 tới nơi phát hành", async () => {
    vi.stubEnv("DESKTOP_RELEASE_BASE", "https://github.com/x/y/releases/latest/download");
    const r = await goi("latest.yml");
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toBe("https://github.com/x/y/releases/latest/download/latest.yml");
  });

  it("tệp lạ hoặc chưa cấu hình → 404 (không thành chỗ chuyển hướng tùy ý)", async () => {
    vi.stubEnv("DESKTOP_RELEASE_BASE", "https://github.com/x/y/releases/latest/download");
    expect((await goi("..%2F..%2Fevil")).status).toBe(404);
    vi.stubEnv("DESKTOP_RELEASE_BASE", "");
    expect((await goi("latest.yml")).status).toBe(404);
  });
});

describe("nguồn cầu in", () => {
  it("app/<phiên bản> → TechMenu Thu ngân; trống → cầu in cũ", () => {
    expect(nguonCauIn("app/1.0.0")).toBe("TechMenu Thu ngân 1.0.0");
    expect(nguonCauIn(null)).toBe("Cầu in cũ (CAI-DAT.bat)");
    expect(nguonCauIn("app/<script>")).toBe("Cầu in cũ (CAI-DAT.bat)");
  });

  it("máy chủ chưa có cột agent (lỗi truy vấn) → null, màn vẫn chạy", async () => {
    expect(await docNguonCauIn(Promise.resolve({ data: null, error: { message: "column agent does not exist" } }))).toBeNull();
    const m = await docNguonCauIn(Promise.resolve({ data: [{ tenant_id: "t", agent: "app/1.0.0" }], error: null }));
    expect(m?.get("t")).toBe("app/1.0.0");
  });
});
