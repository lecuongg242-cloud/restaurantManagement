# P4 — Luồng test End-to-End (Frontend)

> Lập 22/07/2026. Phủ toàn chuỗi P4: **món đã phục vụ → chốt bill (gộp cả bàn) → tách/gộp/chia đều → điều chỉnh (giảm giá + phí + VAT) → thu tiền (mặt/CK) → đóng bill + tự đóng phiên → in hóa đơn 80mm → dashboard doanh thu**.
> Nguồn: 5 plan `04-01`…`04-05` + `00-TongQuan.md` + `QD-007`. Dùng để test thủ công trên trình duyệt qua từng plan.
> **Trạng thái build:** ✅ đã xong · ⏳ chờ plan. Cập nhật mỗi khi 1 plan được nghiệm thu.

| Plan | Bề mặt | Trạng thái |
|---|---|---|
| 04-01 | Bill gộp cả bàn + công thức tổng (POS "Tính tiền") | ✅ **Đã build** (chờ nghiệm thu) |
| 04-02 | Tách theo món / chia đều N / gộp bàn | ✅ **Đã build** (chờ nghiệm thu) |
| 04-03 | Điều chỉnh: giảm giá + %phí + %VAT (PIN manager/cashier) | ✅ **Đã build** (chờ nghiệm thu) |
| 04-04 | Thanh toán + đóng bill + đóng phiên + in hóa đơn 80mm | ✅ **Đã build** (chờ nghiệm thu) |
| 04-05 | Dashboard báo cáo (recharts) | ✅ **Đã build** (chờ nghiệm thu) |

> **Logic đã test:** `vitest tests/billing` **15/15 PASS** (công thức tổng + tách/chia đều), `tsc`/`lint` xanh, migration `0012`+`0013` áp dev. Phần ghi DB (mở/thu/đóng bill, đóng phiên) nghiệm thu bằng luồng dưới đây trên trình duyệt.

---

## 0) Chuẩn bị chung

**Dev server:** `npm run dev` → `http://localhost:3000` (bận thì Next dùng `:3001` — đọc log).

**Tài khoản (seed):**
| Vai trò | Đăng nhập | Dùng cho |
|---|---|---|
| Owner Phở Việt | `ownerA@pho-viet.test` / `DemoPass123!` | POS + admin/reports; giảm giá **không cần PIN** |
| Station Phở Việt | `station@pho-viet.test` / `StationPass123!` | POS (chọn nhân viên + PIN) |
| Owner Bún Bò | `ownerB@…` | Kiểm cách ly tenant (RLS) |

**Cần có trước khi test (chạy luồng P3 trước):**
- Vài **order đã duyệt** ở ≥2 bàn (B1, B2) — để có `order_items` chốt bill. **Từ P4 KHÔNG còn nút "Đã phục vụ"** (QD-007 D-P4-5): món xuống bếp (KDS) và **tự rời KDS + đánh dấu `served` khi thanh toán**. Đừng "Đóng phiên" thủ công — hãy để dành chốt bill.
- `/r/pho-viet/admin/settings`: đặt **Phí phục vụ 5%**, **VAT 8%**, bật **"Cho phép giảm giá"**, điền **Footer hóa đơn** (VD "Wifi: phovietsaigon").
- Nhân viên cho PIN (`/admin/staff`): 1 **cashier** "Lan" (PIN 1234) + 1 **waiter** "Hùng" (PIN 5678).

**URL chính:**
```
POS            /r/pho-viet/pos
In hóa đơn     /r/pho-viet/print/receipt/<billId>?w=80   (mở từ PaymentDialog / "In lại hóa đơn")
Dashboard      /r/pho-viet/admin/reports
```

**Setup realtime:** đặt **2 cửa sổ POS cạnh nhau** (2 thu ngân) để thấy bill/bàn cập nhật KHÔNG reload (`postgres_changes` bảng `bills`).

---

## 1) Sơ đồ luồng tổng

