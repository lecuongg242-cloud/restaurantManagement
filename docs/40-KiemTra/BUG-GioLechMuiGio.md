# BUG — Giờ trên phiếu in lệch 7 tiếng

**Báo cáo:** 24/09/2026, người dùng qt-food: "số giờ order không khớp với giờ thực tế".
**Bằng chứng:** ảnh chụp hóa đơn #9 ghi `23:34 23/09/2026`, chụp vào buổi sáng 24/09.

## Nguyên nhân gốc

Ba trang in là **server component**, định dạng thời gian bằng:

```
new Date(iso).toLocaleString("vi-VN", { hour, minute, day, month, year })
```

`toLocaleString` không nêu `timeZone` thì lấy **múi giờ của máy đang chạy**. Vercel chạy ở UTC
→ in sớm đúng 7 tiếng. `23:34 23/09` chính là `06:34 24/09` giờ Việt Nam.

Dựng lại được bằng cách chạy cùng đoạn code dưới hai múi giờ:

| Môi trường | Kết quả cho `2026-09-24T06:34:00Z` |
|---|---|
| Máy dev (UTC+7) | `13:34 24/09/2026` — đúng |
| Vercel (UTC) | `06:34 24/09/2026` — sai 7 tiếng |

**Vì sao sống sót lâu:** máy dev ở UTC+7 nên mọi lần thử ở local đều cho kết quả đúng. Lỗi chỉ
xuất hiện trên máy chủ, đúng nơi không ai nhìn màn hình.

Đổi vùng compute sang `sin1` (UTC+8) **không phải** nguyên nhân — Vercel luôn đặt TZ=UTC bất kể
vùng. Lỗi đã có từ trước, không liên quan lần di trú Singapore.

## Phạm vi

| Nơi | Chạy ở đâu | Có sai không |
|---|---|---|
| 3 trang in (hóa đơn, phiếu bếp, phiếu khách) | máy chủ (UTC) | **Sai** — đây là lỗi được báo |
| 7 chỗ hiện giờ trên POS | trình duyệt nhân viên | Đúng hôm nay, nhưng phụ thuộc giờ máy |
| Báo cáo doanh thu | `lib/billing/report-range.ts` | Đúng — đã tính theo `VN_OFFSET_MS` |
| Cầu in (`scripts/print-bridge.mjs`) | máy ở quán | Đúng — đã nêu `timeZone` |

Cột dữ liệu trong DB **không sai**: `paid_at`, `created_at`, `confirmed_at` đều là `timestamptz`
lưu đúng thời điểm. Chỉ khâu hiển thị sai. **Không cần sửa dữ liệu cũ** — mọi hóa đơn đã in lại
sẽ hiện đúng giờ, và mọi báo cáo doanh thu từ trước tới nay vẫn chính xác.

## Cách sửa

`lib/time/vn.ts` — `gioVn` / `gioNgayVn` / `gioNgayNamVn`, nêu `timeZone: "Asia/Ho_Chi_Minh"` và tự
dựng chuỗi từ `formatToParts` (thứ tự do locale trả về là dữ liệu ICU, đổi theo phiên bản Node —
phiếu in thì phải ổn định). Cả 10 chỗ hiển thị giờ đều đi qua đây.

## Nghiệm thu

`tests/time/vn.test.ts` — 11 test, **ép `TZ=UTC`** để giả lập production. Chạy dưới múi giờ máy dev
thì code hỏng cũng cho kết quả đúng, test sẽ xanh giả.

- Một test **đối chứng** khẳng định cách viết CŨ cho ra `06:34` — nếu `TZ=UTC` không có hiệu lực
  thì test này đỏ và cả nhóm test còn lại bị coi là vô nghĩa.
- Một test **chốt chặn** quét toàn bộ `app/` + `components/`, đỏ nếu ai đó gọi lại `toLocale*` để
  hiện giờ. Đã kiểm chứng bằng cách chèn vi phạm giả — test đỏ đúng tên tệp.
