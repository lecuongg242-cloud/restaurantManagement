# QD-027 — Mua hàng, nhà cung cấp, công nợ, sổ quỹ, kết quả kinh doanh

**Ngày:** 29/09/2026 · **Trạng thái:** ĐÃ CHỐT phạm vi (chủ dự án trả lời 29/09/2026, xem §Chủ dự án đã chốt); các quyết định
kỹ thuật D1–D12 theo đề xuất, sửa được khi rà code lúc làm.
**Kế hoạch:** `30-KeHoach/P20/` · **Nghiên cứu:** `30-KeHoach/P20/00-NghienCuu-NghiepVu.md` · **Yêu cầu:** PURCH-01..06,
CASH-01..04, REPORT-20
**Liên quan:** QD-017 (kho, giá vốn, chốt sổ ngày), QD-010 (phân quyền), QD-021 (tài khoản ngân hàng), QD-022 (sổ HKD),
QD-023 (chuỗi)

## Bối cảnh

P10 cho chủ quán lãi gộp từng món nhưng không có lãi của cả quán: chi phí ngoài nguyên liệu, tiền nợ mối hàng, số tiền
trong két và tài khoản đều nằm ngoài hệ thống. Cả 5 đối thủ có "Nhà cung cấp", "Nhập hàng", "Sổ quỹ" và báo cáo lãi lỗ.
Nhập buổi sáng P10 (`recordReceipts`) đã ghi được lượng và giá, nhưng không có NCC, số chứng từ, thành tiền hay tiền trả.

## Chủ dự án đã chốt (29/09/2026)

| # | Câu hỏi | Chốt |
|---|---|---|
| C1 | Loại hình khách, sổ HKD | **Công ty / chưa rõ — sổ S2c, S2e để sau.** Phiếu vẫn ghi đủ trường (mục chi phí, chứng từ gốc) để xuất sổ sau |
| C2 | Phiếu nhập | **Gộp "Nhập hôm nay" thành phiếu nhập** — một luồng, không làm màn nhập thứ hai |
| C3 | Làm luôn trong P20 | **Không**: chuyển hàng giữa chi nhánh, thu ngân chi tiền trong ca, trả hàng nhập, đặt hàng nhập (PO) riêng — **để sau** |
| C4 | Mặc định | **Đồng ý**: không thêm vai trò mới; bỏ tuổi nợ; lãi lỗ lấy giá vốn P10, quán không khai định lượng lấy tiền mua kèm nhãn |
| C5 | Quyền quản lý | **Quản lý ghi phiếu, chỉ chủ xem lãi lỗ**: manager nhập hàng, tạo phiếu thu/chi, trả nợ NCC, xem sổ quỹ; khối "Kết quả kinh doanh" (và file xuất của nó) **chỉ owner** — lộ tiền thuê nhà, lương, lợi nhuận |
| C6 | Quán không dùng kho mà muốn theo dõi nợ mối | **Khai mặt hàng như nguyên liệu** ("Bia Hà Nội", "Gas"), không cần định lượng — giống KiotViet; không có dòng phiếu gõ tên tự do |
| C7 | Tiền bán hàng trong sổ quỹ | **Một dòng mỗi ngày mỗi phương thức**, bấm vào mở báo cáo ngày đó. **Khác KiotViet** (một phiếu thu mỗi hóa đơn) — chủ dự án đồng ý vì sổ gọn (~2.700 dòng/tháng với qt-food) và luôn khớp báo cáo |
| C9 | Khai thuế nộp nhà nước | **Cài đặt → "Thuế nộp nhà nước"**, chỉ owner: danh sách dòng thuế (tên, %, tính trên **doanh thu** hoặc **lợi nhuận**) — ví dụ "10% doanh thu", "GTGT 3% + TNCN 1,5% doanh thu", "TNCN 17% lợi nhuận". Kết quả kinh doanh hiện "Thuế phải nộp (ước tính)" từng dòng → **Lợi nhuận sau thuế**. Khác ô "VAT %" sẵn có (khách trả, cộng vào hóa đơn) |
| C2' | Sửa C2 + D2 (01/10/2026, P25) | Chốt G1 (30/09) thêm menu "Nhập hàng" nhưng vẫn giữ tab "Nhập hôm nay", nên có hai màn nhập (trái C2). Chủ dự án thấy không hợp lí, và ngày 01/10 chốt: **nhập hàng chỉ ở menu Nhập hàng** (như KiotViet: Giao dịch → Nhập hàng). Bỏ tab "Nhập hôm nay"; nhập buổi sáng nhanh nhờ nút **"Lấy hàng lần trước"** ở "+ Nhập hàng"; Tồn kho + Chế biến thành tab "Tồn kho". Xem `30-KeHoach/P25/00-TongQuan.md` |
| C8 | Tài khoản ngân hàng | **Một tài khoản** (tài khoản P13). **Khác KiotViet** (nhiều tài khoản) — chủ dự án đồng ý; nhiều tài khoản làm cùng sổ S2e |

## Quyết định