```
   MÓN ĐÃ DUYỆT (xuống bếp/KDS, phiên bàn còn mở — không cần "Đã phục vụ")
            │
            ▼
   ┌──────────── CHỐT BILL [✅04-01] ────────────┐
   │ POS panel bàn → "Tính tiền"                 │
   │  gom mọi order_item (≠hủy) → 1 bill 'open'  │
   │  Tạm tính → Phí 5% → VAT 8% → TỔNG          │
   │  (gọi lại sau khi thêm món = idempotent)    │
   └───────────────┬─────────────────────────────┘
                   │
      ┌────────────┼───────────────────────────────┐
      ▼            ▼                                 ▼
 TÁCH BILL     ĐIỀU CHỈNH                        GỘP BÀN
 [✅04-02]     [✅04-03]                          [✅04-02]
 • Theo món    • Giảm giá số tiền/% (PIN mgr/csh) • chọn B1+B2
 • Chia đều N  • Sửa %phí / %VAT (không PIN)       → 1 bill gom cả 2
   → N HĐ con                                       (table_session_id=null)
      │            │                                 │
      └────────────┴───────────────┬─────────────────┘
                                   ▼
   ┌──────────── THU TIỀN + ĐÓNG [✅04-04] ───────────┐
   │ "Thu tiền" → Tiền mặt (khách đưa → tiền thối)     │
   │            / Chuyển khoản (xác nhận, KHÔNG QR)    │
   │ → bill 'paid' (+paid_at) → ghi payments           │
   │ → mọi món của phiên đã thu ⇒ phiên 'closed'       │
   │   + bàn 'available'  (TABLE-02 phần đóng)          │
   │ → "In hóa đơn" 80mm (§7)                           │
   │ Con chia đều: thu từng phần → đủ ⇒ cha 'paid'      │
   └───────────────────────┬───────────────────────────┘
                           ▼
   ┌──────────── DASHBOARD [✅04-05] ───────────┐
   │ /admin/reports (manager/owner)             │
   │ Doanh thu ngày/tuần/tháng (giờ VN)         │
   │ Món bán chạy · Tiền mặt vs Chuyển khoản     │
   │ Doanh thu = Σ bill paid (loại vỏ chia đều)  │
   └─────────────────────────────────────────────┘

   ★ Doanh thu KHÔNG đếm trùng: hóa đơn "vỏ" chia đều (split_count) bị loại; đếm các phần con.
   ★ Bất biến: Σ qty_allocated mỗi order_item = qty (tách theo món + gộp bàn).
```

---

## 2) Máy trạng thái bill (tham chiếu)

```
                 "Tính tiền"          "Thu tiền"
 (không có bill) ───────────▶ open ───────────▶ paid   ── (khóa: không tách/điều chỉnh/thu lại; in lại OK)
                               │
                 "Chia đều N"  │  → sinh N hóa đơn con (split_parent_id), mỗi con: open → paid
                               ▼
                          open + split_count=N   ("vỏ chứa": KHÔNG thu trực tiếp, KHÔNG tính doanh thu)
                               │  (mọi con paid) ▶ paid   ← chỉ để đóng phiên; vẫn loại khỏi doanh thu
```
- **Bill thường / gộp bàn**: `open → paid`. Tính doanh thu.
- **Vỏ chia đều** (`split_count≠null`): giữ `bill_items` (để order_items vẫn "đã phân bổ") nhưng **không** thu, **không** tính doanh thu.
- **Con chia đều** (`split_parent_id≠null`): mang `total/N`, không gắn món; thu riêng; tính doanh thu.

---

## 3) LUỒNG 04-01 — Chốt bill gộp cả bàn  ✅

**Cửa sổ A:** `/r/pho-viet/pos` → chọn bàn **B1** (đã có ≥2 order phục vụ) → panel bàn (cột phải).

| # | Thao tác | Kỳ vọng |
|---|---|---|
| A1 | Bấm **"Tính tiền"** | Mở **BillPanel** (modal): danh sách món (SL× tên, đơn giá, thành tiền) gom **mọi order** của phiên. |
| A2 | Xem khối tổng | **Tạm tính** = Σ(đơn giá×SL); **Phí phục vụ 5%**; **VAT 8%**; **TỔNG** đậm cam. Đối chiếu tay từng đồng (VAT tính trên Tạm tính + Phí). |
| A3 | Đóng panel → gọi thêm 1 order ở B1 → phục vụ → "Tính tiền" lại | Món mới **xuất hiện**, tổng cập nhật, **KHÔNG nhân đôi** món cũ (idempotent). |
| A4 | (DB) kiểm | 1 `bill` status=`open` cho phiên; mỗi `order_item` có đúng **1** `bill_items`; `bill_no` là số theo ngày. |
| A5 | 2 cửa sổ POS | Thu ngân 2 mở cùng bàn → thấy bill giống nhau; đổi ở A phản chiếu ở B (realtime `bills`, không reload). |

---

## 4) LUỒNG 04-02 — Tách / gộp / chia đều  ✅

