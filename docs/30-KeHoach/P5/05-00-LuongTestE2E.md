# P5 — Luồng test End-to-End (Frontend)

> Lập 22/07/2026. Phủ toàn chuỗi P5: **đặt bàn (khách gửi → duyệt → danh sách theo ngày)** ·
> **đặt món mang về/giao (khách đặt → nhận đơn → KDS → khách theo dõi realtime)** ·
> **thu tiền (bill mỗi đơn) → hoàn tất → in hóa đơn 80mm → doanh thu gồm cả online**.
> Nguồn: 3 plan `05-01`…`05-03` + `00-TongQuan.md` + `QD-008`. Dùng để test thủ công trên trình duyệt qua từng plan.
> **Trạng thái build:** ✅ đã xong · ⏳ chờ plan. Cập nhật mỗi khi 1 plan được nghiệm thu.

| Plan | Bề mặt | Trạng thái |
|---|---|---|
| 05-01 | Đặt bàn online + duyệt + danh sách theo ngày | ✅ **Đã build · approved** |
| 05-02 | Đặt món online: tạo đơn + nhận đơn + KDS + theo dõi | ✅ **Đã build · approved** |
| 05-03 | Thu tiền + hoàn tất + hóa đơn 80mm + doanh thu online | ✅ **Đã build** (chờ nghiệm thu) |

> **Logic đã test:** `tsc`/`lint` xanh cả 3 plan; migration `0014`+`0015` áp dev. Phần ghi DB (tạo/duyệt đặt bàn,
> tạo/nhận/sẵn sàng/thu tiền đơn online, đóng bill) nghiệm thu bằng luồng dưới đây trên trình duyệt.

---

## 0) Chuẩn bị chung

**Dev server:** `npm run dev` → `http://localhost:3000` (bận thì Next dùng `:3001` — đọc log).

**Tài khoản (seed):**
| Vai trò | Đăng nhập | Dùng cho |
|---|---|---|
| Owner Phở Việt | `ownerA@pho-viet.test` / `DemoPass123!` | /pos/reservations + /pos/online + /admin/reports (thu tiền online **không cần PIN**) |
| Station Phở Việt | `station@pho-viet.test` / `StationPass123!` | KDS (xem vé đơn online) |
| Owner Bún Bò | `ownerB@…` | Kiểm cách ly tenant (RLS) |

**Cần có trước khi test:**
- Menu Phở Việt có **≥3 món active** (P2) — để đặt online có món.
- `/r/pho-viet/admin/settings`: đặt **Phí phục vụ 5%**, **VAT 8%**, điền **Footer hóa đơn** (VD "Wifi: phovietsaigon") — để bill đơn online có phí/VAT + footer.
- (Tùy chọn) `/r/pho-viet/admin/tables`: khai báo **≥1 khu vực** (VD "Sân vườn") để form đặt bàn hiện chọn khu vực.

**URL chính:**
```
Đặt bàn (khách)      /r/pho-viet/reserve
Đặt món online (khách) /r/pho-viet/online
Theo dõi đơn (khách)  /r/pho-viet/order/<orderId>       (tự tới sau khi đặt)
Đặt bàn (POS)        /r/pho-viet/pos/reservations   (thu ngân/phục vụ/owner/manager)
Đơn online (POS)     /r/pho-viet/pos/online         (thu ngân/phục vụ/owner/manager)
Bếp                   /r/pho-viet/kds
In hóa đơn            /r/pho-viet/print/receipt/<billId>?w=80  (mở từ PaymentDialog)
Dashboard             /r/pho-viet/admin/reports
```

**Setup realtime:** mở **2 cửa sổ cạnh nhau** — 1 cửa sổ khách (ẩn danh) + 1 cửa sổ admin (đăng nhập owner) —
để thấy đơn/đặt bàn **pop không reload** (`postgres_changes`) và khách **đổi trạng thái** (Broadcast).

---

## 1) Sơ đồ luồng tổng

