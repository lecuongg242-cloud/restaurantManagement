# P26 — Thử luồng kho từ đầu tới cuối bằng dữ liệu thật ở Phở Việt

> Lập 03/10/2026. **Trạng thái: 26-01 + 26-02 XONG, chưa deploy.** Chủ dự án giao "tự triển khai hết" P1–P4 (03/10/2026).
> Yêu cầu: INV-13..17, PURCH-07. Quyết định: QD-031. Kết quả: `26-01-SUMMARY.md` (có phần 26-02).
> Phụ thuộc: P10 (kho), P20 (phiếu nhập), P25 (kiểm kê).

## Vì sao làm

Chủ dự án (03/10/2026): làm luồng nhập kho và tính hao hụt từ số liệu đơn hàng **từ đầu tới cuối**, tạo dữ liệu ở Phở Việt,
có cả trường hợp nhập rồi phải sửa phiếu, thử nhiều luồng nghiệp vụ thực tế.

Code kho đã đủ các mảnh (P10, P20, P25), nhưng chưa có lần nào chạy cả chuỗi trên dữ liệu giống quán thật: nhiều ngày, nhiều
nhà cung cấp, sửa phiếu, kiểm kê sai rồi sửa. Phở Việt lúc bắt đầu chỉ có 1 nguyên liệu, 0 định lượng.

## Cách thử

1. **Kho thật mô phỏng song song** (`scripts/seed-kho-demo.mjs`): 15 nguyên liệu (thịt, bánh phở, bia thùng 24 chai, nước
   dùng tự nấu…), định lượng 7 món + 2 topping, 4 NCC. Bảy ngày 26/09–02/10, mỗi ngày 70–95 lượt khách. Kho thật lệch khỏi
   định lượng theo cách đã cài sẵn: bếp múc bò dư 12%, gà lọc xương còn 85%, mất 3 chai bia, giò hỏng 800 g không ghi phiếu.
   Số đếm kiểm kê lấy từ kho thật nên **đáp án đã biết trước**, hệ thống phải tự tìm ra.
2. **Phiếu nhập, mẻ đi qua đúng RPC của app**, dưới danh nghĩa chủ quán, rồi lùi ngày giờ về ngày mô phỏng.
3. **Hôm nay làm bằng giao diện** (`tests/e2e/kho-thuc-te.spec.ts`) và POS thật.
4. **Đối chiếu**: sổ tính độc lập bằng JS so với bản chốt sổ, báo cáo Hao hụt, `inventory_day`, tab Tồn kho.

| Ca nghiệp vụ | Ở đâu |
|---|---|
| Nhập gõ nhầm (165 kg thay 16,5) → Hủy bỏ → Sao chép → sửa → Hoàn thành | 27/09 + hôm nay (UI) |
| Phiếu ngày đã chốt sai giá → Hủy bỏ (dòng âm hôm nay) → Sao chép sửa giá | hôm nay (UI) |
| Phiếu tạm tối hôm trước, sáng sau sửa số rồi Hoàn thành | 29–30/09 + hôm nay (UI) |
| Sửa ngày chứng từ, ghi chú phiếu đã nhập | 01/10 + hôm nay (UI) |
| Hai lần nhập một ngày khác giá; dòng không giá; giảm giá; trả một phần / ghi nợ / chuyển khoản | 26/09–02/10 |
| Nấu mẻ nước dùng hụt 0,5–1,5 lít | mỗi ngày |
| Xuất hủy: rau héo, cơm nhân viên, bia vỡ, tôm ươn; gõ nhầm 3 kg thay 0,3 | mỗi ngày + hôm nay |
| Món hủy trước / sau khi in phiếu bếp; topping "Thêm thịt", "Thêm bánh" | mỗi ngày + POS thật |
| Kiểm kê gõ nhầm (82 thay 8,2) rồi đếm lại | 30/09 + hôm nay (UI) |
| Bán trước, nhập sau (tồn âm) | hôm nay |

## Kết quả ngắn

- **Số đúng tuyệt đối**: 1.575/1.575 ô bản chốt 7 ngày khớp đáp án. Hao hụt 7 ngày đúng tới từng đồng ở cả 4 nguồn (4.259.854₫ lượt đầu; 4.709.854₫ sau 26-02 khi bia tồn đầu khai đúng cách).
  Sổ hôm nay khớp 15/15. "% dùng được" tự tính: gà 85% (thật 85%), bò 89% (thật 89,3%).
- **Một lỗi đã sửa (PURCH-07)**: phiếu tạm lưu lúc trả đủ, mở lại sửa số lượng → tiền trả đứng yên → Hoàn thành **ghi nợ NCC
  ngoài ý muốn** (thử thật: 360.000₫).
- **Một lỗi hiển thị đã sửa**: form Chế biến "Trừ: Xương ống bò 8 · Hành tây 800" thiếu đơn vị.
- **Bốn chỗ hở nghiệp vụ** P1–P4 (dưới) — đã làm theo cách đối thủ ở 26-02 (QD-031).

## Đối thủ làm thế nào (tra 03/10/2026, trang hướng dẫn chính thức)

