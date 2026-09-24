# P10 — CHỐT

> Chốt ngày 24/09/2026. Kế hoạch: `00-TongQuan.md` · nghiên cứu `00-NghienCuu-NghiepVu.md` ·
> quyết định `15-QuyetDinh/QD-017`. Báo cáo từng phần: `10-01..10-04-SUMMARY.md`.

## Trạng thái

| Plan | Yêu cầu | Trạng thái | Số đo chính |
|---|---|---|---|
| 10-01 Nguyên liệu, định lượng, công thức lồng | INV-01, 02, 03 | ◐ | Phở bò = 29.353đ đúng tới đồng; vòng/quá 3 cấp bị chặn, DB 0 dòng |
| 10-02 Nhập sáng, chế biến mẻ, số phần POS | INV-04..07 | ◐ | 9/9 trạng thái đơn trên DB thật; POS "còn ~5" → nhãn vàng, **không khóa món**; `menu_portions` 3,9 ms / 310 dòng |
| 10-03 Kiểm kê, xuất hủy, chốt sổ | INV-08, 09 | ◐ | Tự chốt đúng các ngày đã qua; sửa định lượng sau chốt không đổi số; update/delete 0 dòng |
| 10-04 Lãi gộp & hao hụt | REPORT-13, 14 | ◐ | qt-food 571.755.000đ / 5.392 bill: **lệch 0đ**; 400 ngày: 196 ms |
| Xuyên suốt | INV-10 | ☑ | Quán chưa khai nguyên liệu: POS, trang khách, báo cáo y như trước (E2E) |

Toàn bộ: **568 unit · 248 RLS** (ma trận **23 bảng**) · E2E P10 **6/6** + hồi quy POS 3/3 · `tsc` ·
`lint` · `build` sạch · schema khớp. Migration **0045–0049 đã áp** (chỉ thêm bảng/hàm, không đổi bảng
cũ). `lib/orders/create-order.ts` và luồng đóng bill **không đổi một dòng**.

`◐` = code + kiểm tự động xong, chờ checkpoint người thật (ghi ở cuối mỗi summary).

## Quyết định phát sinh khi làm — đã ghi vào QD-017 hoặc summary

1. **Chỉ nguyên liệu đã từng nhập mới tính số phần.** Không có quy tắc này thì muối, nước mắm — khai
   để tính giá vốn nhưng không ai nhập mỗi sáng — làm món nào cũng "có thể đã hết".
2. **Không chốt sổ hôm nay.** Plan có nút "Chốt ngày"; bỏ vì đơn sau lúc chốt sẽ nằm ngoài sổ vĩnh
   viễn. Chỉ tự chốt ngày đã qua.
3. **`bill_items.amount` chưa trừ giảm giá** — phát hiện khi rà schema, sửa QD-017 D8 trước khi code.
4. **Lãi gộp trên doanh thu của đúng các dòng có giá vốn** (thêm migration 0049).

## Ba điều đáng giữ lại từ P10

**1. Rà schema thật trước khi viết plan đã cứu hai lỗi số học.** Doanh thu theo món chưa trừ giảm giá,
và "Σ 4 nguồn = chênh lệch kiểm kê" — cả hai nằm trong tài liệu đã duyệt, cả hai sẽ cho số sai mà
test viết theo tài liệu vẫn xanh.

**2. Test xanh không có nghĩa là test đã kiểm.** E2E báo cáo bản đầu bỏ qua đúng khẳng định quan trọng
nhất vì quán demo không có hóa đơn. Hỏi "test này có thể đỏ không" trước khi tin nó.

**3. Dữ liệu thật chỉ kiểm được những gì dữ liệu thật có.** qt-food đối soát lệch 0đ — nhưng quán
chưa từng giảm giá hay chia bill, nên hai nhánh đó mới chỉ đứng trên dữ liệu dựng.

## Chưa làm / giới hạn còn lại

| Việc | Vì sao |
|---|---|
| qt-food chưa bật P10 | Chờ chủ quán đồng ý; mọi phép thử chạy trên `pho-viet`, `bun-bo` |
| Tài khoản trạm đọc được giá vốn qua PostgREST | RLS chỉ cách ly theo quán; cùng mức rủi ro với báo cáo doanh thu hiện có (QD-005 D7) |
| Lưu định lượng không nằm trong giao dịch | Chèn lỗi thì chèn lại bản cũ; mạng đứt đúng giữa hai lệnh thì món mất định lượng (thấy ngay trên màn) |
| Kiểm kê sau 00:00 tính cho ngày hôm sau | Có chủ ý — một định nghĩa "ngày" cho toàn hệ thống; màn ghi rõ ngày |
| Dự báo lượng mua, menu engineering, nhà cung cấp, nhiều kho | Ngoài phạm vi (QD-017) |
| 11 yêu cầu `◐` | Chờ 4 checkpoint người thật (ghi cuối mỗi summary) |