```
 ┌──────────── ĐẶT BÀN [✅05-01] ────────────┐        ┌──────────── ĐẶT MÓN ONLINE [✅05-02/03] ──────────┐
 │ Khách /reserve → gửi (tên,SĐT,số người,   │        │ Khách /online → chọn Mang về/Giao → giỏ →         │
 │  ngày giờ) ⇒ reservation 'pending'        │        │  Tên*/SĐT*(+Địa chỉ* nếu giao) ⇒ order            │
 │                                            │        │  'pending_confirm' (source=online, không bàn)     │
 │ Admin /reservations (theo NGÀY VN, ◀▶)     │        │                     │                              │
 │  Xác nhận → 'confirmed'                    │        │                     ▼ (Broadcast order:{id})      │
 │  Từ chối (lý do) → 'rejected'              │        │        Khách /order/<id> theo dõi 4 bước           │
 │  (khách được gọi điện xác nhận — thủ công) │        │        Chờ xác nhận → Đang chuẩn bị → Sẵn sàng →   │
 └────────────────────────────────────────────┘        │        Hoàn tất                                    │
                                                        │                     ▲                              │
   ★ Đặt bàn KHÔNG giữ bàn/mở phiên (QD-008 D-P5-2)     │  Admin /online (2 cột, realtime):                 │
     — khách tới, nhân viên xếp bàn thủ công qua QR.    │   • Chờ xác nhận: [Nhận đơn]→confirmed(+#bếp)      │
                                                        │                   [Từ chối]→cancelled(lý do)      │
                                                        │   • Đang xử lý:   [Đánh dấu sẵn sàng]→ready        │
                                                        │                   [Thu tiền & hoàn tất]→ (05-03)  │
                                                        │        │                                          │
                                                        │        ▼ (confirmed) → KDS hiện vé:                │
                                                        │   "Mang về" (cam) / "Giao" (xanh) + #số, không bàn│
                                                        └───────────────────────┬────────────────────────────┘
                                                                                ▼
                                             ┌──────────── THU TIỀN + HOÀN TẤT [✅05-03] ────────────┐
                                             │ /pos/online đơn 'ready' → "Thu tiền & hoàn tất"       │
                                             │  → PaymentDialog (Tổng = tạm tính + Phí 5% + VAT 8%)   │
                                             │  → Tiền mặt (thối) / Chuyển khoản (KHÔNG QR)           │
                                             │  → bill 'paid' (1 đơn = 1 bill, online_order_id)       │
                                             │  → đơn 'completed' + món 'served' ⇒ vé rời KDS         │
                                             │  → khách thấy "Hoàn tất" · "In hóa đơn" 80mm           │
                                             └───────────────────────┬────────────────────────────────┘
                                                                     ▼
                                             ┌──────────── DASHBOARD [✅04-05 + online] ──────────┐
                                             │ /admin/reports — doanh thu GỒM đơn online           │
                                             │  (bill paid, session null, split_count null)        │
                                             └──────────────────────────────────────────────────────┘
```

---

## 2) Máy trạng thái (tham chiếu)

**Đặt bàn (reservations):**
```
 (khách gửi) ─▶ pending ─┬─ "Xác nhận" ─▶ confirmed   (chỉ đổi được từ pending — chống double-decide)
                         └─ "Từ chối" (lý do) ─▶ rejected
```

**Đơn online (orders, channel≠dine_in):**
```
                 "Nhận đơn"(+#bếp)      "Đánh dấu sẵn sàng"     "Thu tiền & hoàn tất"(payBill)
 pending_confirm ───────────────▶ confirmed ──────────────▶ ready ──────────────────▶ completed
        │                          [lên KDS]                                          [bill paid, vé rời KDS]
        └─ "Từ chối"(lý do) ─▶ cancelled
```
- **confirmed → ready**: nhân viên bấm khi bếp làm xong (KDS chỉ để xem — không chạm).
- **ready → completed**: gắn với **thanh toán** (`payBill` đặt đơn completed + món served).
- Khách theo dõi map: pending_confirm=**Chờ xác nhận** · confirmed=**Đang chuẩn bị** · ready=**Sẵn sàng nhận/giao** · completed=**Hoàn tất** · cancelled=**Đã hủy** (+lý do).

---

## 3) LUỒNG 05-01 — Đặt bàn  ✅

**Cửa sổ A (khách, ẩn danh):** `/r/pho-viet/reserve`. **Cửa sổ B (owner):** `/r/pho-viet/pos/reservations`.