| | KiotViet | Sapo FnB | CUKCUK | iPOS / POS365 |
|---|---|---|---|---|
| **Tồn đầu kỳ** | Ô **"Tồn kho"** khi tạo hàng hóa (theo đơn vị cơ bản), hoặc "Nhập file" | Ô **"Số lượng ban đầu"** khi "Tạo nguyên liệu" | **Thiết lập → Nhập số dư ban đầu → tab Tồn kho → "Nhập tồn kho"**; ghi rõ "không dùng để điều chỉnh tồn phát sinh" — **tách khỏi kiểm kê** | iPOS: **Cài đặt → Tồn đầu**, "khai báo trước khi phát sinh nhập/xuất" |
| **Đơn vị khi kiểm kho** | Dòng nào nhiều đơn vị thì **chọn đơn vị ngay trên dòng** | Có cột Đơn vị (không nói chọn được) | Có cột ĐVT (không nói) | — |
| **Phiếu xuất hủy sai** | Trạng thái Phiếu tạm / Hoàn thành / Đã hủy. Đã hoàn thành: sửa ngày, ghi chú; **"Hủy"** (cộng lại tồn) + **"Sao chép"** | Mở phiếu → **"Hủy phiếu"** | **"Sửa"** hoặc **"Xóa"** | — |
| **Phiếu chế biến / sản xuất sai** | **"Hủy"** (cộng lại nguyên liệu, trừ thành phẩm) + "Sao chép" | — | Xóa phiếu (xóa phiếu xuất NVL đi kèm trước) | POS365: **"Hủy"** rồi mới "Xóa" |
| Chặn số âm khi kiểm kho | Không thấy nói | Không thấy | Không thấy | Không thấy |

