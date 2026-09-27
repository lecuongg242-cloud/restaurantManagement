import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * OPS-09 / QD-019 D1 — lịch sao lưu hằng đêm trên GitHub Actions.
 *
 * Workflow không chạy được trong test, nên khóa những tính chất mà sai một dòng là lộ PII hoặc mất
 * sao lưu âm thầm: repo có thể public, artifact của repo public ai đăng nhập GitHub cũng tải được ⇒
 * thứ được upload PHẢI là tệp đã khóa `age`, và bản chưa khóa phải bị xóa trước bước upload.
 */
const tep = path.join(__dirname, "../../.github/workflows/sao-luu.yml");
const yml = fs.readFileSync(tep, "utf8");

/** Vị trí đầu tiên của một chuỗi, -1 nếu không có — để so thứ tự các bước. */
const viTri = (s: string) => yml.indexOf(s);

describe("workflow sao lưu hằng đêm", () => {
  it("chạy theo lịch 02:00 giờ VN và chạy tay được", () => {
    expect(yml).toMatch(/cron:\s*["']0 19 \* \* \*["']/);
    expect(yml).toContain("workflow_dispatch");
  });

  it("dùng đúng lệnh sao lưu đầy đủ có tự kiểm", () => {
    expect(yml).toMatch(/node scripts\/db-backup\.mjs day-du/);
  });

  it("dừng hẳn khi thiếu secrets thay vì bỏ qua trong im lặng", () => {
    expect(yml).toMatch(/exit 1/);
    for (const ten of ["BACKUP_DB_URL", "BACKUP_SUPABASE_URL", "BACKUP_SERVICE_ROLE_KEY", "BACKUP_AGE_RECIPIENT"]) {
      expect(yml).toContain(`secrets.${ten}`);
    }
  });

  it("khóa bằng age trước khi upload, và kiểm tệp ra đúng là dữ liệu age", () => {
    expect(yml).toMatch(/age -r "\$AGE_RECIPIENT"/);
    expect(yml).toContain("age-encryption.org/v1");
  });

  it("chỉ upload tệp .age, xóa bản chưa khóa trước bước upload", () => {
    const upload = viTri("actions/upload-artifact");
    const xoa = viTri("rm -rf sao-luu");
    expect(upload).toBeGreaterThan(-1);
    expect(xoa).toBeGreaterThan(-1);
    expect(xoa).toBeLessThan(upload);

    const khoiUpload = yml.slice(upload);
    const duongDan = khoiUpload.match(/path:\s*(.+)$/m)?.[1].trim() ?? "";
    expect(duongDan).toMatch(/\.age$/);
  });

  it("giữ 90 ngày và báo lỗi khi không có tệp", () => {
    expect(yml).toMatch(/retention-days:\s*90/);
    expect(yml).toMatch(/if-no-files-found:\s*error/);
  });

  it("không bao giờ chứa khóa bí mật age", () => {
    expect(yml).not.toMatch(/AGE-SECRET-KEY/);
    expect(yml).not.toMatch(/age\s+(-d|--decrypt)/);
  });
});