| # | Thao tác | Kỳ vọng |
|---|---|---|
| A1 | Điền Tên "Anh Nam", SĐT "0901234567", Số người **4**, Ngày giờ **ngày mai 19:00**, (Khu vực nếu có), Ghi chú → **"Gửi yêu cầu đặt bàn"** | Màn **cảm ơn** "Đã gửi yêu cầu đặt bàn — nhà hàng sẽ liên hệ xác nhận"; có nút "Đặt bàn khác". |
| A2 | Thử gửi với **ngày giờ quá khứ** | Bị chặn ("Vui lòng chọn thời điểm trong tương lai"). |
| A3 | Thử **bỏ trống SĐT** | Bị chặn (SĐT bắt buộc). |
| B1 | Mở /pos/reservations (mặc định **hôm nay**) → chuyển tới **ngày mai** bằng **▶** | Thấy đơn "Anh Nam · 4 người · 19:00"; badge **"1 chờ duyệt"**. |
| B2 | Bấm số điện thoại | Là link `tel:` (gọi được trên máy có SIM). |
| B3 | **"Xác nhận"** đơn | Badge trạng thái đổi **"Đã xác nhận"** (xanh); đếm "1 xác nhận". |
| B4 | Tạo đơn thứ 2 (A1 lại) → ở admin bấm **"Từ chối"** → nhập lý do "Hết bàn khung giờ này" → xác nhận | Đơn chuyển **"Đã từ chối"** + hiện dòng "Lý do từ chối: …". |
| B5 | Từ chối **không nhập lý do** | Nút bị chặn / báo cần lý do. |
| B6 | **◀ ▶** đổi ngày; bấm **"Hôm nay"** | Danh sách gom **đúng theo ngày VN**; nút "Hôm nay" ẩn khi đang ở hôm nay. |
| B7 | **Realtime**: để /pos/reservations mở ở ngày mai → cửa sổ khách gửi 1 đơn ngày mai | Đơn **pop** vào danh sách (không reload). |
| B8 | **RLS**: đăng nhập owner **Bún Bò** `/r/bun-bo/pos/reservations` | KHÔNG thấy đơn Phở Việt. |

### 3b. Nhân viên đặt bàn hộ khách (qua điện thoại) — trên POS
Thu ngân/phục vụ nhận điện thoại khách đặt bàn → tạo thẳng **'confirmed'** (không cần duyệt lại).

| # | Thao tác (đăng nhập **station** + PIN nhân viên, hoặc owner) | Kỳ vọng |
|---|---|---|
| S1 | `/r/pho-viet/pos` → toolbar trên cùng bấm **"Đặt bàn cho khách"** | Mở dialog đặt bàn (tên, SĐT, số người, khu vực nếu có, ngày giờ, ghi chú). |
| S2 | Điền hợp lệ (ngày giờ tương lai) → **"Xác nhận đặt bàn"** | Báo "Đã ghi đặt bàn (đã xác nhận)". |
| S3 | Owner mở `/pos/reservations` đúng ngày | Đơn hiện với badge **"Đã xác nhận"** ngay (KHÔNG ở "chờ duyệt"); không cần bấm duyệt. |
| S4 | Thử ngày quá khứ / bỏ trống SĐT | Bị chặn (validate như form khách). |
| S5 | RLS: chỉ nhân viên có quyền POS mới thao tác; đơn thuộc đúng tenant. | — |

> Ghi chú: nút này chạy được với **thu ngân/phục vụ** (đã có quyền POS) — không cần vào khu admin. Đặt bàn vẫn **không giữ bàn/mở phiên** (QD-008 D-P5-2); khi khách tới, xếp bàn thủ công qua QR/POS.

---

## 4) LUỒNG 05-02 — Đặt món online: tạo + nhận + bếp + theo dõi  ✅

**Cửa sổ A (khách):** `/r/pho-viet/online`. **Cửa sổ B (owner):** `/r/pho-viet/pos/online`. **Cửa sổ C (station):** `/r/pho-viet/kds`.

### 4a. Khách đặt — Mang về
| # | Thao tác | Kỳ vọng |
|---|---|---|
| A1 | Header hiện "Đặt mang về / giao"; chọn **2 món** (có tùy chọn) → mở **giỏ** | Giỏ hiện đủ món + tạm tính; toggle **Mang về / Giao** ở đầu khối liên hệ. |
| A2 | Để **Mang về** → nhập Tên "Chị Lan" + SĐT "0909…" → **"Đặt đơn"** | Tới trang theo dõi `/order/<id>`; hiện **"Chờ xác nhận"** (stepper 4 bước). |
| A3 | (đơn khác) chọn **Giao tận nơi** → bỏ trống **Địa chỉ** → "Đặt đơn" | Nút bị **chặn** (địa chỉ bắt buộc khi giao). Nhập địa chỉ → đặt được. |

