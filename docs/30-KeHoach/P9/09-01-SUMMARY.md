# 09-01 — Bịt khoảng cách local ↔ production · BÁO CÁO

> Yêu cầu: **OPS-08**. Xong 24/09/2026.

## Kết quả theo nghiệm thu

| # | Tiêu chí | Kết quả |
|---|---|---|
| 1 | `npm test` xanh dưới `TZ=UTC` | **434/434**. Không test cũ nào bị lộ phụ thuộc múi giờ — báo cáo đã tính giờ VN tường minh từ đầu |
| 2 | Khói trên production | **4/4 kiểm được đều đạt** trên qt-food; điều kiện 5 ghi rõ là không kiểm được |
| 3 | Đối chứng âm | Host bịa → đỏ đúng điều kiện 4; vùng `iad1` → đỏ đúng điều kiện 2; cả hai mã thoát 1 |
| 4 | Chạy lại bằng một lệnh | `npm run smoke:prod -- --slug qt-food` |

## Gọng 1 — bộ test chạy như máy chủ

`vitest.config.ts` đặt `env: { TZ: "UTC" }`. `tests/env/mui-gio.test.ts` **cố ý không tự đặt múi
giờ** — nó chứng minh cấu hình toàn cục có hiệu lực với mọi tệp, kể cả tệp viết sau này.

Trước khi đặt, test đó đỏ đúng như dự đoán:

```
expected -420 to be +0          ← máy dev UTC+7
expected '13:34' to be '06:34'  ← chính kiểu lỗi đã in lên hóa đơn
```

## Gọng 2 — khói hậu-deploy

`scripts/smoke-prod.mjs`, chạy trên production thật, qt-food, chỉ đọc:

```
[ĐẠT] 1. Trang menu trả 200 và có món từ database     HTTP 200, 63.191 byte
[ĐẠT] 2. Compute chạy ở vùng sin1                     X-Vercel-Id = hkg1::sin1::…
[ĐẠT] 3. Mọi ảnh trong trang tải được                 9/9 ảnh trả 200
[ĐẠT] 4. Không còn host Supabase lạ trong trang       chỉ có jgdvpglldnkgzycxstkm.supabase.co
[KHÔNG KIỂM ĐƯỢC] 5. Giờ hiển thị khớp giờ Việt Nam
```

Điều kiện 3 và 4 là **đúng lỗi ảnh vỡ ngày 24/09**. Nếu lệnh này đã có lúc đó, lỗi lộ ra trong một
lần gọi thay vì khi người dùng báo.

## Lệch khỏi plan

**Điều kiện 5 không kiểm được, và tôi không làm giả.** Plan đã lường trước: *"Nếu không có bề mặt
nào như vậy thì ghi rõ là không kiểm được, đừng bịa một phép thử luôn xanh."* Rà lại thì hóa đơn và
phiếu đều cần đăng nhập; không trang công khai nào hiện giờ. Lớp lỗi này được chặn ở gọng 1 và ở chốt
chặn `toLocale*` trong `tests/time/vn.test.ts`. Hàm `lechGiayVn` trong plan vì thế **không viết** —
không có chỗ nào dùng.

**Mặc định kiểm tenant demo `pho-viet`**, nhưng demo không có ảnh nào nên điều kiện 3 không chạy.
Ghi chú trong runbook: sau di trú chạy với `--slug qt-food`.

## Giới hạn còn lại

- Query ngẫu nhiên phá cache CDN, **không phá `unstable_cache`**. Trang trả 200 với dữ liệu đúng
  không chứng minh database đang sống — ngày 24/09 đã xảy ra đúng như vậy. Lệnh khói in lưu ý này
  ngay trong kết quả.
- Khói chạy **tay**. Tự chạy sau mỗi deploy được (GitHub Actions `on: deployment_status`) nhưng cần
  thêm một biến cấu hình trên GitHub — để lần sau, khi có nhu cầu.