**Chuẩn bị:** B1 có bill 'open' với **"Phở bò ×2"** + **"Trà đá ×3"**.

### 4a. Tách theo món
| # | Thao tác | Kỳ vọng |
|---|---|---|
| B1 | BillPanel → **"Tách bill"** → tab **"Theo món"** | List món + stepper (0..SL). Chọn chuyển **1 Phở + 2 Trà**. Xem trước: **HĐ mới** vs **HĐ còn lại**. |
| B2 | "Tách theo món" | Thanh chọn hiện **2 hóa đơn**; HĐ#1 (1 Phở, 1 Trà) + HĐ#2 (1 Phở, 2 Trà). **Tổng 2 HĐ = tổng gốc**. |
| B3 | Chặn | Chọn chuyển **toàn bộ** → nút chặn ("hóa đơn nguồn sẽ rỗng"). |
| B4 | (DB) | `Σ qty_allocated` mỗi `order_item` = `qty` (không mất/nhân đôi suất). |

### 4b. Chia đều N người
| # | Thao tác | Kỳ vọng |
|---|---|---|
| B5 | Bill (VD tổng 300.000) → "Tách bill" → tab **"Chia đều"** → chọn **3** | Xem trước **Người 1/2/3 = 100.000** mỗi phần. |
| B6 | "Chia đều 3 người" | Thanh chọn: **HĐ gốc "đã chia 3"** (vỏ) + **3 phần con** mỗi phần 100.000. Chọn con → hiện số tiền + "thu ở bước thanh toán". |
| B7 | Chia lẻ (VD tổng 100.000 / 3) | 33.333 + 33.333 + **33.334** (dư dồn phần cuối); cộng lại = 100.000. |

### 4c. Gộp bàn
| # | Thao tác | Kỳ vọng |
|---|---|---|
| B8 | B1 và B2 đều có món phục vụ → chọn B1 → BillPanel → **"Gộp bàn"** | Dialog list bàn đang mở; **B1 (đang xem) luôn chọn**; tick thêm **B2**; xem trước **tổng gộp**. |
| B9 | "Gộp bàn" | 1 hóa đơn gom **đủ món cả 2 bàn** (nhãn "· gộp"). |
| B10 | Chặn | Gộp bàn đã có hóa đơn **chốt/chia** → từ chối ("Có bàn đã chốt/chia — không thể gộp"). |

---

## 5) LUỒNG 04-03 — Điều chỉnh (giảm giá + phí + VAT, PIN)  ✅

**Chuẩn bị:** cashier "Lan" (PIN 1234), waiter "Hùng" (PIN 5678). Bill 'open' bình thường.

| # | Thao tác (đăng nhập **station**) | Kỳ vọng |
|---|---|---|
| C1 | BillPanel → **"Điều chỉnh"** → Giảm giá **"%"** 10 | **Xem trước** tổng giảm ngay; VAT tính trên **đã giảm**. |
| C2 | "Lưu (cần PIN)" → chọn **Hùng (waiter)** + PIN 5678 | **Từ chối** "PIN hoặc quyền không hợp lệ"; tổng **KHÔNG đổi**. |
| C3 | Chọn **Lan (cashier)** + PIN sai | Từ chối (**cùng thông điệp** — không lộ sai PIN hay sai quyền). |
| C4 | Lan + PIN 1234 | **Áp giảm giá**; BillPanel hiện dòng "Giảm giá −…"; TỔNG đúng công thức. |
| C5 | "Điều chỉnh" → đổi **%VAT** 8→10 (không đụng giảm giá) → Lưu | Cập nhật **không cần PIN** (chỉ đổi phí/VAT). |
| C6 | Giảm giá **số tiền** > tạm tính | `discount = tạm tính`; TỔNG = phí+VAT trên 0 = **0**. |
| C7 | `/admin/settings` tắt "Cho phép giảm giá" → mở lại "Điều chỉnh" | Khối giảm giá **biến mất**; chỉ còn %phí/%VAT. |
| C8 | Đăng nhập **owner** → giảm giá | **Không cần PIN** (áp trực tiếp). |

---

## 6) LUỒNG 04-04 — Thanh toán + đóng bill + đóng phiên + in hóa đơn  ✅

Không cần máy in — nghiệm thu hóa đơn bằng **PDF preview** (Save as PDF).