### 4b. Nhân viên nhận đơn + bếp
| # | Thao tác | Kỳ vọng |
|---|---|---|
| B1 | /pos/online (cửa sổ B để sẵn) | Đơn A2 **pop** vào cột **"Chờ xác nhận"** (realtime); hiện kênh **Mang về**, tên/SĐT, món, tạm tính. |
| B2 | **"Nhận đơn"** | Đơn chuyển cột **"Đang xử lý"**, có **#số bếp**; trang theo dõi khách (A) đổi **"Đang chuẩn bị"** (không reload). |
| C1 | Mở KDS (cửa sổ C) | Vé đơn online hiện: nhãn **"Mang về"** (nền cam) + **#số** thay "Bàn X"; danh sách món + tùy chọn. |
| B3 | **"Đánh dấu sẵn sàng"** | Đơn hiện badge **"Sẵn sàng"**; trang theo dõi khách đổi **"Sẵn sàng nhận/giao"**. |
| B4 | Đơn Giao (4a-A3) → nhận đơn | /pos/online hiện kênh **Giao** (nền xanh) + **địa chỉ** dưới tên/SĐT. |

### 4c. Từ chối
| # | Thao tác | Kỳ vọng |
|---|---|---|
| B5 | Đơn "Chờ xác nhận" → **"Từ chối"** → nhập lý do "Hết món" → xác nhận | Đơn rời hàng đợi; trang theo dõi khách hiện **"Đơn đã bị hủy"** + "Lý do: Hết món". |
| B6 | **RLS**: owner Bún Bò `/r/bun-bo/pos/online` | KHÔNG thấy đơn Phở Việt. |

---

## 5) LUỒNG 05-03 — Thu tiền + hoàn tất + hóa đơn + doanh thu  ✅

Không cần máy in — nghiệm thu hóa đơn bằng **PDF preview** (Save as PDF). Đăng nhập **owner** (thu tiền online không cần PIN).

| # | Thao tác | Kỳ vọng |
|---|---|---|
| D1 | Từ 4b: đơn Mang về đang **"Sẵn sàng"** → **"Thu tiền & hoàn tất"** | Mở **PaymentDialog**: "Tổng phải thu" = **tạm tính + Phí 5% + VAT 8%** (đối chiếu tay). |
| D2 | **Tiền mặt** → khách đưa dư (VD 500.000) | **Tiền trả lại** tính đúng; nút mệnh giá nhanh chạy. |
| D3 | "Xác nhận thu · đóng bill" | ≤5s: "Đã thanh toán" + tiền thối; đơn chuyển **"Hoàn tất"**, **rời hàng đợi** /pos/online. |
| D4 | Trang theo dõi khách (A) | Đổi **"Hoàn tất"** (realtime, không reload). |
| D5 | KDS (C) | Vé đơn vừa thu **rời KDS** (đơn completed + món served). |
| D6 | **"In hóa đơn"** → Save as PDF (80mm) | Đủ mục: **logo + tên Phở Việt**, **"Mang về" · #bill_no**, **dòng liên hệ** (Chị Lan · 0909…), ngày giờ, các món (SL×đơn giá · thành tiền), **Phí 5%**, **VAT 8%**, **TỔNG**, "Tiền mặt · Tiền trả lại", **footer**. **Không tràn**. |
| D7 | Đơn **Giao** → thu tiền → in hóa đơn | Dòng liên hệ hiện **địa chỉ giao** (tên · SĐT · địa chỉ). |
| D8 | Đổi **`?w=58`** trên URL in | Vẫn không tràn, chữ đọc được. |
| D9 | Đơn khác → thu **Chuyển khoản** | "Xác nhận đã nhận đủ …" (**KHÔNG QR** — QD D-P4-1) → hoàn tất. |
| D10 | Bấm **"Thu tiền & hoàn tất"** 2 lần nhanh / mở lại | **Idempotent**: 1 đơn chỉ 1 bill (không nhân đôi); đơn đã completed không thu lại. |
| D11 | (DB) kiểm | 1 `bill` `paid` có `online_order_id`, `table_session_id=null`; `payments` `amount=total`; đơn `completed`, món `served`. |

