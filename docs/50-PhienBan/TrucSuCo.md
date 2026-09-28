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

### 3. Dự báo + nhận xét hằng đêm (P18)

Workflow `.github/workflows/du-bao.yml` chạy 02:30 giờ VN, dùng lại secret **`BACKUP_DB_URL`** của sao lưu. Khóa AI là
**tùy chọn** (thiếu hết → nhận xét bằng mẫu câu cố định, job vẫn xanh). Tất cả đều gói **miễn phí** (QD-025 D7):

| Secret (GitHub → Settings → Secrets → Actions) | Lấy ở đâu |
|---|---|
| `GEMINI_API_KEY` | aistudio.google.com → *Get API key* (gói miễn phí — Google được dùng dữ liệu gửi lên; chỉ số tổng hợp, không PII) |
| `GROQ_API_KEY` | console.groq.com → *API Keys* |
| `CF_ACCOUNT_ID`, `CF_API_TOKEN` | Cloudflare → *Workers AI* → token quyền "Workers AI: Read" |

Đổi mô hình không sửa code: *Settings → Variables* đặt `GEMINI_MODEL` / `GROQ_MODEL` / `CF_MODEL`; `MAX_NHAN_XET_MOI_DEM`
(mặc định 20). Chạy tay: *Actions → Dự báo + nhận xét hằng đêm → Run workflow*, hoặc trên máy dev
`node scripts/du-bao-dem.mjs --quan <slug> --khong-ghi`. Log job ghi nguồn AI nào đã trả lời và các lần rơi xuống dự phòng;
cột `insights.model` / `insights.fallbacks` lưu lại để đo.

**Job đỏ (email GitHub):** màn quán vẫn hiện dự báo hôm trước kèm "bản cũ". Mở log job: dòng `LỖI <slug>` cho biết quán nào
— một quán lỗi không chặn quán khác.

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

**Quán báo "không in được phiếu bếp" (P17):**

1. **Kiểm cầu in trước**: `/r/<slug>/admin/printers` (hoặc bảng `/super`) — "Mất kết nối từ HH:mm" và dòng
   **"Mất kết nối gần nhất"** cho biết cầu in mất mạng lúc nào, bao lâu.
2. Cầu in mất kết nối → gần như luôn là **wifi / Internet quán** đứt hoặc máy quầy tắt. Hướng dẫn quán: dùng điện
   thoại 4G/5G để bán, quản lý bật phát wifi điện thoại (mạng dự phòng đã khai lúc cài) — `04-HuongDan-ThuNgan.md`
   mục *Khi quán mất mạng*. Quán chưa khai mạng dự phòng → chạy lại `CAI-DAT.bat`, bước 6b.
3. Cầu in sống mà vẫn không in → máy in (giấy, điện, dây LAN) — chip "Máy in bếp không phản hồi".

## C. Gia hạn thuê bao (SUB-04) — ghi nhận và sửa nhầm

**Ghi nhận:** tiền có nội dung `GIAHAN <MÃQUÁN> <số tháng>T` (vd `GIAHAN QTFOOD 12T`) về tài khoản nền tảng → `/super` → hàng quán đó → **Ghi nhận gia hạn** → số tháng, số tiền
(điền sẵn theo `PLATFORM_PRICE_*`), ghi chú (mã giao dịch ngân hàng) → **Ghi nhận**. Hạn mới = max(hôm nay, hạn cũ) +
số tháng; quán đang khóa mở lại ngay.

Ngoài "theo số tháng" còn hai kiểu: **Chọn ngày hết hạn** (hạn mới = đúng ngày chọn, chỉ kéo dài) và **Vĩnh viễn**
(quán thành không giới hạn, không cần gia hạn nữa — nhật ký ghi "Vĩnh viễn").

**Quán đang "không giới hạn"** (`paid_until` rỗng — qt-food, quán demo): nút từ chối trừ khi tích *"chuyển quán sang có
hạn"*. Đừng tích cho qt-food nếu chưa có thỏa thuận thu phí.

**Ghi nhận nhầm quán / nhầm số tháng:** nhật ký `subscription_payments` **chỉ thêm, không xóa, không có dòng tháng âm**.
1. `/super` → quán bị ghi nhầm → **Sửa hạn tay** → đặt lại đúng ngày cũ (xem cột "hạn trước" trong nhật ký; ngày cũ rỗng =
   để trống ô ngày = không giới hạn).
2. Ghi nhận lại cho đúng quán.
3. Lần ghi nhận kế tiếp của quán bị nhầm: ghi chú lý do (vd "sửa nhầm 27/09 — đã đặt lại hạn tay").
Hoàn tiền: làm ngoài hệ thống, ghi vào ghi chú lần gia hạn sau.

**Quán báo "Hết hạn sử dụng" mà đã chuyển tiền:** kiểm sao kê có `GIAHAN <MÃQUÁN>` → ghi nhận như trên. Cần mở gấp khi chưa đối
soát được: **Sửa hạn tay** lùi ra vài ngày, rồi ghi nhận khi tiền về.

**Bảng Cầu in** ghi *"quán đang khóa (hết hạn / tạm ngưng)"*: cầu in ngừng lấy phiếu là **đúng ý**, không phải sự cố.
