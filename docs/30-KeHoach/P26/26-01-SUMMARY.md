# 26-01 + 26-02 — Kết quả thử luồng kho từ đầu tới cuối ở Phở Việt, và bốn chỗ hở đã làm

> Chạy 03/10/2026 trên DB production, chỉ quán demo `pho-viet` (không đụng qt-food). Yêu cầu: INV-13..17, PURCH-07. QD-031.
> Số liệu dưới đây là lượt chạy **sau 26-02** (dữ liệu sinh lại, bia tồn đầu khai bằng "Tồn đầu kỳ"). Lượt trước 26-02 (bia
> tồn đầu bằng kiểm kê) ra tổng 4.259.854₫ — bia −405.000₫ — là bằng chứng của chỗ hở P1.
> Kế hoạch và các phát hiện: `00-TongQuan.md`. **Kịch bản chi tiết (danh mục, 7 ngày, cách tính, 8 tình huống, cách chạy lại):
> `docs/40-KiemTra/KichBan-Kho-PhoViet.md`** — từ 05/10 dữ liệu sinh theo "7 ngày tới hôm qua", chạy lại được mọi ngày.

## File đã đổi

| File | Việc |
|---|---|
| `scripts/seed-kho-demo.mjs` (mới) | Sinh 7 ngày kho cho `pho-viet`: danh mục, đơn bán, phiếu nhập qua đúng RPC của app, mẻ, xuất hủy, kiểm kê. Kho thật được mô phỏng song song để biết trước đáp án (`--out expected.json`) |
| `tests/e2e/kho-thuc-te.spec.ts` (mới) | 7 bước thao tác bằng giao diện trong một ngày, mỗi bước kiểm sổ kho trong DB |
| `lib/purchasing/receipt.ts`, `components/admin/inventory/ReceiptForm.tsx` | Sửa lỗi PURCH-07: phiếu tạm lưu lúc trả đủ, sửa số lượng thì tiền trả vẫn chạy theo cần trả |
| `tests/purchasing/receipt.test.ts` | 4 ca cho `draftPaysInFull` |
| **26-02** `components/admin/inventory/IngredientForm.tsx`, `inventory/actions.ts` (`createIngredient`, `updateIngredient`, `recordOpening`), `inventory/page.tsx` | P1 tồn đầu kỳ (INV-14) |
| **26-02** `components/admin/inventory/CountForm.tsx`, `inventory/count/page.tsx`, `recordCounts`, `lib/inventory/count.ts` (`parseCount`, `countToBase`) | P2 chọn đơn vị khi kiểm kê (INV-15), P4 ô gõ sai (INV-17) |
| **26-02** `inventory/count/page.tsx`, `inventory/stock/page.tsx`, `cancelWaste`, `cancelBatch` | P3 hủy phiếu hủy / mẻ (INV-16) |
| `tests/inventory/count.test.ts` | 3 ca `parseCount` / `countToBase` |
| `tests/e2e/inventory.spec.ts`, `p25-nhap-kiem-ke.spec.ts` | Spec cũ giả định quán demo chưa có dữ liệu kho (lấy "món đầu tiên", "không còn nhãn nào"); sửa cho chạy được khi quán có kho thật. **Spec cũ đã ghi đè rồi xóa mất dòng "Bánh phở 150 g" của Phở ngựa — đã khôi phục** |
| `docs/15-QuyetDinh/QD-031-TonDauKyVaSuaPhieuKho.md` | Quyết định 26-02 |
| `components/admin/inventory/BatchForm.tsx` | Dòng "Trừ:" ở form Chế biến thiếu đơn vị ("Xương ống bò 8 · Hành tây 800") → "Xương ống bò 8 kg · Hành tây 800 g" |
| `docs/20-DanhSachYeuCau/00-Requirements.md` | Thêm INV-13, PURCH-07 |

Dữ liệu: `tenants.paid_until` của `pho-viet` từ 25/09 (đã hết hạn, chủ quán bị khóa mọi quyền) gia hạn thành **31/12/2026** để test được.

## Bằng chứng

### 1. Bảy ngày lịch sử (26/09–02/10): bản chốt khớp đáp án từng ô