### Dashboard (doanh thu gồm online)
| # | Thao tác | Kỳ vọng |
|---|---|---|
| E1 | /admin/reports (owner) sau khi thu vài đơn online hôm nay | **Doanh thu** + **Số hóa đơn** GỒM đơn online; đối chiếu tay Σ tổng bill = doanh thu (khớp). |
| E2 | **Món bán chạy** | Món trong đơn online vào xếp hạng (không đếm trùng). |
| E3 | **Theo phương thức** | Tiền mặt / Chuyển khoản của đơn online vào đúng cột; "Tổng đối soát" = doanh thu (khớp). |
| E4 | Trộn dine-in + online cùng ngày | Doanh thu = tổng cả 2 kênh (bill online session null **không bị loại**). |

---

## 6) Checklist nghiệm thu theo yêu cầu

| Yêu cầu | Bước test | Plan |
|---|---|---|
| RESV-01 (khách gửi đặt bàn → pending) | A1–A3 | ✅ 05-01 |
| RESV-02 (duyệt + danh sách theo ngày) | B1–B8 | ✅ 05-01 |
| ONLINE-01 — tạo đơn mang về/giao (contact, +địa chỉ) | 4a A1–A3 | ✅ 05-02 |
| ONLINE-01 — nhận đơn + KDS (nhãn kênh + #số) | 4b B1–C1 | ✅ 05-02 |
| ONLINE-01 — theo dõi khách realtime | A2, B2, B3, B5 | ✅ 05-02 |
| ONLINE-01 — vòng đời tới hoàn tất + thu tiền | D1–D5, D9 | ✅ 05-03 |
| PRINT-03 (hóa đơn 80mm đủ nội dung, không tràn) | D6–D8 | ✅ 05-03 |
| BILL-05 mở rộng (doanh thu khớp cả online) | E1–E4 | ✅ 05-03 |
| Cách ly tenant (RLS) | B8 (đặt bàn) + 4c B6 (online) | mọi plan |

---

## 7) Điểm hay lỗi / cần chú ý khi test

- **Migration**: cần `0014_reservations.sql` (05-01) + `0015_online_orders.sql` (05-02/03) đã áp dev; nếu /reserve hay /pos/online lỗi 500 → kiểm migration.
- **Giờ Việt Nam (UTC+7)**: đặt bàn gom theo **ngày VN**; đặt 1 đơn sát nửa đêm để chắc không lệch ngày. datetime-local ở form là giờ VN (action gắn offset `+07:00`).
- **Đặt bàn KHÔNG giữ bàn**: chỉ là bản ghi + duyệt (QD-008 D-P5-2); không tạo `table_session`, không đổi trạng thái bàn. Khách tới → nhân viên xếp bàn qua QR/POS như thường.
- **Đơn online luôn qua duyệt**: bỏ qua cờ `qr_order_auto_send` (D-P5-5) — luôn vào `pending_confirm`, cần "Nhận đơn".
- **KDS chỉ để xem**: bếp KHÔNG chạm; "Đánh dấu sẵn sàng" nằm ở **/pos/online** (owner/manager), không phải trên KDS.
- **Vé KDS rời khi thanh toán**: đơn online chỉ rời KDS khi **thu tiền** (completed + món served) — giống dine-in "vé tự xóa khi thanh toán". Nếu vé không mất: kiểm KDS đang nghe `postgres_changes` (`orders`/`order_items`) + `setAuth`.
- **Theo dõi khách = Broadcast** `order:{id}` (anon, không qua RLS); fallback polling 15s. Trang theo dõi chọn stepper theo **channel** (GET `/api/order/[id]` + payload broadcast đều trả `channel`).
- **Tổng ở PaymentDialog vs thẻ đơn**: thẻ đơn hàng đợi hiện **tạm tính** (Σ món); PaymentDialog hiện **Tổng phải thu** = tạm tính + phí + VAT — chênh nhau đúng phần phí/VAT (theo settings), KHÔNG phải lỗi.
- **Idempotent bill online**: mở/thu lại 1 đơn chỉ 1 bill (`online_order_id`). Nếu thấy 2 bill → kiểm `openBillForOrder` lọc bill open|paid theo `online_order_id`.
- **Doanh thu không loại nhầm online**: bill online có `table_session_id=null` nhưng **không** bị loại (reports lọc theo `status=paid` + `split_count IS NULL`, không lọc theo phiên). Nếu doanh thu thiếu online → kiểm điều kiện lọc ở `reports.ts`.
- **In hóa đơn**: chỉ gọi qua `PrintAdapter.printReceipt` (mở `/print/receipt/<billId>?w=80`); mỗi lần in +1 `print_jobs` type=`receipt`.
- **2 cửa sổ** (khách + admin, hoặc admin + KDS) là cách nhanh nhất thấy realtime.
```
