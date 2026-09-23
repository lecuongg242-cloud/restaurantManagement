# 07-01 SUMMARY — Ma trận RLS phủ 18 bảng

> Thực hiện 23/09/2026. Yêu cầu: TENANT-05. Kế hoạch: `07-01-PLAN.md`.
> **Chạy trên DB production** (chủ dự án chốt), có rào cứng không chạm quán đang hoạt động.

## Tệp đã đổi

| Tệp | Việc |
|---|---|
| `tests/rls/fixtures.ts` (mới) | Dựng/dọn fixture 18 bảng × 2 tenant, UUID cố định, idempotent |
| `tests/rls/fixtures.test.ts` (mới) | 3 test — fixture dựng đủ, dọn sạch, chạy lại được |
| `tests/rls/matrix.test.ts` (mới) | 127 test — 7 phép × 18 bảng + 1 test đếm |
| `tests/rls/setup.ts` | Thêm `tenantIdBySlug()` |
| `package.json` | `test:rls` chạy `--no-file-parallelism` |
| `.github/workflows/ci.yml` | Cổng: `exit 1` nếu số test RLS < 120 |
| `.gitignore` | `rls-report.json` |

## Kết quả

```
npm run test:rls   →  Test Files 5 passed (5)   Tests 148 passed (148)
```

(148 gồm cả printer-account của 07-02 và suspend của 07-03 làm sau đó.)

**Lỗ rò tìm được: 0.** Policy RLS vốn đã đúng trên cả 18 bảng, ở cả 7 phép. Giá trị của phần việc
này không phải "đã vá lỗ hổng" mà là **từ nay giữ cho nó đúng** — và nó đã lập tức phát huy tác
dụng ở 07-03, nơi `auth_tenant_ids()` bị viết lại.

## Đối chứng âm — có làm, nhưng KHÁC kế hoạch

Kế hoạch ghi: gỡ policy `print_jobs_tenant_all` rồi chạy lại. **Không làm vậy.** DB này dùng chung
với qt-food đang hoạt động thật (5.843 đơn, đơn gần nhất 22/09); trong khoảng thời gian gỡ policy,
phiếu in của mọi quán lộ cho mọi tài khoản, và nếu tiến trình chết giữa chừng thì policy nằm đó.

Thay bằng **bảng canary dùng một lần**: `rls_matrix_canary` có `tenant_id`, RLS bật, policy cố ý
sai `using (true) with check (true)`, thêm tạm vào `CASES` + fixture.

```
× 'rls_matrix_canary' — A đọc dữ liệu của B → 0 dòng
  AssertionError: RÒ RỈ: A đọc được rls_matrix_canary của B: expected [ Array(1) ] to have a length of +0 but got 1
× 'rls_matrix_canary' — B đọc dữ liệu của A → 0 dòng (chiều ngược lại)
× 'rls_matrix_canary' — A trỏ thẳng id của B vẫn không ra dòng nào
      Tests  3 failed | 74 passed (77)
```

Sau đó: canary bị `drop table`, file test khôi phục về bản gốc (`git diff` rỗng), và
`select count(*) from pg_policies where tablename='print_jobs'` = **1** — policy thật chưa bao giờ
bị đụng tới.

Ma trận **có** bắt được policy sai. Đó là điều cần chứng minh.

## Phép `insert` xanh vì đúng lý do

Một phép insert bị từ chối có thể vì RLS, mà cũng có thể vì vi phạm khóa ngoại — hai thứ đó test
không phân biệt được. Kiểm riêng mã lỗi:

```
PROBE menu_categories code=42501 msg=new row violates row-level security policy
PROBE orders          code=42501 msg=new row violates row-level security policy
PROBE print_jobs      code=42501 msg=new row violates row-level security policy
```

`42501` = RLS từ chối. Đúng thứ cần đo.

## Lỗi tự gây ra và đã sửa

Chạy cả thư mục `tests/rls` lần đầu: **37 test đỏ**. Nguyên nhân: vitest chạy các file song song,
`cleanupFixtures()` trong `afterAll` của file này xóa fixture khi file kia còn đang chạy. Các bộ
test dùng chung một DB thật và cùng bộ UUID cố định thì không thể chạy song song. Sửa bằng
`--no-file-parallelism` trong `test:rls`. Điều này còn quan trọng hơn ở 07-03, nơi test tạm ngưng
cả một tenant.

## Rào an toàn đã cài

`seedFixtures()` từ chối chạy nếu slug không nằm trong danh sách tenant demo
(`pho-viet`, `bun-bo`). Chạm nhầm quán thật là ghi/xóa dữ liệu kinh doanh của họ.

## Cam kết vs thực tế

| Cam kết trong PLAN | Trạng thái |
|---|---|
| Ma trận phủ 18 bảng × 7 phép | ✅ 127 test |
| Fixture idempotent, dọn sạch | ✅ 3 test; `name like 'RLS-MATRIX-%'` = 0 sau khi chạy |
| Không dùng service-role để khẳng định quyền | ✅ chỉ dựng/dọn fixture và đối chiếu |
| Đối chứng âm | ✅ **bằng bảng canary**, không gỡ policy thật (lý do ở trên) |
| Cổng CI chặn khi bộ test không chạy | ✅ `numTotalTests < 120` → `exit 1` |
| `tsc` + `lint` sạch | ✅ |