Nguồn: [CUKCUK – Tồn kho đầu kỳ](https://helpv2.cukcuk.vn/vi/kb/1070200_ton_kho_dau_ky) ·
[iPOS – Khởi tạo dữ liệu](https://huongdan.ipos.vn/docs/huong-dan-su-dung-ipos-inventory/khoi-tao/khoi-tao-du-lieu-van-hanh/) ·
[Sapo – Tạo nguyên liệu](https://help.sapo.vn/tao-nguyen-lieu-tren-trang-quan-tri-sapo-fnb) ·
[KiotViet – Danh mục hàng hóa](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/danh-muc-hang-hoa-booking/) ·
[KiotViet – Tạo phiếu kiểm kho](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/huong-dan-kiem-kho/tao-phieu-kiem-kho/) ·
[KiotViet – Xuất hủy](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/quan-ly-giao-dich/xuat-huy/) ·
[KiotViet – Sản xuất](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/huong-dan-hang-hoa/san-xuat-hang-hoa-retail/) ·
[Sapo – Phiếu xuất kho](https://help.sapo.vn/quan-ly-danh-sach-phieu-xuat-kho-tren-trang-quan-tri-sapo-fnb) ·
[CUKCUK – Xuất kho](https://helpv2.cukcuk.vn/vi/kb/1010300_xuat_kho) ·
[POS365 – Hủy/xóa chứng từ sản xuất](https://www.pos365.vn/docs/huy-va-xoa-chung-tu-san-xuat-va-so-che-2277.html).

## Bốn chỗ hở và cách đã làm (chủ dự án giao tự triển khai, 03/10/2026)

| # | Chỗ hở (thấy khi thử) | Hậu quả | Đề xuất (theo đối thủ) |
|---|---|---|---|
| **P1** | **Không có chỗ khai tồn đầu kỳ.** Quán bắt đầu dùng kho đang có sẵn 30 chai bia → cách duy nhất là kiểm kê → hệ thống coi là "dư không giải thích" | Báo cáo tuần: bia **−405.000₫** (dư), che mất vụ mất 3 chai; "% dùng được" của bia bị đẩy lên 100% | Như Sapo / KiotViet: form "+ Nguyên liệu" thêm ô **"Tồn hiện có"** (không bắt buộc, theo đơn vị nhập). Nguyên liệu chưa có dòng sổ nào thì form **Sửa** cũng có ô này (đã làm: không thêm nút riêng, dùng chung ô cho gọn). Ghi là tồn đầu, **không** vào hao hụt và % dùng được (như CUKCUK tách khỏi kiểm kê) |
| **P2** | **Kiểm kê chỉ gõ được theo đơn vị nhập.** Bia khai "thùng = 24 chai": còn 69 chai phải tự chia, gõ 2,88 thùng | Sổ thành **69,12 chai**, lệch −0,88 chai thay vì −1 | Như KiotViet: dòng có đơn vị nhập khác đơn vị trừ kho thì có ô chọn **"thùng / chai"** ngay cạnh ô Thực tế (mặc định đơn vị nhập) |
| **P3** | **Phiếu xuất hủy, phiếu chế biến ghi nhầm không sửa / hủy được.** Gõ tôm 3 kg thay 0,3 kg | Tôm có kiểm kê: tổng đúng nhưng **sai nguồn** ("Xuất hủy" +690.000₫, "Không giải thích" −695.000₫). Rau không kiểm kê: tồn **sai mãi** | Như KiotViet: danh sách phiếu hủy hôm nay và mẻ hôm nay có nút **"Hủy"** (hỏi lại; cộng lại tồn, mẻ thì trả nguyên liệu và trừ bán thành phẩm). Ngày đã chốt: ghi dòng ngược vào hôm nay như hủy phiếu nhập (QD-027 D5) |
| **P4** | Ô kiểm kê gõ **số âm** ("-0,3"): màn hình coi như chưa đếm (hiện "—"), nhưng bấm Hoàn thành thì server **từ chối cả phiếu** | Mất số đếm của mọi dòng khác, người dùng không biết dòng nào sai | Dòng đó hiện chữ đỏ **"Số không hợp lệ"** và chặn "Hoàn thành" tới khi sửa (đối thủ không nói gì — đề xuất riêng) |

Nhận xét, **không** đề xuất đổi (đã đúng quyết định cũ, ghi lại để chủ dự án biết):
- Hao hụt hôm nay chỉ hiện ở Báo cáo từ **ngày hôm sau** (đọc từ bản chốt), dù kiểm kê xong lúc 21:45.
- "% dùng được" gộp mọi hao hụt khi dùng (chủ dự án chốt 29/09). Vì thế bếp múc dư đều đặn sẽ dần "được giải thích" bởi % dùng
  được: giá vốn đúng hơn, nhưng sau ~14 lần kiểm kê nhãn "có thể định lượng khai sai" sẽ tắt. Giò hỏng 800 g một lần cũng
  kéo % dùng được của giò xuống 97% trong 14 lần kiểm kê sau.
- Món hủy khi phiếu bếp đang chờ / in lỗi vẫn tính là "đã làm" (quy ước 0037: thà tính dư).
- Phiếu "Sao chép" có tiền trả 0 nên form tự chọn "Chưa trả (ghi nợ)". Đúng, vì phiếu chi cũ đã hủy, nhưng người dùng phải
  nhớ chọn lại cách trả.

## Giao diện đã làm (26-02)

| Màn | Thay đổi | Điện thoại |
|---|---|---|
| Nguyên liệu → form **"Thêm nguyên liệu"** | Ô mới **"Tồn hiện có (không bắt buộc)"** + chữ đơn vị (đơn vị nhập, ví dụ "chai"), dòng giải thích "Hàng đang có sẵn trong kho lúc bắt đầu dùng… Chỉ khai một lần, trước khi nhập / xuất; không tính vào hao hụt" | Ô một cột như các ô khác |
| Nguyên liệu → thẻ → **"Sửa"** | Có cùng ô đó **chỉ khi** nguyên liệu chưa có nhập / xuất nào; đã có thì không hiện | — |
| Kiểm kê & hủy → **Kiểm kê cuối ngày** | Cạnh ô Thực tế: ô chọn đơn vị (**thùng / cái**, **kg / g**) cho dòng có hai đơn vị; Tồn kho, SL lệch, Giá trị lệch đổi theo. Gõ sai: cột SL lệch hiện đỏ **"Số không hợp lệ"**, cạnh nút "Hoàn thành" hiện "Số đếm không hợp lệ: Tôm sú — sửa hoặc xóa trống ô đó", bấm không gửi | Không cuộn ngang ở 360px (E2E P25 "B") |
| Kiểm kê & hủy → **Xuất hủy** | Tiêu đề **"Phiếu hủy hôm nay"**; mỗi dòng có nút **"Hủy"** → hộp "Hủy phiếu hủy Tôm sú 3 kg? Tồn kho được cộng lại." | Nút cao 44px |
| Tồn kho → **Chế biến** | Danh sách mới **"Mẻ hôm nay"**: "17:25 · 2 mẻ Nước dùng phở · thực 60 lít (công thức 60 lít)" + nút **"Hủy"** → hộp "Hủy mẻ… Nguyên liệu được trả lại, bán thành phẩm bị trừ." Dòng "Trừ:" có đơn vị | Nút cao 44px |

Ảnh: `anh/08-xuat-huy-go-nham.png`, `08a-me-hom-nay-ghi-nham.png`, `08b-xuat-huy-da-sua.png`, `09a-kiem-ke-so-am.png`,
`10-kiem-ke-sua-so-bia-theo-chai.png`, `11a-them-nguyen-lieu-ton-hien-co.png`.

## Kế hoạch

| Phần | Nội dung | Trạng thái |
|---|---|---|
| 26-01 | Dữ liệu + thử + sửa PURCH-07 + đơn vị dòng "Trừ:" | ✅ `26-01-SUMMARY.md` |
| 26-02 | P1–P4 theo cách đối thủ (QD-031) | ✅ `26-01-SUMMARY.md` mục 26-02 |

Dữ liệu demo giữ nguyên ở `pho-viet` (sinh lại sau 26-02, bia khai bằng "Tồn đầu kỳ"): Nguyên liệu → Tồn kho / Kiểm kê & hủy;
Nhập hàng; Nhà cung cấp; Báo cáo chọn 26/09–02/10 (tổng hao hụt 4.709.854₫).
