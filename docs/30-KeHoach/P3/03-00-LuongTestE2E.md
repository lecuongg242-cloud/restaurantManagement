# P3 — Luồng test End-to-End (Frontend)

> Lập 22/07/2026. Phủ toàn chuỗi P3: **khách gọi món QR** *hoặc* **thu ngân order thay khách** → POS duyệt → KDS làm món → hủy có kiểm soát → in phiếu bếp.
> Nguồn: 5 plan `03-01`…`03-05` + `00-TongQuan.md`. Dùng để test thủ công trên trình duyệt qua từng plan.
> **Trạng thái build:** ✅ đã xong · ⏳ chờ plan tương ứng. Cập nhật mỗi khi 1 plan được nghiệm thu.

| Plan | Bề mặt | Trạng thái |
|---|---|---|
| 03-01 | App khách (menu QR, giỏ, gửi, theo dõi) | ✅ **Đã build** (chờ nghiệm thu) |
| 03-02 | POS (sơ đồ bàn, duyệt/từ chối, thêm món, phục vụ, đóng phiên) | ✅ **Đã build** (chờ nghiệm thu) |
| 03-03 | KDS (3 cột realtime, đo ≤3s) | ✅ **Đã build** (chờ nghiệm thu) |
| 03-04 | Hủy món (PIN manager/cashier + lý do) | ✅ **Đã build** (chờ nghiệm thu) |
| 03-05 | In phiếu bếp 58/80mm | ✅ **Đã build** (chờ nghiệm thu) |

> **✅ Verify E2E tự động (Playwright, production build) — PASS toàn chuỗi** (22/07/2026). Chi tiết + ảnh: [03-BaoCaoTongKet.md](03-BaoCaoTongKet.md). Chạy: `npm run test:e2e` (cần `next start` — xem báo cáo §7). Realtime KDS/khách cập nhật KHÔNG reload (badge delta 2.2s xanh). 2 bug đã phát hiện & sửa (realtime setAuth, đóng phiên sau served).

---

## 0) Chuẩn bị chung

**Dev server:** `npm run dev` → `http://localhost:3000` (nếu bận, Next dùng `:3001` — đọc log để lấy đúng cổng).

**Tài khoản (seed):**
| Vai trò | Đăng nhập | Dùng cho |
|---|---|---|
| Owner Phở Việt | `ownerA@pho-viet.test` / `DemoPass123!` | POS/KDS/admin, hủy món không cần PIN |
| Station Phở Việt | `station@pho-viet.test` / `StationPass123!` | POS/KDS (chọn nhân viên + PIN) |
| Owner Bún Bò | `ownerB@...` | Kiểm cách ly tenant (RLS) |

**Cần có trước khi test:**
- 1 bàn có `qr_token` — lấy ở `/r/pho-viet/admin/tables` (hoặc quét QR đã in ở P2).
- Menu có ≥1 danh mục + vài món; **nên tạo 1 món có nhóm tùy chọn "Size" bắt buộc** (`/r/pho-viet/admin/menu` → nhóm tùy chọn) để test validate min/max/required.
- Nhân viên cho 03-04: 1 **cashier** (VD "Lan", PIN 1234) + 1 **waiter** (VD "Hùng", PIN 5678) ở `/admin/staff`.

**Setup realtime (bắt buộc để test đúng):** đặt **2 cửa sổ cạnh nhau**.
- **Cửa sổ B (Khách):** DevTools mobile **360px**, mở URL menu theo `qr_token`.
- **Cửa sổ A (Nhân viên):** POS và/hoặc KDS (desktop/tablet).

**URL chính:**
```
Khách menu     /r/pho-viet/menu?t=<qr_token>
Khách theo dõi /r/pho-viet/order/<orderId>?t=<qr_token>   (tự chuyển sau khi gửi)
POS            /r/pho-viet/pos            (⏳ 03-02)
KDS            /r/pho-viet/kds            (⏳ 03-03)
In phiếu bếp   /r/pho-viet/print/kitchen/<orderId>?w=80   (⏳ 03-05)
```

---

## 1) Sơ đồ luồng tổng

