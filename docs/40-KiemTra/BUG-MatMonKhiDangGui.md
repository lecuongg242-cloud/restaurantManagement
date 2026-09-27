# BUG — Món thêm vào trong lúc đang gửi bị mất

> Tìm ra 27/09/2026 khi làm POS điện thoại (P12 · 12-05). Trạng thái: **đã sửa**, có test chặn.

## Triệu chứng

Nhân viên bấm **"Xác nhận thêm"**, và — trong lúc chờ mạng — chạm thêm món khác vào giỏ. Lượt gửi đầu xong
thì món vừa thêm **biến mất khỏi giỏ**: không vào bếp, không báo lỗi. Cùng lỗi ở màn **Bán mang về**
("Tạo đơn mang về").

Máy quầy mạng nhanh ít gặp. **Điện thoại phục vụ** mạng chậm + thao tác nhanh (bấm gửi, quay sang thực đơn
gọi tiếp món khách vừa nhớ ra) là gặp — và không ai biết món thiếu cho tới khi khách hỏi.

## Nguyên nhân

`confirmAdd` (`PosBoard`) và `create` (`TakeawayPanel`) gửi giỏ lúc bấm, rồi khi thành công gọi
`setCart([])` — xóa **cả giỏ hiện tại**, gồm những dòng được thêm SAU lúc bấm gửi.

## Sửa

`lib/orders/cart.ts` · `conLaiSauKhiGui(gioHienTai, daGui)`: chụp giỏ lúc bấm gửi; thành công thì chỉ bỏ
đúng những dòng đã gửi (theo `lineId`), giữ dòng mới. Dùng ở cả hai chỗ.

Giới hạn chấp nhận: sửa **số lượng/ghi chú** của một dòng TRONG LÚC dòng đó đang gửi → phần sửa không vào
lượt này và dòng vẫn bị bỏ (server nhận bản lúc bấm). Hiếm, và không mất món — chỉ mất phần sửa.

## Bằng chứng

- `tests/orders/gio-sau-khi-gui.test.ts` — 3 test hàm thuần.
- `tests/e2e/pos-dien-thoai.spec.ts` › "món thêm vào TRONG LÚC đang gửi không bị mất": làm chậm đúng một server
  action 2 giây, thêm món thứ hai trong lúc chờ → sau khi lượt đầu xong: đúng MỘT đơn mới, giỏ còn **1** món.
- **Đối chứng âm:** trả `confirmAdd` về `setCart([])`, build lại → test **đỏ** (giỏ không còn "1"). Trả lại → xanh.

## Vì sao test cũ không bắt được

Không test nào thao tác trong lúc một lượt gửi còn đang chờ. Lỗi chỉ lộ ra khi E2E điện thoại vô tình làm đúng
như vậy — và bước kiểm "có Đơn #" của chính test đó ban đầu cũng che lỗi (bàn còn đơn cũ nên kiểm "có đơn"
luôn đúng). Sửa test: đếm số đơn trước/sau.