| # | Thao tác | Kỳ vọng |
|---|---|---|
| D1 | Bill 'open' (VD tổng 320.000) → **"Thu tiền"** → **Tiền mặt** | Hiện "Tổng phải thu"; ô "Khách đưa" + nút mệnh giá nhanh. |
| D2 | Khách đưa **500.000** | **Tiền trả lại = 180.000** (tính đúng). |
| D3 | "Xác nhận thu · đóng bill" | ≤5s: bill → **paid**; màn báo "Đã thanh toán" + tiền thối + nút "In hóa đơn". |
| D4 | Sơ đồ POS | Bàn về **available** (nếu phiên đã thu hết món); BillPanel bill đó chuyển **chỉ-đọc** + "In lại hóa đơn". |
| D5 | **"In hóa đơn"** → Save as PDF (80mm) | §7 đủ: **logo + tên Phở Việt**, **Bàn B1 · #bill_no**, ngày giờ, các món (tên · SL×đơn giá · thành tiền), (Giảm giá nếu có), **Phí 5%**, **VAT 8%**, **TỔNG**, "Tiền mặt · Tiền trả lại 180.000", **footer**. **Không tràn** khổ. |
| D6 | Đổi **`?w=58`** | Vẫn không tràn, chữ đọc được. |
| D7 | Bill khác → "Thu tiền" → **Chuyển khoản** | "Xác nhận đã nhận đủ …" (**KHÔNG QR** — QD D-P4-1) → đóng. |
| D8 | **Chia đều** (từ B6): thu từng **phần con** | Mỗi con thu độc lập (mặt/CK). Khi **con cuối** paid → hóa đơn **cha tự 'paid'**; phiên đủ điều kiện → **đóng + bàn available**. |
| D9 | Khóa sau paid | Bill paid: **không** "Tách"/"Điều chỉnh"/"Thu tiền" lại; **"In lại hóa đơn"** vẫn được. |
| D10 | (DB) | `payments` ghi `method`+`amount=total`; `bills.paid_at` set; `table_sessions.status='closed'`; `print_jobs` type=`receipt`. |
| D11 | **Vé KDS tự xóa khi thanh toán** | Mở KDS (`/r/pho-viet/kds`) cạnh POS. Thu đủ tiền 1 bill → các món của bill đó **rời vé KDS ngay** (realtime, không reload); món đánh dấu **"Đã thu"** ở panel POS. Tách theo món: chỉ khi **cả 2 phần** đã thu, món mới rời KDS. |
| D12 | **Chặn đóng phiên khi chưa thu** | Còn món **chưa thu tiền** → bấm **"Đóng phiên"** → **bị chặn**: "Còn hóa đơn chưa thanh toán. Vui lòng thu tiền trước khi đóng phiên." Thu đủ → phiên **tự đóng**. Phiên **toàn món đã hủy** → "Đóng phiên" cho dọn bàn. |
| D13 | RLS | Owner Bún Bò `/r/bun-bo/pos` → không thấy bill Phở Việt. |

---

## 7) LUỒNG 04-05 — Dashboard báo cáo  ✅

**Chuẩn bị:** tạo **≥20 bill paid** rải **vài ngày** (trộn tiền mặt + chuyển khoản) qua luồng §6.

**Cửa sổ A:** đăng nhập **owner/manager** → `/r/pho-viet/admin/reports`.

| # | Thao tác | Kỳ vọng |
|---|---|---|
| E1 | Mở trang (mặc định **Tháng** hiện tại) | 3 thẻ KPI: **Doanh thu / Số hóa đơn / TB-hóa đơn** đúng; nhãn kỳ + "giờ Việt Nam". |
| E2 | Biểu đồ | **Cột doanh thu theo ngày** (recharts, cam); hover → tooltip "Ngày dd/mm · <tiền>". |
| E3 | RangePicker → **Ngày / Tuần** | Số liệu + biểu đồ gom lại đúng theo kỳ; **◀ ▶** đi kỳ trước (▶ chặn ở kỳ hiện tại). |
| E4 | **Món bán chạy** | Xếp hạng theo SL (thanh bar) + doanh thu; mỗi món đếm **1 lần** (chia đều không nhân đôi). |
| E5 | **Theo phương thức** | Tiền mặt vs Chuyển khoản (số tiền · số HĐ · %); dòng **"Tổng đối soát"** = doanh thu → **xanh** (khớp). |
| E6 | **BILL-05** | Cộng tay `total` của 20 bill paid = **Doanh thu** dashboard (khớp **100%**). |
| E7 | Quyền | Đăng nhập **waiter/cashier** → **không vào** `/admin/reports` (đẩy về route mặc định). |
| E8 | Mốc ngày VN | Bill thu lúc **23:30 giờ VN** vẫn tính **đúng ngày đó** (không lệch sang hôm sau do UTC). |