```
          ┌───────────────────────────── 2 ĐIỂM VÀO ─────────────────────────────┐
          │                                                                       │
   (A) KHÁCH QUÉT QR                                          (B) THU NGÂN ORDER THAY KHÁCH
   /menu?t=token  [✅03-01]                                   POS → "Thêm món"  [⏳03-02]
   chọn món→tùy chọn→giỏ→Gửi                                  chọn bàn→menu→xác nhận
          │                                                                       │
          ▼                                                                       ▼
   order status = pending_confirm                            order status = confirmed (bỏ duyệt)
   (chờ duyệt — D8)                                          source = staff
          │                                                                       │
          ▼                                                                       │
   ┌──────────────── POS DUYỆT [⏳03-02] ───────────────┐                         │
   │ Drawer "Chờ duyệt (N)" realtime                    │                         │
   │  • Duyệt  → confirmed (+confirmed_at, confirmed_by) │                         │
   │  • Từ chối→ cancelled (+ lý do)                     │                         │
   └────────────────────────┬───────────────────────────┘                         │
                            │ confirmed  ◄──────────────────────────────────────────┘
                            ▼
   ┌──────────── KDS LÀM MÓN [⏳03-03] ────────────┐        ┌─── IN PHIẾU BẾP [⏳03-05] ───┐
   │ Vé hiện ≤3s (đo ORDER-04)                     │        │ Duyệt xong → "In phiếu bếp"  │
   │ Chờ làm → [Bắt đầu] → Đang làm → [Xong] → Sẵn │        │ 58/80mm, logo+bàn+món        │
   │ mọi item ready ⇒ order = ready                │        │ ghi log print_jobs           │
   └───────────────────────┬───────────────────────┘        └──────────────────────────────┘
                           ▼
   ┌──────────── POS PHỤC VỤ + ĐÓNG PHIÊN [⏳03-02] ───────────┐
   │ item ready → [Đã phục vụ] → served                        │
   │ mọi item served → [Đóng phiên] → bàn = available          │
   │ (đóng-khi-thanh-toán để P4)                               │
   └───────────────────────────────────────────────────────────┘

   ┌──────────── HỦY MÓN có kiểm soát [⏳03-04] — cắt ngang bất kỳ lúc chưa served ───────────┐
   │ POS panel → [Hủy] món → chọn manager/cashier + PIN (server bcrypt) + lý do bắt buộc      │
   │ → item cancelled (+cancel_reason, cancelled_by) → KDS bỏ vé realtime → khách thấy đơn đổi │
   └──────────────────────────────────────────────────────────────────────────────────────────┘

   ★ REALTIME xuyên suốt:
     • KHÁCH (anon)  = Supabase BROADCAST channel order:{id}  → stepper đổi ≤1s   [✅03-01 client, ⏳ server gọi từ 03-02/03/04]
     • POS / KDS     = postgres_changes filter tenant_id (RLS)                     [⏳03-02/03-03]
```

---

## 2) Máy trạng thái (tham chiếu)

**Order (mức đơn):**
```
pending_confirm ──duyệt──▶ confirmed ──▶ preparing ──▶ ready ──▶ served ──▶ completed(P4)
      │                        │             │           │
      └──từ chối──┐            └─────────────┴───────────┴──▶ (bất kỳ) ──hủy──▶ cancelled
                  ▼
              cancelled
```
Staff order: vào thẳng `confirmed` (bỏ `pending_confirm`).

**Order item (mức món):** `queued → preparing → ready → served`; hủy bất kỳ lúc chưa `served` → `cancelled`.
Roll-up: mọi item `ready` ⇒ order `ready`; mọi item `cancelled` ⇒ order `cancelled`.

---

## 3) LUỒNG A — Khách gọi món QR  ✅ (03-01, test được ngay)

**Cửa sổ B (mobile 360px):** `http://localhost:3000/r/pho-viet/menu?t=<qr_token>`

| # | Thao tác | Kỳ vọng |
|---|---|---|
| A1 | Mở menu | Header: logo + tên NH + **Bàn <tên>** + icon giỏ. Chip danh mục cuộn ngang (scroll-snap), highlight theo mục đang xem. Thẻ món **hiện dần (stagger)** khi cuộn. |
| A2 | Chạm món **không** tùy chọn | Thêm thẳng vào giỏ; **badge giỏ nảy**; thanh "Xem giỏ" trượt lên đáy. |
| A3 | Chạm món **có Size bắt buộc** | Mở **sheet vuốt** (vaul). Không chọn Size mà bấm "Thêm" → **bị chặn** (nút hiện "Vui lòng chọn Size"). Chọn "Lớn (+10.000)", SL 2, ghi chú "ít hành" → "Thêm vào giỏ · <tổng>". |
| A4 | Món **hết** (bật "hết món" ở `/admin/menu`) | Thẻ **mờ + nhãn "Hết"**, không chạm thêm được (MENU-02). |
| A5 | "Xem giỏ" | Sheet giỏ: dòng món + tùy chọn + ghi chú; **QtyStepper** (số nảy) sửa SL; xóa dòng (animate thu lại); ghi chú chung; tạm tính. |
| A6 | "Gửi order" | POST tạo đơn → **chuyển trang theo dõi** `/order/<id>` "Chờ xác nhận". Giỏ xóa (sessionStorage). |
| A7 | Đếm chạm | Món có tùy chọn ≈ **5 chạm** (món→option→Thêm→Xem giỏ→Gửi); món thường **3 chạm**. ≤6 ✓ (ORDER-01). |
| A8 | Token thiếu/sai (`/menu` không `?t=`) | Menu **chỉ-xem** + banner "Quét mã QR tại bàn để gọi món"; không có nút thêm/giỏ. |
| A9 | Gửi lần 2 cùng bàn | Đơn mới **ghép cùng phiên bàn** (test DB: cùng `table_session_id`); bàn `occupied`. |