| # | Việc | Chọn | Vì sao | Phương án bị loại |
|---|---|---|---|---|
| D1 | Chứng từ trung tâm | **Phiếu nhập** (`purchase_receipts` + dòng). Trạng thái **Phiếu tạm → Đã nhập hàng → Đã hủy**; nút **"Lưu tạm"**, **"Hoàn thành"** (chữ KiotViet) | 5/5 đối thủ; phiếu tạm thay PO (như Sapo FnB, POS365) | PO riêng (C3) |
| D2 | Nhập buổi sáng | Màn "Nhập hôm nay" giữ nguyên (điền sẵn, trên điện thoại 360px, giá tùy chọn, gợi ý P18) và **thêm**: ô NCC (tùy chọn), "Tiền trả NCC" + phương thức. Mỗi lần "Hoàn thành" = **một phiếu nhập** | Không làm chậm buổi sáng; không có hai đường vào kho (C2) | Tách màn "Nhập hàng" riêng |
| D3 | Tiền trên phiếu | Dòng: SL theo đơn vị nhập, **đơn giá theo đơn vị nhập (int đ, tùy chọn)**, **thành tiền int đ**. Phiếu: Tổng tiền hàng − Giảm giá = **"Cần trả NCC"**. `stock_entries.unit_cost` **suy ra** từ thành tiền ÷ lượng gốc | Tiền công nợ, sổ quỹ là int VND; Σ phải khớp tuyệt đối, không đi qua 6 chữ số lẻ | Lưu tiền ở `stock_entries` |
| D4 | Vào kho | "Hoàn thành" ghi dòng `stock_entries` kind **`receipt`** (không thêm kind) kèm `purchase_receipt_id`; `business_date` = **ngày hoàn thành theo giờ VN, luôn tính ở server**. Phiếu còn **ngày chứng từ** riêng (sửa được, dùng cho công nợ và sổ quỹ) | Ghi vào ngày đã chốt bị mất im lặng (`0047:137`); thêm kind mới phải sửa 2 CHECK + 2 RPC + payload chốt + `loadPrices` | Ghi kho theo ngày chứng từ |
| D5 | Sửa, hủy | Phiếu đã nhập **không sửa số** — chỉ sửa ghi chú, ngày chứng từ, NCC (khi chưa có). **"Hủy bỏ"** + **"Sao chép"** (KiotViet). Hủy khi ngày kho **chưa chốt** → xóa các dòng sổ của phiếu trong RPC; ngày kho **đã chốt** → ghi dòng `receipt` **âm**, `unit_cost` rỗng, vào hôm nay (CHECK dấu nới riêng cho dòng có `purchase_receipt_id`). Hỏi có hủy luôn phiếu chi đi kèm không | Hợp chốt sổ bất biến (QD-017 D7); dòng âm không giá không làm lệch bình quân ngày | Cho sửa phiếu đã nhập; dùng `count_adjust` (lẫn vào hao hụt "không giải thích được") |
| D6 | Nhà cung cấp | Danh mục `suppliers`: Tên (bắt buộc), Mã **NCC000001** tự sinh, SĐT (không trùng trong quán), Email, Địa chỉ, MST, Ghi chú, Ngừng hoạt động. Danh sách có cột **"Tổng mua"**, **"Nợ cần trả hiện tại"** | Số đông đối thủ; nhóm NCC, nhập Excel, bảng giá NCC để sau | Bảng giá theo NCC (chỉ iPOS) |
| D7 | Sổ quỹ | Bảng `cash_vouchers` (phiếu thu **PT**, phiếu chi **PC**) cho mọi dòng tiền **trừ bán hàng**. Hai quỹ: **Tiền mặt** và **Ngân hàng** (một tài khoản — tài khoản P13); **Tổng quỹ** = cộng hai quỹ. Số dư đầu bằng phiếu loại "Số dư đầu kỳ" | Số đông đối thủ; quán nhỏ thường một tài khoản | Nhiều tài khoản ngân hàng (để sau, cần cho S2e) |
| D8 | Tiền bán hàng | **Tính** từ `payments` theo đúng `report_payments` (`business_at`): tiền mặt → quỹ tiền mặt, chuyển khoản → ngân hàng; hiện một dòng mỗi ngày mỗi phương thức. Không chép vào `cash_vouchers` | Nguyên tắc QD-017 D1: đơn hàng là sổ cái, không lưu một sự thật hai nơi; Σ = REPORT-03 theo định nghĩa | Sinh phiếu thu mỗi hóa đơn như KiotViet |
| D9 | Phiếu tự sinh | Phiếu nhập trả ngay, thanh toán nợ NCC → sinh **phiếu chi** gắn NCC; chỉ sửa ghi chú, thời gian. Hủy phiếu thu/chi = **vô hiệu** (giữ dòng, trạng thái "Đã hủy"), không xóa | KiotViet, Sapo | Xóa phiếu |
| D10 | Loại thu/chi | Danh mục tự tạo được; mỗi loại có **mục chi phí S2c** (a nguyên liệu · b lương · c khấu hao · d dịch vụ mua ngoài · đ lãi vay · e khác · **không tính**) và mặc định cho ô **"Hạch toán vào kết quả kinh doanh"**. Tạo sẵn: Đi chợ, Gas, Lương nhân viên, Thuê mặt bằng, Điện, Nước, Internet/điện thoại, Sửa chữa, Chi khác, Rút tiền (không tính), **Nộp thuế (không tính** — thuế đã ước tính theo C9, tính nữa là hai lần); Thu khác, Nộp tiền vào quỹ (không tính). Phiếu chi có trường chứng từ gốc tùy chọn: loại (HĐ GTGT / HĐ bán hàng / không hóa đơn / khác), số, ngày | Để sau xuất S2c không phải nhập lại (C1); đối thủ không công bố danh sách mặc định | Không phân mục |
| D11 | Công nợ NCC | Nợ = Σ "Cần trả" của phiếu đã nhập − Σ phiếu chi gắn NCC (chưa hủy) + Σ điều chỉnh. **"Thanh toán"**: nhập số tiền → tự phân bổ **phiếu cũ trước**, hoặc tích chọn phiếu (CUKCUK, Sapo) → sinh phiếu chi. **"Điều chỉnh"** (KiotViet): ghi nợ đầu kỳ / sửa lệch, không đi qua quỹ. Trả dư → nợ âm, hiện "Trả trước". Không tuổi nợ (C4) | Số đông; phân bổ để biết từng phiếu đã trả chưa | Chỉ trừ vào tổng |
| D12 | Kết quả kinh doanh | Theo tháng/khoảng ngày, mốc doanh thu = **KPI BILL-05 (`business_at`)**. Dòng: Doanh thu bán hàng − Giảm giá = Doanh thu món thuần; + phí phục vụ = **Doanh thu thuần** (VAT tách một dòng nối về KPI) − **Giá vốn** = **Lợi nhuận gộp** − Chi phí (phiếu chi có hạch toán, theo loại) + Thu nhập khác (phiếu thu có hạch toán) = **Lợi nhuận**. Giá vốn: quán có bản chốt P10 → giá vốn món đã bán; chưa có → **"Chi phí mua nguyên liệu (theo phiếu nhập)"** kèm nhãn. Ở chế độ giá vốn, phiếu chi mục a) **không** cộng thêm (ghi rõ số phiếu bị loại). Phiếu chi trả NCC không bao giờ là chi phí. Có phạm vi "Tất cả chi nhánh" (mảng tenant như 0064) | Sapo/KiotViet/CUKCUK; không tính nguyên liệu hai lần | Lấy mốc `paid_at` |

