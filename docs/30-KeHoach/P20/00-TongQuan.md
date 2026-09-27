# P20 — Mua hàng, nhà cung cấp, công nợ, sổ thu chi (ĐỂ SAU)

> Lập 27/09/2026. **Trạng thái: ĐỂ SAU** — chủ dự án chốt 27/09/2026. Đây là khung phạm vi, **chưa** có plan chi tiết; khi xếp lịch:
> viết QD + yêu cầu PURCH-xx + plan 20-0x theo khuôn P13. Phụ thuộc: P10 (kho, nhập buổi sáng), P15 (chuyển kho giữa chi nhánh).

## Phạm vi dự kiến

| Việc | Nội dung tối thiểu |
|---|---|
| Nhà cung cấp | Danh mục: tên, SĐT, MST, nguyên liệu thường mua, giá gần nhất |
| Đơn mua hàng | Tạo đơn (có thể từ gợi ý nhập P18 18-02) → nhận hàng → sinh phiếu nhập kho P10 (`stock_entries`) |
| Công nợ | Mua chịu: nợ theo nhà cung cấp, trả một phần, lịch sử; tuổi nợ |
| Sổ thu chi | Chi ngoài nguyên liệu (điện, nước, lương, thuê nhà), thu khác; tổng hợp cùng doanh thu → lãi lỗ đơn giản |
| Chuyển kho | Giữa chi nhánh cùng thương hiệu / bếp trung tâm (chi nhánh = tenant, QD-023 ⇒ phiếu xuất ở A + phiếu nhập ở B trong một giao dịch) |

## Câu hỏi cần chốt khi xếp lịch

1. Sổ thu chi có cần khớp mẫu sổ hộ kinh doanh (TT 152/2025, P14 14-04) không?
2. Chuyển kho giữa chi nhánh tính theo giá vốn nào (bình quân / nhập gần nhất)?
3. Có cần phân quyền riêng cho người mua hàng (vai trò mới) không?

## Phát hiện khi rà code (27/09/2026)

- Kho P10: nhập buổi sáng (`stock_entries`), mẻ chế biến (`production_batches`), chốt sổ ngày bất biến (`daily_closes`) — đơn mua hàng
  phải sinh phiếu nhập **trước** khi ngày bị chốt, hoặc ghi sang ngày nhận thực tế.
- Chưa có khái niệm nhà cung cấp hay giá mua theo nhà cung cấp.
