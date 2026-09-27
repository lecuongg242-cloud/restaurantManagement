# 11-01 SUMMARY — Sao lưu tự động mỗi đêm

> Thực hiện 26/09/2026. Yêu cầu: OPS-09. Quyết định: QD-019 D1.
> **Trạng thái: code xong, chờ chủ dự án tạo khóa + thêm secrets để chạy thật (nghiệm thu 1–4).**

## Tệp đã đổi

| Tệp | Việc |
|---|---|
| `.github/workflows/sao-luu.yml` (mới) | Lịch 02:00 VN + chạy tay; kiểm đủ secrets → `day-du` → tar → `age -r` → xóa bản chưa khóa → kiểm tệp là dữ liệu age → upload 90 ngày |
| `tests/ops/sao-luu-workflow.test.ts` (mới) | 7 test đọc workflow: lịch, lệnh, dừng khi thiếu secrets, chỉ upload `.age`, xóa bản chưa khóa **trước** upload, 90 ngày, không chứa khóa bí mật |
| `docs/50-PhienBan/KhoiPhucTuSaoLuu.md` (mới) | Cài đặt một lần (tạo khóa, secrets) + khôi phục từng bước |

`scripts/db-backup.mjs` **không sửa**: nó đọc `process.env`, `dotenv` không ghi đè biến đã có, và không có
`.env.local` trong CI cũng không lỗi — nên chỉ cần đặt env từ secrets.

## Bằng chứng

```
tests/ops/sao-luu-workflow.test.ts   7 passed
toàn bộ unit                        575 passed (49 tệp)
YAML (js-yaml)                      hợp lệ — on: schedule, workflow_dispatch; 9 bước
```

**Test phải đỏ được, và đỏ vì đúng lý do:**
- Trước khi có workflow → đỏ (không đọc được tệp).
- Đối chứng âm: đổi đường upload thành `.tar.gz` (chưa khóa) → test "chỉ upload tệp .age" **đỏ**; trả lại → xanh.
- Một lần đỏ vì **test sai** (regex `\S+` dừng ở dấu cách trong `${{ env.NGAY }}`) — sửa test, không sửa workflow.

## Chưa kiểm được (cần chủ dự án)

| Nghiệm thu | Chờ |
|---|---|
| 1. Chạy tay → xanh, artifact là tệp age | Khóa `age` + 4 secrets (hướng dẫn: `KhoiPhucTuSaoLuu.md` §A) |
| 2. Giải khóa → `kiem` ĐẠT, doanh thu khớp | Khóa bí mật (chỉ chủ dự án giữ) |
| 3. Secrets sai → đỏ + có email | Sau mục 1 |
| 4. Hai đêm liên tiếp → 2 artifact | Sau mục 1 |
| 5. Runbook làm theo được | Sau mục 2 |

## Ghi chú

- Runner GitHub (Mỹ) → DB Singapore: vài phút cho ~40MB; `timeout-minutes: 30`.
- Log CI chỉ có số dòng mỗi bảng và tên tệp ảnh lỗi (nếu có) — không có dữ liệu khách.