**Điểm dừng hiện tại:** trang theo dõi (A5-flow) đứng ở "Chờ xác nhận" tới khi POS (03-02) duyệt. Test realtime broadcast: xem §7.

---

## 4) LUỒNG B — Thu ngân order thay khách  ✅ (03-02)

**Cửa sổ A:** đăng nhập station → `/r/pho-viet/pos` → chọn nhân viên + PIN.

| # | Thao tác | Kỳ vọng |
|---|---|---|
| B1 | Chọn **bàn trống** trên sơ đồ | Panel bàn (cột phải) mở; phiên chưa có. |
| B2 | "Thêm món" | Sheet menu (tái dùng ModifierSheet/QtyStepper của khách); chỉ món `available`; validate tùy chọn **giống hệt luồng khách**. |
| B3 | Xác nhận | Order tạo `source=staff`, **vào thẳng `confirmed`** (bỏ duyệt — ORDER-03); phiên mở nếu bàn trống → bàn `occupied`; món hiện trong panel ngay. |
| B4 | Hội tụ | Từ đây giống luồng khách sau khi duyệt: xuống KDS (03-03), in phiếu (03-05), phục vụ, đóng phiên. |

---

## 5) POS DUYỆT / TỪ CHỐI / PHỤC VỤ / ĐÓNG PHIÊN  ✅ (03-02)

**2 cửa sổ:** A = POS, B = khách (mobile).

| # | Thao tác (A = POS) | Kỳ vọng |
|---|---|---|
| C1 | B gửi order (luồng A) | A: badge "Chờ duyệt (N)" **tăng realtime ≤3s không reload**; drawer hiện order (bàn, giờ, món+SL+tùy chọn+ghi chú); bàn chuyển **occupied (nền cream)**. |
| C2 | A "Duyệt" | Order → `confirmed` (+`confirmed_at`, `confirmed_by`); biến khỏi drawer. **B (trang theo dõi) đổi "Đã xác nhận" NGAY (≤1–2s, broadcast — không reload).** |
| C3 | A "Từ chối" bỏ trống lý do | **Bị chặn** (lý do bắt buộc). Nhập lý do → order `cancelled`; **B thấy banner đỏ "Đơn đã bị hủy" + lý do**. |
| C4 | Sơ đồ bàn | 4 màu status (available viền / occupied cream / reserved viền primary / cleaning xám), tab theo khu vực; tile hiện tên bàn + số món chưa phục vụ. |
| C5 | item `ready` (sau KDS) → A "Đã phục vụ" | item → `served`; mọi item served ⇒ order `served`. |
| C6 | Mọi item served → A "Đóng phiên" (confirm) | Phiên `closed`; bàn về **available**. (Tự đóng khi thanh toán = P4.) |
| C7 | RLS | Owner Bún Bò mở `/r/bun-bo/pos` → **không thấy** bàn/order Phở Việt. |

---

## 6) KDS LÀM MÓN + ĐO ≤3s  ✅ (03-03)

**2 cửa sổ:** A = POS, B/C = KDS (`/r/pho-viet/kds`).

| # | Thao tác | Kỳ vọng |
|---|---|---|
| D1 | POS duyệt order (C2) | KDS: vé hiện **cột "Chờ làm" ≤3s không reload**; **badge delta giây** (now − confirmed_at) ở góc vé — xanh nếu ≤3s. Order `pending_confirm` **không** hiện. |
| D2 | Vé nội dung | Tên **bàn** (chữ lớn), đồng hồ đếm lên, `SL× tên món`, tùy chọn thụt lề, ghi chú nổi bật. |
| D3 | "Bắt đầu" 1 món | `queued→preparing`, sang cột "Đang làm". |
| D4 | "Xong" | `preparing→ready`, sang cột "Sẵn sàng"; **B khách thấy "Sẵn sàng" realtime**. |
| D5 | Mọi món ready | order `ready`; POS thấy nút "Đã phục vụ" (C5). |
| D6 | Vé quá 10 phút | Viền + **nhãn "TRỄ"** (màu + chữ, không chỉ màu — a11y). |
| D7 | Đo ORDER-04 | Lặp 10 lần, ghi bảng `lần | giây | đạt` vào `03-03-SUMMARY.md`; trung bình & max ≤3s. |

---

## 7) HỦY MÓN có kiểm soát  ✅ (03-04)

