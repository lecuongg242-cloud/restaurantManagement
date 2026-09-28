# 13-01 — SUMMARY: VietQR — cấu hình tài khoản nhận + dựng mã

> **ĐÃ ĐÓNG 28/09/2026** — chủ dự án kiểm tra thật và chốt đóng P13.
>
> Trước đó: **CODE XONG, chờ nghiệm thu thật** (27/09/2026). Còn: quét bằng app ≥ 3 ngân hàng và chuyển thật 1 giao dịch
> nhỏ (nghiệm thu 2–3). Hai việc này cần điện thoại và tài khoản thật, chưa làm được trong phiên code.

## Tệp đã đổi

- `lib/payments/vietqr.ts` (mới) — `buildVietQrPayload`, `crc16`, `transferContent`, `khongDauInHoa`. Không phát tag 59 (tên):
  app ngân hàng tự tra tên chủ TK theo số TK.
- `lib/payments/banks.ts` (mới) — 64 ngân hàng/ví, chép từ `api.vietqr.io/v2/banks` ngày 27/09/2026.
- `lib/tenant/settings.ts` — `bank?: {bin, account_no, account_name}` + `print_qr_on_receipt` (mặc định `true`). `parseBank`
  bỏ CẢ khối nếu một trường sai.
- `app/r/[slug]/admin/(protected)/settings/actions.ts` — `updateBank` (chỉ owner, qua `requireSettingsManager`; báo lỗi cụ thể;
  để trống số TK = gỡ tài khoản). `page.tsx` — thẻ "Tài khoản nhận chuyển khoản".
- `tests/payments/vietqr.test.ts` (16 test), `tests/tenant/settings-bank.test.ts` (18 test).
- `PaymentDialog` **không đổi**.

## Chuỗi tham chiếu (khớp từng byte)

| Nguồn | Ca |
|---|---|
| `pkg.go.dev/github.com/subiz/vietqr` — ví dụ `Generate()` | Có số tiền, nội dung có khoảng trắng (VietinBank) |
| cùng nguồn, phần giải thích chuẩn | Mã tĩnh không số tiền (TPBank) · số TK 19 ký tự + nội dung đúng 25 ký tự (MB) |
| `pkg.go.dev/github.com/weirdobeardo48/vietqr` | HDBank 505.000đ, CRC `33C4` |

Bản chép chuỗi HDBank trên mạng rơi mất một số 0 ở tag 54. CRC `33C4` mà nguồn công bố khớp đúng với chuỗi đầy đủ do code
sinh ra, nên chuỗi đầy đủ mới là chuỗi gốc (có ghi trong test).

## Bằng chứng

```
npx vitest run tests/payments tests/tenant/settings-bank.test.ts   → 34 passed
npm run test     → Test Files 71 passed · Tests 765 passed
npx tsc --noEmit → sạch · npm run lint → No ESLint warnings or errors
```

Chạy thật (`next start` + Playwright trên quán demo pho-viet, đã khôi phục sau đó): nhập "0123 456 789" + "Nguyễn Văn Đức" →
DB lưu `{"bin":"970436","account_no":"0123456789","account_name":"NGUYEN VAN DUC"}`, `vat_pct` giữ nguyên. Ảnh:
`anh/01-cai-dat-tai-khoan.png`.

## Cam kết

| Nghiệm thu | Trạng thái |
|---|---|
| 1. test + tsc + lint | ☑ |
| 2. Quét 3 mã mẫu bằng app ≥ 3 ngân hàng | ☑ chủ dự án kiểm tra 28/09/2026 |
| 3. Chuyển thật 1 giao dịch nhỏ, sao kê khớp `transferContent` | ☑ chủ dự án kiểm tra 28/09/2026 |
