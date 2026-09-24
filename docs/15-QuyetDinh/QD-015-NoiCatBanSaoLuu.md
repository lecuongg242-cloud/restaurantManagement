# QD-015 — Nơi cất bản sao lưu database

**Ngày:** 24/09/2026 · **Trạng thái:** ĐỀ XUẤT — chờ chủ dự án chốt

## Vì sao phải quyết

Ngày 24/09/2026 project Mỹ bị xóa. Khôi phục được **chỉ vì** tình cờ có một bản dump chạy tay vài
giờ trước. Gói free của Supabase không có sao lưu tự động hay point-in-time recovery.

Công cụ đã sẵn (09-02): `npm run db:backup:day-du <thư-mục>` = dữ liệu + ảnh + tự kiểm, một lệnh.
Còn thiếu **nơi cất** và **lịch chạy** — và đây là quyết định của chủ dự án, không phải kỹ thuật,
vì bản dump chứa **PII của khách**: tên, số điện thoại, địa chỉ giao hàng.

## Ràng buộc

- Gói free: **tối đa 2 project** — một là production, một là SG1 đang làm đường lui.
- Máy dev không có Docker.
- Dữ liệu nhỏ: 28 bảng, ~6.000 hóa đơn, 19 ảnh — vài MB.

## Các phương án

| | Phương án | Được | Mất |
|---|---|---|---|
| **A** | GitHub Actions chạy đêm → **mã hóa bằng khóa công khai** → lưu artifact (giữ 90 ngày) | Chạy khi không ai bật máy. CI chỉ giữ khóa công khai — **không giải mã được**, lộ CI cũng không lộ PII | Chủ dự án phải giữ khóa bí mật ở **hai nơi**. Mất khóa = mất mọi bản sao lưu |
| **B** | Máy chủ dự án, tác vụ Windows chạy đêm → ổ đĩa + thư mục đồng bộ đám mây | Kiểm soát cao nhất, không thêm dịch vụ nào | Máy tắt thì không sao lưu. `tuoi` sẽ báo, nhưng phải có người đọc |
| **C** | Đêm nào cũng nạp lại vào **SG1** | PII không rời Supabase. SG1 thành bản dự phòng **nóng** — và mỗi đêm là một lần diễn tập khôi phục | Cùng nhà cung cấp: mất tài khoản là mất cả hai. Không có lịch sử — dữ liệu hỏng hôm nay đè lên bản dự phòng đêm nay |

Lịch chạy mỗi phương án đều dùng chung một lệnh (`day-du`) và một phép kiểm tuổi (`tuoi`, quá 24 giờ
→ mã 1), nên đổi phương án sau này không phải viết lại gì.

## Đề xuất

**A + C.** A giữ **lịch sử** ngoài Supabase — thứ cứu được khi dữ liệu hỏng dần mà không ai để ý,
hoặc khi mất cả tài khoản. C cho **khôi phục trong vài phút** và biến mỗi đêm thành một lần diễn tập
có số đo — thứ mà "đã có bản sao lưu" không bao giờ chứng minh được.

Nếu chỉ chọn một: **A**. Nó là phương án duy nhất sống sót khi mất cả tài khoản Supabase.

## Cần chủ dự án chốt

1. Phương án (A, B, C, hay kết hợp).
2. Ngưỡng chịu mất: **24 giờ** (quán chốt sổ theo ngày) — đồng ý hay chặt hơn?
3. Nếu A: **ai giữ khóa bí mật, cất ở hai nơi nào.**

## Điều đã sửa trong plan 09-02

Plan ghi `session_replication_role` "nếu `finally` không chạy thì database ở lại trạng thái tắt kiểm
tra khóa ngoại". **Sai:** `set session_replication_role` (không có `alter database`/`alter role`) chỉ
sống trong phiên kết nối đó — đóng kết nối là hết. Không có trạng thái nào để kẹt lại.