App tự chốt 7 ngày khi mở khu Nguyên liệu (`ensureClosedThrough`, log `closed: 7`). Đối chiếu từng ô bản chốt với sổ tính
độc lập bằng JS (tồn đầu, nhập, mẻ ra/vào, 4 loại hủy, lệch kiểm kê, dùng theo đơn, hủy sau in, hụt mẻ, tồn cuối, giá ngày):

```
So khớp 1575 ô, lệch 0 ô
Đáp án hao hụt 7 ngày (đ): { cancel: 1015834, shortfall: 138087, waste: 708000, unexplained: 2847933 } tổng 4709854
```

Báo cáo → 26/09–02/10, khối Hao hụt (ảnh `anh/11-bao-cao-hao-hut-26-09-den-02-10.png`):

| | App | Đáp án |
|---|---|---|
| Tổng hao hụt | 4.709.854₫ · 5,4% doanh thu món | 4.709.854₫ |
| Hủy sau khi đã làm | 1.015.834₫ | 1.015.834₫ |
| Hụt khi chế biến mẻ | 138.087₫ | 138.087₫ |
| Xuất hủy có lý do | 708.000₫ | 708.000₫ |
| Không giải thích được | 2.847.933₫ | 2.847.933₫ |

App tìm đúng những gì đã cài ẩn trong kho thật:

| Cài ẩn | App thấy |
|---|---|
| Bếp múc thịt bò dư 12% | Bò "không giải thích" 1.677.743₫, nhãn **"có thể định lượng khai sai"**; % dùng được tự tính **89%** (thật 1/1,12 = 89,3%) |
| Gà lọc xương còn 85% | Nhãn "có thể định lượng khai sai"; % dùng được **85%** |
| Múc nước dùng 0,42 l thay 0,4 l | Nhãn "có thể định lượng khai sai" (bán thành phẩm không có % dùng được → luôn ở "không giải thích") |
| Bánh phở dư 3%, tôm 2% | % dùng được 97%, 98% |
| Thịt ngựa đúng định lượng | Lệch −199₫ cả tuần (do làm tròn khi cân) |
| Giò hỏng 800 g đổ bỏ không ghi phiếu (01/10) | Giò lệch −760 g ngày 01/10 |
| Mất 3 chai bia (30/09) | Bia "không giải thích" **45.000₫** = đúng 3 chai × 15.000₫ (trước 26-02: −405.000₫ vì 30 chai tồn đầu khai bằng kiểm kê) |

Các ca sửa phiếu trong lịch sử đều ra đúng sổ: nhập nhầm 165 kg → Hủy bỏ (dòng sổ bị xóa, phiếu chi hủy theo) → Sao chép →
16,5 kg; phiếu tạm tối 29/09 sửa số sáng 30/09 rồi Hoàn thành (vào kho ngày 30/09); sửa ngày chứng từ; nhập bổ sung chiều
01/10 giá 300.000₫ (giá ngày = bình quân gia quyền); dòng "cô Hoa cho thêm" không giá (không làm lệch giá ngày); kiểm kê gõ
13.500 g rồi đếm lại 1.350 g (hai dòng lệch cộng lại đúng bằng một lần đếm đúng).

### 2. Hôm nay 03/10 — thao tác bằng giao diện

`npx playwright test tests/e2e/kho-thuc-te.spec.ts` (dev server :3005, DB production):

