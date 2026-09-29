# QD-028 — Quản lý chi nhánh tự kích hoạt máy quầy; chỉ tài khoản nhiều chi nhánh mới phải chọn chi nhánh

**Ngày:** 29/09/2026 · **Trạng thái:** ĐÃ CHỐT (chủ dự án, 29/09/2026 — chọn "B. Cho quản lý chi nhánh tự cài máy")
**Sửa:** QD-026 D6 · **Yêu cầu:** DESK-01, DESK-02 · **Kế hoạch:** `30-KeHoach/P21/`

## Bối cảnh

Chủ dự án xem màn **"Chọn chi nhánh cho máy này"** của app TechMenu Thu ngân và thấy không hợp lý: chi nhánh phải do
tài khoản quản lý phân cho nhân viên, tránh nhân viên chi nhánh 2 vào nhầm chi nhánh 1.

Rà code (29/09/2026): nhân viên **đã** gắn cứng một chi nhánh (`memberships.tenant_id`), và đăng nhập POS trên máy
chi nhánh khác bị từ chối ("Tài khoản không thuộc nhà hàng này." — `app/r/[slug]/station-actions.ts`). Màn chọn chi
nhánh chỉ hiện khi **chủ chuỗi** kích hoạt máy, vì QD-026 D6 chỉ cho tài khoản `owner` kích hoạt. Như vậy mỗi máy ở
mỗi chi nhánh đều cần chủ chuỗi tới cài, và chủ phải tự chọn đúng chi nhánh.

## Đối thủ làm thế nào (tra 29/09/2026)

| Đối thủ | Ai đăng nhập app thu ngân | Chi nhánh | Nguồn |
|---|---|---|---|
| KiotViet | Chủ, quản trị chi nhánh, thu ngân | Chủ phân quyền theo **Chi nhánh** cho từng người dùng; form đăng nhập không có ô chi nhánh; đổi chi nhánh ở menu ☰ "thay đổi chi nhánh đăng nhập" | kiotviet.vn/huong-dan-su-dung-kiotviet/fnb-thiet-lap/quan-ly-nguoi-dung/ · kiotviet.vn/ung-dung-kiotviet-thu-ngan/ |
| CUKCUK | Mọi vai trò | Đăng nhập → **"Chọn chi nhánh làm việc"** → Đồng ý, chỉ lần đầu và chỉ ở nhà hàng chuỗi; máy nhớ; một chi nhánh thì bỏ qua bước này | helpv2.cukcuk.vn/vi/kb/dang-nhap-de-bat-dau-lam-viec-nhu-the-nao |
| Sapo FnB | Chủ / quản lý chuỗi bằng mật khẩu; nhân viên bằng mã thiết bị + PIN | Tài khoản nhiều cửa hàng → "chọn cửa hàng cần đăng nhập"; thiết bị tạo trong trang quản trị, gắn cửa hàng | help.sapo.vn/cai-dat-va-dang-nhap-ung-dung-sapo-thu-ngan · help.sapo.vn/thiet-lap-thiet-bi-ban-hang-tren-trang-quan-tri-sapo-fnb |
| iPOS | — | "Phạm vi thương hiệu, cửa hàng" trong cài đặt tài khoản; thiết bị kích hoạt bằng Device Code / QR | fabi-docs.ipos.vn |

**Điểm chung:** chủ gán chi nhánh cho từng tài khoản; chọn chi nhánh diễn ra **sau** đăng nhập và **chỉ khi tài khoản
có nhiều chi nhánh**; một chi nhánh thì vào thẳng; máy nhớ chi nhánh.

## Quyết định

| # | Việc | Chọn |
|---|---|---|
| D1 | Ai kích hoạt được máy quầy | Tài khoản **owner hoặc manager** đang hoạt động của quán (trước: chỉ owner). Thu ngân / phục vụ / bếp → "Chỉ chủ quán hoặc quản lý chi nhánh kích hoạt được máy quầy." |
| D2 | Chọn chi nhánh | Chỉ hiện khi tài khoản thuộc **> 1** chi nhánh đang mở (chủ chuỗi). Quản lý một chi nhánh → vào thẳng chi nhánh của mình. Gửi `tenantId` không thuộc tài khoản → từ chối như không đủ quyền |
| D3 | Chữ trên màn | "Dùng tài khoản **chủ quán** hoặc **quản lý chi nhánh**"; tiêu đề danh sách **"Chọn chi nhánh làm việc"** (theo CUKCUK) |
| D4 | Thu ngân | Vẫn **không** kích hoạt máy; đăng nhập POS trong app bằng email + PIN như nay (QD-009), chỉ vào được chi nhánh của mình |

## Khác đối thủ — lý do

- KiotViet/CUKCUK cho cả thu ngân đăng nhập app. Ở TechMenu, **kích hoạt máy** (một lần, cấp tài khoản `printer`,
  máy khác đang in cho quán sẽ ngừng in) tách khỏi **đăng nhập ca làm** (thu ngân gõ email + PIN mỗi ca). Việc thu ngân
  làm hằng ngày giống đối thủ; việc cài máy giao cho người quản lý chi nhánh vì nó giành quyền in của cả chi nhánh.

## Hệ quả

- Quản lý chi nhánh giờ có thể chuyển máy in của chi nhánh mình sang máy khác (kích hoạt "Có — máy quầy" xoay mật khẩu
  `printer` của quán đó). Không chạm được chi nhánh khác.
- Menu **Đổi chi nhánh** chỉ hiện khi tài khoản kích hoạt có > 1 chi nhánh — máy do quản lý cài không có mục này.
- Chữ trên màn Đăng nhập nằm trong bộ cài app ⇒ cần phát hành bản app mới (1.0.3) để máy đã cài thấy chữ mới; phần kiểm
  quyền ở server có hiệu lực ngay khi deploy web.