**Kỹ thuật chung:** mã phiếu (NCC, PN, PC, PT) cấp trong RPC từ bảng đếm có khóa dòng + unique `(tenant_id, code)` — không
theo khuôn `nextBillNo` (max+1, không unique). Bảng tiền và NCC dùng RLS `manager_tenants()` (0068). Thêm
`ManageSection` `purchasing`, `cashbook` (owner + manager), `finance` (**chỉ owner**, C5) và hai mục menu "Nhà cung cấp",
"Sổ quỹ". RPC lãi lỗ tự kiểm vai trò owner ở DB (không chỉ ẩn ở app), vì RLS `manager_tenants()` cho manager đọc phiếu. Loại xuất Excel mới
thêm vào CHECK `export_logs.kind`.

## Ngoài phạm vi P20 (để sau)

**Sang P22** (`30-KeHoach/P22/00-TongQuan.md`): chuyển hàng giữa chi nhánh / bếp trung tâm · mở/kết ca, thu ngân chi tiền
trong ca · trả hàng nhập · PO riêng + bếp báo hàng · nhiều tài khoản ngân hàng.
Còn lại: ví điện tử · sổ S2b/S2c/S2d/S2e, bảng kê 02/TNDN · nhóm NCC, nhập/xuất Excel NCC ·
chi phí phân bổ nhiều tháng, khấu hao · tuổi nợ · công nợ khách hàng.

## Hệ quả

- Quán không dùng P20 thì POS, nhập buổi sáng, báo cáo **y hệt** hôm nay (test hồi quy như INV-10). Nhập buổi sáng không
  chọn NCC, không nhập tiền trả vẫn cho đúng dòng sổ như 10-02.
- Phiếu nhập cần nguyên liệu (dòng sổ có `ingredient_id`). Quán không dùng định lượng mà muốn theo dõi nợ mối bia chỉ cần
  khai nguyên liệu "Bia" — không có định lượng thì POS không đổi (QD-017 D4).
- `stock_entries` thêm một cột và nới CHECK dấu; `inventory_on_hand`/`inventory_day` không đổi công thức (dòng âm là
  `receipt`). Không chạm `menu_items`, `order_items`, `bills`, `payments`.
- **Khoản nào được trừ do quán tự cấu hình** (chủ dự án 29/09/2026): mỗi loại thu/chi có mục chi phí + mặc định "Hạch toán"
  sửa được; từng phiếu bật/tắt được "Hạch toán". Hệ thống không tự phán xét chứng từ, không chặn hay nhắc theo luật thuế,
  không chờ kế toán xác nhận.
- Khi làm sổ S2c/S2e: đã có mục chi phí, chứng từ gốc, quỹ; còn thiếu nhiều tài khoản ngân hàng.
