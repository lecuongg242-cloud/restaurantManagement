# Trực sự cố — cài đặt theo dõi & cảnh báo đến thì làm gì

> Lập 26/09/2026 (P11 · 11-02 · OPS-10 · QD-019 D2, D3).

Hai lớp theo dõi:

| Lớp | Bắt được | Công cụ |
|---|---|---|
| Sống/chết | Vercel chết, database chết/treo, sai cấu hình, hết hạn mức | UptimeRobot gọi `/api/health` 5 phút/lần |
| Lỗi | Server action / route / trang ném lỗi mà app vẫn sống | Sentry (chỉ phía server) |

---

## A. Cài đặt một lần (chủ dự án)

### 1. UptimeRobot

1. Tạo tài khoản miễn phí, *Add New Monitor* → loại **HTTP(s)**.
2. URL: `https://restaurant-management-zeta.vercel.app/api/health` · chu kỳ **5 phút**.
3. *Alert contacts*: email (và Telegram nếu muốn nhận trên điện thoại).
4. Mong đợi: HTTP 200. Endpoint trả 503 khi database không trả lời trong 3 giây.

### 2. Sentry

1. Tạo tài khoản miễn phí → *Create Project* → nền tảng **Next.js**. Lấy **DSN**.
2. Vercel → *Settings → Environment Variables* (chỉ **Production**):
   - `NEXT_PUBLIC_SENTRY_DSN` = DSN ở trên.
   - (Tùy chọn, để stack trace dễ đọc) `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` — token là **bí mật**.
3. **Redeploy** (biến `NEXT_PUBLIC_*` nhúng lúc build).
4. Sentry → *Alerts*: tạo luật "một lỗi mới xuất hiện" → gửi email.

Sentry nhận được: đường dẫn (đã cắt query), thông điệp lỗi, stack, tag `tenant_slug`. **Không** nhận:
token bàn `?t=`, body request (tên/SĐT/địa chỉ khách), cookie, header xác thực — lọc ở
`lib/observability/scrub.ts`.

---

## B. Cảnh báo đến thì làm gì — theo thứ tự

**UptimeRobot báo `/api/health` chết:**

1. Mở `/api/health` bằng trình duyệt. Không vào được → Vercel có vấn đề: xem *Vercel → Deployments* (bản deploy gần nhất có đỏ?) và trang trạng thái của Vercel.
2. Trả `{"ok":false}` → database: xem Supabase Dashboard (project có bị tạm dừng / hết hạn mức?) và trang trạng thái của Supabase.
3. Vừa deploy xong thì hỏng → *Vercel → Deployments → bản trước → Promote/Rollback*. Rollback **không** lùi migration đã áp — xem migration của bản mới có đổi gì không tương thích ngược.
4. Báo các quán đang mở cửa: dùng giấy ghi đơn, thu tiền mặt, nhập lại khi hệ thống về.

**Sentry báo lỗi mới:**

1. Xem tag `tenant_slug`: một quán hay nhiều quán?
2. Lỗi ở đường tiền (thanh toán, đóng bill) → ưu tiên cao nhất, gọi quán xác nhận ngay.
3. Ghi vào `docs/40-KiemTra/BUG-*.md` nếu cần sửa code — cùng khuôn các BUG trước.
