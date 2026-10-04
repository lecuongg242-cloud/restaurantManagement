import { afterEach, describe, expect, it } from "vitest";
import { APP_ANDROID, docAppAndroid, docManifestAndroid, goiPhatHanhAndroid, TEP_HOP_LE_ANDROID } from "@/lib/android/phat-hanh";

/**
 * Bản phát hành app Android (P24 24-02, ANDR-01/04). App tự cập nhật theo `android-latest.json` ⇒ dữ liệu lạ tuyệt đối
 * không được lọt qua (tên tệp lạ = chuyển hướng tùy ý; thiếu sha256 = cài tệp không kiểm).
 */
const HOP_LE = {
  phienBan: "1.0.1",
  maPhienBan: 2,
  tenTep: "TechMenu-ThuNgan-1.0.1.apk",
  kichThuoc: 5_676_259,
  sha256: "a".repeat(64),
};

describe("docManifestAndroid", () => {
  it("đọc đúng manifest hợp lệ", () => {
    expect(docManifestAndroid(HOP_LE)).toEqual(HOP_LE);
  });

  it.each([
    ["thiếu sha256", { ...HOP_LE, sha256: undefined }],
    ["sha256 sai dạng", { ...HOP_LE, sha256: "XYZ" }],
    ["tên tệp lạ (chuyển hướng tùy ý)", { ...HOP_LE, tenTep: "../../evil.apk" }],
    ["tên tệp là manifest, không phải apk", { ...HOP_LE, tenTep: "android-latest.json" }],
    ["phiên bản sai dạng", { ...HOP_LE, phienBan: "1.0" }],
    ["mã phiên bản 0", { ...HOP_LE, maPhienBan: 0 }],
    ["mã phiên bản lẻ", { ...HOP_LE, maPhienBan: 1.5 }],
    ["kích thước âm", { ...HOP_LE, kichThuoc: -1 }],
  ])("bỏ manifest: %s", (_ten, raw) => {
    expect(docManifestAndroid(raw)).toBeNull();
  });

  it("không phải object ⇒ null", () => {
    expect(docManifestAndroid(null)).toBeNull();
    expect(docManifestAndroid("chuỗi")).toBeNull();
  });
});

describe("TEP_HOP_LE_ANDROID", () => {
  it("chỉ nhận đúng tệp do script phát hành sinh ra", () => {
    expect(TEP_HOP_LE_ANDROID.test("android-latest.json")).toBe(true);
    expect(TEP_HOP_LE_ANDROID.test("TechMenu-ThuNgan-1.2.3.apk")).toBe(true);
    expect(TEP_HOP_LE_ANDROID.test("TechMenu-ThuNgan-Setup-1.0.3.exe")).toBe(false);
    expect(TEP_HOP_LE_ANDROID.test("TechMenu-ThuNgan-1.2.3.apk?x=1")).toBe(false);
  });
});

describe("goiPhatHanhAndroid — nhãn cố định 'android', không phải 'latest' của bản Windows", () => {
  const cu = { a: process.env.ANDROID_RELEASE_BASE, d: process.env.DESKTOP_RELEASE_BASE };
  afterEach(() => {
    process.env.ANDROID_RELEASE_BASE = cu.a;
    process.env.DESKTOP_RELEASE_BASE = cu.d;
  });

  it("suy từ DESKTOP_RELEASE_BASE", () => {
    delete process.env.ANDROID_RELEASE_BASE;
    process.env.DESKTOP_RELEASE_BASE = "https://github.com/x/y/releases/latest/download";
    expect(goiPhatHanhAndroid()).toBe("https://github.com/x/y/releases/download/android");
  });

  it("ANDROID_RELEASE_BASE ghi đè", () => {
    process.env.ANDROID_RELEASE_BASE = "https://cdn.example.com/android/";
    expect(goiPhatHanhAndroid()).toBe("https://cdn.example.com/android");
  });

  it("không https ⇒ null", () => {
    process.env.ANDROID_RELEASE_BASE = "http://cdn.example.com/android";
    expect(goiPhatHanhAndroid()).toBeNull();
  });
});

/** P30 30-03 (MGR-07): APK thứ hai "TechMenu Quản lý" — cùng nơi phát hành, tệp chỉ mục + tên tệp riêng. */
describe("app Quản lý (?app=quan-ly)", () => {
  const QL = { ...HOP_LE, tenTep: "TechMenu-QuanLy-1.0.0.apk", phienBan: "1.0.0", maPhienBan: 1 };

  it("docAppAndroid: chỉ 'quan-ly' là app Quản lý, mọi giá trị khác = Thu ngân (giữ hành vi cũ)", () => {
    expect(docAppAndroid("quan-ly")).toBe("quan-ly");
    expect(docAppAndroid(null)).toBe("thu-ngan");
    expect(docAppAndroid("../x")).toBe("thu-ngan");
  });

  it("manifest Quản lý chỉ nhận tệp TechMenu-QuanLy-*.apk; manifest Thu ngân không nhận tệp Quản lý", () => {
    expect(docManifestAndroid(QL, "quan-ly")).toEqual(QL);
    expect(docManifestAndroid(QL)).toBeNull();
    expect(docManifestAndroid(HOP_LE, "quan-ly")).toBeNull();
  });

  it("TEP_HOP_LE_ANDROID nhận tệp chỉ mục + APK Quản lý", () => {
    expect(TEP_HOP_LE_ANDROID.test("android-quan-ly-latest.json")).toBe(true);
    expect(TEP_HOP_LE_ANDROID.test("TechMenu-QuanLy-1.2.3.apk")).toBe(true);
    expect(TEP_HOP_LE_ANDROID.test("TechMenu-QuanLy-1.2.apk")).toBe(false);
  });

  it("tên tệp chỉ mục theo app", () => {
    expect(APP_ANDROID["thu-ngan"].chiMuc).toBe("android-latest.json");
    expect(APP_ANDROID["quan-ly"].chiMuc).toBe("android-quan-ly-latest.json");
  });
});