| Bước | Kết quả | Ảnh |
|---|---|---|
| 1. Nhập 40 kg bò thay 4 → Hủy bỏ → Sao chép → sửa 4 → Hoàn thành; sửa ngày chứng từ | ✅ dòng sổ phiếu sai bị xóa, phiếu chi 1.000.000₫ chuyển "Đã hủy", phiếu mới +4.000 g giá 285đ/g, `copied_from` đúng | 01–04 |
| 2. Phiếu gà/giò hôm qua (ngày ĐÃ chốt) sai giá → Hủy bỏ → Sao chép sửa giá giò 90.000 | ✅ dòng `receipt` âm hôm nay, không giá; bản chốt 02/10 không đổi một byte; nợ anh Bình giảm đúng 17.500₫ | 05 |
| 3. Lưu tạm bia 1 thùng → mở lại sửa 2 thùng → Hoàn thành (chuyển khoản) | ❌ lần đầu: phiếu chi chỉ 360.000₫, **ghi nợ 360.000₫ ngoài ý muốn** → sửa (PURCH-07) → ✅ phiếu chi 720.000₫ | 06 |
| 4. "Lấy hàng lần trước" → điền 5 dòng, bỏ trống các dòng còn lại | ✅ đúng 5 dòng sổ | 07 |
| 5. Nấu 1 mẻ nước dùng thực 28,5 l | ✅ +28,5 l, xương −8 kg, hụt 1,5 l | — |
| 5b. Ghi nhầm thêm 2 mẻ (60 lít) → "Mẻ hôm nay" → **Hủy** | ✅ (26-02) nước dùng −60 l, xương +16 kg, chỉ còn mẻ 28,5 l | 08a |
| 6. Xuất hủy rau 0,3 kg, cơm nhân viên gà 0,5 kg, **gõ nhầm tôm 3 kg** → **Hủy** → ghi lại 0,3 kg | ✅ (26-02) tồn tôm cộng lại 3 kg; sổ chỉ còn một dòng −300 g. Trước 26-02: không sửa được, báo cáo sai nguồn ("Xuất hủy" +690.000₫, "Không giải thích" −695.000₫) | 08, 08b |
| 7. Kiểm kê: gõ "-0,3" → **"Số không hợp lệ"**, Hoàn thành không gửi; gõ 16 thay 1,6 kg → "Lệch lớn", hỏi lại → Hủy: 0 dòng → sửa; bia chọn **"cái"**, gõ 68 | ✅ (26-02) sổ bia **68** chai. Trước 26-02: chỉ gõ được thùng, 69 chai thành 69,12 | 09, 09a, 10 |
| 8. Thêm "Nước mắm" kèm **Tồn hiện có** 6 chai (500 ml/chai, 60.000₫) | ✅ (26-02) một dòng `receipt` 3.000 ml, 120₫/ml, "Tồn đầu kỳ", không gắn phiếu nhập; Tồn kho "6 chai (3.000 ml)". Nguyên liệu thêm không kèm tồn → Sửa có ô → khai 0,5 kg → lần sau không còn ô; Thịt bò (đã có phát sinh) không có ô | 11a |

POS thật (bàn T2, ảnh 12–14): gọi Phở bò tái (Vừa + Thêm thịt) + Bia → bò giảm **146,067 g** = (80 + 50) ÷ 89%; bấm "Phiếu
bếp" rồi "Hủy" món phở → bò không cộng lại, `cancel_usage` = 146,067 g (hủy sau khi làm). Bún bò hiện "Có thể đã hết — hãy
hỏi bếp" khi giò âm.

Đối chiếu sổ hôm nay (JS độc lập ↔ `inventory_day` sẽ chốt đêm nay ↔ `inventory_on_hand` của tab Tồn kho):
`Khớp 15/15 nguyên liệu`.

### 3. Hồi quy

| Lệnh | Kết quả |
|---|---|
| `npx tsc --noEmit` | 0 lỗi |
| `npm test` | 96 file, **1.018/1.018** |
| `npx playwright test p20-nhap.spec.ts p25-nhap-kiem-ke.spec.ts` | 4/4 |
| `npx playwright test kho-thuc-te.spec.ts` (sau 26-02, dữ liệu sinh lại, chạy liền một lượt) | **8/8** |
| `npx playwright test inventory.spec.ts p20-nhap.spec.ts p25-nhap-kiem-ke.spec.ts` (cổng 3000) | 6/6 + 2/2 + 2/2 |
| `npm test` sau 26-02 | 96 file, **1.021/1.021** |

## Trạng thái cam kết

| Mã | Trạng thái |
|---|---|
| INV-13 | ☑ |
| PURCH-07 | ☑ (chưa deploy) |
| INV-14 tồn đầu kỳ | ☑ (chưa deploy) |
| INV-15 chọn đơn vị khi kiểm kê | ☑ (chưa deploy) |
| INV-16 hủy phiếu hủy / mẻ | ☑ (chưa deploy) |
| INV-17 ô kiểm kê gõ sai | ☑ (chưa deploy) |

**Ghi chú vận hành:** trong lúc chạy có một `next dev` khác (cổng 3000) dùng chung thư mục `.next` với dev server :3005 của
lượt thử → :3005 hỏng (mọi trang 404). Đã tắt :3005, chạy E2E hồi quy qua :3000; không đụng tiến trình :3000.