**Chuẩn bị:** cashier "Lan" (PIN 1234), waiter "Hùng" (PIN 5678). Order 2 món đã duyệt → vé ở KDS.

| # | Thao tác (POS panel bàn) | Kỳ vọng |
|---|---|---|
| E1 | "Hủy" 1 món, bỏ trống lý do | **Bị chặn**. |
| E2 | Chọn **Hùng (waiter)** + PIN 5678 + lý do | **Từ chối** "PIN hoặc quyền không hợp lệ". |
| E3 | Chọn **Lan (cashier)** + PIN sai | Từ chối (**cùng thông điệp** — không lộ sai PIN hay sai quyền). |
| E4 | Lan + PIN 1234 + lý do "khách đổi ý" | **Hủy thành công**: item `cancelled` + `cancel_reason` + `cancelled_by=Lan`. **KDS bỏ món khỏi vé realtime**; panel gạch dòng + "Đã hủy · khách đổi ý". |
| E5 | Hủy nốt món còn lại | order `cancelled`; **khách thấy đơn hủy**. |
| E6 | Đăng nhập **owner** → hủy | **Không cần PIN** (vẫn bắt lý do), `cancelled_by` = membership owner. |
| E7 | "Sửa món đã gửi" | = **hủy dòng cũ + Thêm món mới** (không edit-in-place — quyết định P3 #3). |

---

## 8) IN PHIẾU BẾP 58/80mm  ✅ (03-05)

Không cần máy in — nghiệm thu bằng **PDF preview** (Save as PDF).

| # | Thao tác | Kỳ vọng |
|---|---|---|
| F1 | Duyệt order (món có tùy chọn + ghi chú "ít hành") | Tab in **tự mở** + hộp thoại in (toggle "tự mở khi duyệt" mặc định bật). |
| F2 | Save as PDF (khổ 80mm) | Phiếu: **logo + tên Phở Việt** (OPS-06), số phiếu, bàn, giờ, `2x Phở bò` + `  + Lớn` + `>> ít hành`. **Không tràn** khổ. Mono đen trắng, không theme. |
| F3 | `?w=58` | Vẫn không tràn, chữ đọc được. |
| F4 | "In lại" từ panel bàn | Phiếu có nhãn **"IN LẠI"**; **món đã hủy KHÔNG** lên phiếu. |
| F5 | DB / code | Mỗi lần in +1 dòng `print_jobs` (type=kitchen_ticket, status=printed). POS chỉ gọi qua `PrintAdapter` (không `window.open` rải rác — PRINT-01). |

---

## 9) Checklist nghiệm thu theo yêu cầu

| Yêu cầu | Bước test | Plan |
|---|---|---|
| ORDER-01 (gọi món ≤6 chạm, 360px, món hết) | A1–A9 | ✅ 03-01 |
| TABLE-02 (mở/ghép phiên; đóng phiên) | A9, C6 | 03-01 (mở/ghép ✅) / 03-02 (đóng) |
| MENU-02 (khách không đặt món hết) | A4 | ✅ 03-01 |
| ORDER-02 (duyệt/từ chối order QR realtime) | C1–C3 | ⏳ 03-02 |
| ORDER-03 (thêm món thay khách → confirmed) | B1–B4 | ⏳ 03-02 |
| ORDER-04 (KDS ≤3s, đo 10 lần) | D1, D7 | ⏳ 03-03 |
| ORDER-05 (hủy món PIN + lý do + log) | E1–E6 | ⏳ 03-04 |
| PRINT-01/02, OPS-06 (phiếu bếp) | F1–F5 | ⏳ 03-05 |
| Cách ly tenant (RLS) | C7, D + owner Bún Bò | mọi plan |

---

## 10) Điểm hay lỗi / cần chú ý khi test
- **Realtime khách** dùng **Broadcast** (không phải postgres_changes) — anon nhận được không cần đăng nhập. Nếu stepper không đổi: kiểm server đã gọi `broadcastOrderStatus(orderId)` sau UPDATE (03-02/03/04) + fallback polling 15s vẫn phải cập nhật khi ngắt mạng.
- **POS/KDS realtime** dùng `postgres_changes` filter `tenant_id` — 1 kênh chung, không tạo mới mỗi render (nếu >3s xem lại số kênh + filter).
- **PIN xác thực ở SERVER** (bcrypt) — client không giữ hash. Thông điệp lỗi hủy **không** phân biệt sai-PIN vs sai-quyền.
- **Snapshot**: phiếu bếp + trang theo dõi lấy `name_snapshot`/`unit_price_snapshot` — sửa menu sau khi order **không** đổi đơn đã tạo.
- **2 cửa sổ trên cùng máy** là cách nhanh nhất để test mọi bước realtime.
```
