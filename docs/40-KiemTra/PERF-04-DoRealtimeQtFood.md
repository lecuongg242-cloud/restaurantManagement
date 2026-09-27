# PERF-04 — Đo chi phí `router.refresh()` trên production (qt-food)

> Đo 26/09/2026, **chỉ đọc** (phiên `default_transaction_read_only = on`), chỉ lấy số đếm — không đọc PII.
> Nguồn: bảng nghiệp vụ + `pg_stat_statements` (reset lúc 24/09 09:10 giờ VN).
> Trả lời câu hỏi bỏ ngỏ ở `30-KeHoach/P8/08-04-SUMMARY.md`: có cần viết lại realtime không.

## Quán qt-food trông thế nào

| | Số đo |
|---|---|
| Đơn/ngày (14 ngày) | 70–161, trung bình **~115** |
| Món/ngày | 83–200 |
| Bill/ngày | 63–155 |
| Giờ bán | **5h–10h sáng**, đỉnh **7h** (355 đơn / 7 ngày ≈ **51 đơn/giờ**) |
| Tài khoản | 1 owner, 1 cashier, 1 printer |

## Chi phí refresh đo được

Cửa sổ đo: từ 24/09 09:10 tới 26/09 ~11h → trọn **2 ca bán** (25/09: 96 đơn, 26/09: 129 đơn).

`getPosSnapshot` chạy 4 truy vấn chính song song; cả 4 cùng **1.337 lượt gọi** ⇒ **1.337 lần render `/pos`**.

| | Số đo |
|---|---|
| Render `/pos` / ngày | **~670** |
| Render `/pos` / đơn | **~6** |
| Thời gian DB mỗi render (4 truy vấn chính cộng lại) | **~21 ms** (9,6 + 8,1 + 1,8 + 1,5) |
| Tổng thời gian DB cho mọi render POS trong 2 ngày | **~28 giây** |
| Nhóm truy vấn thứ hai (hàng chờ online/KDS) | 582 lượt (~290/ngày) |
| Lượt realtime tra `pg_publication_tables` | 1.529 — **không phải số lần join**, xem §Điều tra |
| Lượt tạo đăng ký `postgres_changes` thật (`insert realtime.subscription`) | 424 / 60 giờ (~170/ngày) |

## Ngoại suy 100 quán cỡ qt-food

| | Giá trị |
|---|---|
| Render POS / ngày | ~67.000 → ~2 triệu lượt gọi function / tháng |
| Giờ đỉnh (100 quán trùng giờ) | ~300 render/giờ/quán × 100 ≈ **8 render/giây** |
| Tải DB giờ đỉnh | ~8 × ~11 truy vấn ≈ **~90 truy vấn/giây**, mỗi truy vấn 2–10 ms |

## Kết luận

1. **Ở quy mô quán cỡ qt-food, `router.refresh()` KHÔNG chặn đường 100 quán.** Tải DB rất nhỏ; chi phí
   chủ yếu là số lượt gọi Vercel. Đính chính nhận định trước đó ("thành chi phí chính") — số đo không
   ủng hộ nó.
2. Chi phí tăng theo **đơn × số màn POS/KDS đang mở**. qt-food chỉ có 1–2 màn. Quán lớn (4–6 màn, 400+
   đơn/ngày) sẽ gấp 10–20 lần mỗi quán → khi đó mới đáng viết lại (gửi dữ liệu thay đổi qua realtime
   thay vì render lại cả trang).
3. **Không có chuyện kênh realtime nối lại liên tục** — bản đầu của tài liệu này đọc nhầm số (xem §Điều tra).
4. Tài khoản `printer` có **42 phiên đăng nhập / 3 ngày** — cầu in đăng nhập lại mỗi khi token hết hạn
   (QD-012 §1, đúng thiết kế). Vô hại nhưng `auth.sessions` sẽ phình theo số quán; xem lại khi có
   ≥20 quán.

## Điều tra: "~760 lần nối lại/ngày" (26/09/2026)

Bản đầu coi mỗi lần chạy câu tra `pg_publication_tables` là một lần kênh join. **Sai.**

- Mã nguồn Supabase Realtime (`lib/extensions/postgres_cdc_rls/subscription_manager.ex`):
  `@check_oids_interval 60_000` — bộ quản lý đăng ký tự chạy câu này **mỗi 60 giây**, chừng nào còn
  thiết bị đang mở kênh `postgres_changes`. Nó là nhịp nền của server, không do client gây ra.
- 1.529 lượt ≈ 1.529 phút ≈ **25 giờ có màn POS/KDS mở trong 60 giờ** (~10 giờ/ngày) — khớp giờ bán
  5h–10h cộng thời gian mở máy trước/sau ca.
- Lượt join thật là câu `insert realtime.subscription`: **424 lượt / 60 giờ** (~170 đăng ký/ngày). Mỗi
  lần mở màn `/pos` tạo 8 đăng ký (`PosBoard` 6 bảng + `OnlineQueue` 1 + `ReservationList` 1), KDS tạo 2
  ⇒ cỡ **~20 lần mở/mount màn hình mỗi ngày** — bình thường (mở máy, chuyển trang, tablet thức dậy).
- Code client đúng: effect realtime ở `PosBoard`/`KdsBoard` phụ thuộc `[tenantId, router]`, cả hai ổn
  định giữa các lần `router.refresh()` ⇒ refresh **không** tạo lại kênh.

**Kết luận:** không có lỗi, không cần sửa code. Ở 100 quán, nhịp 60 giây này vẫn chỉ một bộ quản lý
cho cả project (không nhân theo quán). Thứ nhân theo quán là mỗi thay đổi dữ liệu bị kiểm RLS cho **từng**
thiết bị đang nghe — đã tính trong ước lượng ở trên.

## Giới hạn của phép đo

- Chỉ 2 ca bán, 1 quán nhỏ, bán buổi sáng. Quán ăn trưa/tối đông bàn cần đo lại.
- `pg_stat_statements` chỉ đo thời gian **trong Postgres** — không gồm PostgREST, mạng, và thời gian
  render của Vercel.
- Số màn đang mở không đọc được từ DB (POS đăng nhập bằng tài khoản owner, 6 phiên / 3 ngày).