---

## 8) Checklist nghiệm thu theo yêu cầu

| Yêu cầu | Bước test | Plan |
|---|---|---|
| BILL-01 (bill gom mọi order của phiên) | A1–A4 | ✅ 04-01 |
| BILL-03 (điều chỉnh: giảm giá + phí + VAT; công thức) | A2, C1–C8 | ✅ 04-01 (công thức) / 04-03 (điều chỉnh) |
| BILL-02 (tách theo món / chia đều N / gộp bàn) | B1–B10 | ✅ 04-02 |
| BILL-04 (thu tiền mặt/CK; đóng bill ≤5s; bàn phù hợp) | D1–D10 | ✅ 04-04 |
| PRINT-03 (hóa đơn 80mm đủ nội dung, không tràn) | D5–D6 | ✅ 04-04 |
| TABLE-02 (đóng phiên khi thanh toán) | D4, D8 | ✅ 04-04 |
| REPORT-01 (doanh thu ngày/tuần/tháng) | E1–E3 | ✅ 04-05 |
| REPORT-02 (món bán chạy) | E4 | ✅ 04-05 |
| REPORT-03 (theo phương thức TT) | E5 | ✅ 04-05 |
| BILL-05 (doanh thu khớp 100%, 20 bill) | E6 | ✅ 04-05 |
| Cách ly tenant (RLS) | D11 + owner Bún Bò | mọi plan |

---

## 9) Điểm hay lỗi / cần chú ý khi test
- **Không còn "Đã phục vụ"** (QD-007 D-P4-5): bỏ thao tác đánh dấu phục vụ từng món. Thu tiền = tín hiệu hoàn tất: `payBill` tự đặt món **đã thu đủ** sang `served` → **vé rời KDS**. Enum `served` đổi nghĩa thành "đã thu"; badge POS hiện **"Đã thu"**. Nếu vé KDS không mất sau khi thu: kiểm KDS đang nghe `postgres_changes` bảng `order_items` + `setAuth`.
- **Phải thu hết tiền mới đóng được phiên**: sau P4, nút **"Đóng phiên" thủ công bị chặn** nếu còn món (chưa hủy) chưa nằm trong hóa đơn **đã thanh toán** → báo *"Còn hóa đơn chưa thanh toán. Vui lòng thu tiền trước khi đóng phiên."* Bình thường phiên **tự đóng** khi thu đủ (`closeSessionIfSettled`). "Đóng phiên" thủ công chỉ còn dùng cho phiên **không còn doanh thu** (mọi món đã hủy). Test: phục vụ xong nhưng CHƯA thu → bấm "Đóng phiên" → phải bị chặn.
- **Idempotent "Tính tiền"**: gọi lại sau khi bàn gọi thêm món chỉ **thêm phần mới**. Nếu thấy nhân đôi → kiểm `bill_items` đã lọc `order_item` "đã phân bổ" (bill open/paid) chưa.
- **Doanh thu không đếm trùng**: hóa đơn "vỏ" chia đều (`split_count`) **bị loại**; đếm các **phần con**. Nếu doanh thu gấp đôi khi có chia đều → kiểm điều kiện `split_count IS NULL` ở `reports.ts`.
- **Bất biến suất**: sau tách theo món / gộp bàn, `Σ qty_allocated` mỗi `order_item` phải = `qty`. Chia đều **không** đụng suất (dùng số tiền).
- **PIN xác thực ở SERVER** (bcrypt); thông điệp giảm giá sai **không** phân biệt sai-PIN vs sai-quyền. Owner/manager đăng nhập email **bỏ qua** PIN.
- **Mốc ngày Việt Nam (UTC+7)**: "doanh thu hôm nay" gom theo `paid_at` quy về ngày VN — test 1 bill sát nửa đêm để chắc không lệch ngày.
- **In hóa đơn**: POS chỉ gọi qua `PrintAdapter.printReceipt` (không `window.open` rải rác — PRINT-01/D1). Mỗi lần in +1 `print_jobs` type=`receipt`.
- **2 cửa sổ POS** là cách nhanh nhất để thấy `bills` cập nhật realtime giữa 2 thu ngân.
- **`next build`**: recharts là client-only; nếu build lỗi asset trên Windows → **tắt dev server** trước khi `next build` (rủi ro khóa `.next` đã ghi ở báo cáo P3).
```
