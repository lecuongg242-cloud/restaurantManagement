# P30 — Quản trị trong app Thu ngân + app "TechMenu Quản lý" cho chủ quán

> Lập 04/10/2026. Plan là hợp đồng và nghiệm thu, không phải bản nháp code. **Trạng thái: ĐÃ CHỐT 04/10/2026** (chủ dự án: "ok triển khai" — giữ
> toàn bộ Giao diện như đề xuất + tên "TechMenu Quản lý", mã gói `vn.techmenu.quanly`).
> MGR-01..08 (`20-DanhSachYeuCau/00-Requirements.md`). Plan chi tiết: `30-0x-PLAN.md`. **30-01, 30-02, 30-03 CODE XONG 04/10/2026 (chưa deploy / phát hành)** — `30-0x-SUMMARY.md`.

## Vì sao làm

Chủ dự án (04/10/2026), sau khi tạo quán thật "Nhà hàng Hùng Hiếu": "có vẻ như màn admin chưa có ở app Windows và Android đúng
không?" → muốn **cả hai**: (1) mở được Quản trị ngay trong app "TechMenu Thu ngân", (2) một app riêng cho chủ quán trên điện thoại.

Hiện tại: app Thu ngân chỉ có **Thu ngân + Màn bếp** (QD-026 D7, chốt 29/09). Chủ quán vào quản trị bằng trình duyệt
(`/r/{slug}/admin`). Trang admin có menu cho điện thoại nhưng là trang máy tính thu nhỏ — xem doanh thu trên điện thoại phải
cuộn nhiều, không giống app quản lý của đối thủ.

**P30 xong khi:**
1. Ở máy quầy (Windows/Android), bấm ☰ → **Quản trị** → đăng nhập chủ/quản lý → trang quản trị mở trong cửa sổ riêng; thu ngân
   đang bán ở POS **không bị đăng xuất**.
2. Chủ quán cài **TechMenu Quản lý** (Android APK, hoặc "Thêm vào màn hình chính" trên iPhone) → đăng nhập → thấy doanh thu hôm
   nay, hóa đơn, báo cáo, bật/tắt món hết hàng — trên màn gọn cho điện thoại.

## Đối thủ làm thế nào (tra 04/10/2026)

| | KiotViet | Sapo FnB | CUKCUK | iPOS | POS365 |
|---|---|---|---|---|---|
| Quản trị từ máy thu ngân | Web: Quản lý ↔ Thu ngân cùng một lần đăng nhập. App Windows: hướng dẫn mở "màn hình **Quản lý** … trên trình duyệt web" | Không có lối từ máy tính tiền; quản trị là web riêng `fnb.mysapo.vn` | Không thấy; quản trị là web riêng `*.cukcuk.vn` | Không thấy; CMS web riêng, quyền `POS_CMS` tách khỏi `POS_Client` | Màn đăng nhập có 2 nút **"Quản lý"** / **"Bán hàng"**; từ Quản lý sang "Màn hình thu ngân" |
| App chủ quán | **"KiotViet Quản lý Nhà hàng"** (iOS + Android) | **"Sapo - Quản lý nhà hàng"** (iOS + Android) | **"CUKCUK – Quản lý"** / "Manager – CUKCUK" | **"FABi Manager"** (iOS + Android) | **"POS365 BOSS"** (iOS + Android) |
| Đăng nhập app chủ | Tên gian hàng + Tên đăng nhập + Mật khẩu | Chủ: SĐT + mật khẩu (hoặc Google/OTP) → **chọn cửa hàng** | Tên miền nhà hàng + tài khoản + mật khẩu | Email + mật khẩu; "Lưu thông tin tài khoản ở thiết bị này" | (?) |
| Nội dung | "Menu tính năng": **Hàng hóa** (thêm/sửa/xóa, nút "Lưu"), **Hóa đơn** (xem, lọc chi nhánh, **"Hủy đơn"**, "In"), báo cáo doanh thu, so sánh chi nhánh, bán chạy/bán chậm | Màn tổng quan + chuông; nút **"Thêm"** góc dưới phải → "Quản lý mặt hàng" → **tạo/sửa thực đơn** | **Báo cáo** (doanh thu, theo mặt hàng, thu chi, chi tiết hóa đơn, so sánh chi nhánh — lọc **"Tất cả chi nhánh"**), **Thông báo**, **Khác/Thực đơn** (sửa món, ẩn món) | Báo cáo (dashboard, >15 loại), thông báo, chấm công, kế toán; sửa món: (?) | Doanh thu, lãi lỗ, tồn kho; **bàn nào đang ngồi, từ mấy giờ, gọi gì** |
| Thông báo đẩy | (FnB: ?) | Bật/tắt từng loại: đơn mới, đặt bàn, **hủy đơn/xóa món**, QR… | Chọn loại + thời điểm; **duyệt hủy món từ xa** | Có | Khách vào, gọi món, thanh toán |

Nguồn: [KiotViet – bán hàng FnB](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/huong-dan-bar-cafe-nha-hang/ban-hang-bar-cafe-nha-hang/) ·
[KiotViet – app Thu ngân máy tính](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/fnb-che-bien/ung-dung-kiotviet-thu-ngan-may-tinh/) ·
[KiotViet – đăng nhập mobile](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/dang-nhap-dang-xuat-man-fnb/) ·
[KiotViet – Hàng hóa mobile](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/ung-dung-bar-cafe-nha-hang-tren-mobile/hang-hoa-mobile-fnb/) ·
[KiotViet – Hóa đơn mobile](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/ung-dung-bar-cafe-nha-hang-tren-mobile/hoa-don-mobile-fnb/) ·
[KiotViet Quản lý – App Store](https://apps.apple.com/vn/app/kiotviet-qu%E1%BA%A3n-l%C3%BD-nh%C3%A0-h%C3%A0ng/id1421096863) ·
[Sapo – màn máy tính tiền](https://help.sapo.vn/man-hinh-may-tinh-tien-fnb) ·
[Sapo – các app FnB](https://www.sapo.vn/app-sapo-fnb-quan-ly.html) ·
[Sapo – đăng nhập app quản lý](https://help.sapo.vn/dang-nhap-phan-mem-sapo-quan-ly-nha-hang-va-dich-vu-tren-website-va-ung-dung) ·
[Sapo – tạo thực đơn trên app](https://help.sapo.vn/tao-thuc-don-tren-trang-quan-tri-sapo-fnb) ·
[Sapo – cài đặt thông báo](https://help.sapo.vn/cai-dat-thong-bao-tren-ung-dung-sapo-quan-ly-nha-hang) ·
[CUKCUK – app quản lý](https://helpv2.cukcuk.vn/vi/kb/ung_dung_danh_cho_quan_ly) ·
[CUKCUK – thông báo kinh doanh](https://helpv2.cukcuk.vn/vi/kb/qlnh-muon-thuong-xuyen-cap-nhat-tinh-hinh-kinh-doanh-tai-nha-hang-thi-lam-the-nao) ·
[CUKCUK – báo cáo nhiều chi nhánh](https://helpv2.cukcuk.vn/vi/kb/quan-ly-cua-nhieu-chi-nhanh-trong-chuoi-muon-xem-so-lieu-bao-cao-cua-cac-chi-nhanh-thi-lam-the-nao) ·
[CUKCUK – duyệt hủy món](https://helpv2.cukcuk.vn/vi/kb/thiet_lap_cho_thu_ngan_muon_huy_mon_huy_order_phai_co_su_xac_nhan_cua_quan_ly_nha_hang_the_nao) ·
[iPOS – chức vụ/quyền](https://huongdan.ipos.vn/docs/tai-lieu-cap-nhat-tinh-nang-fabi/fabi-release-t3-2023/tinh-nang-tao-chuc-vu/tao-chuc-vu-moi/) ·
[FABi Manager – App Store](https://apps.apple.com/vn/app/fabi-manager/id1485270319?l=vi) ·
[POS365 – đăng nhập](https://www.pos365.vn/dang-nhap-pos365-tren-may-tinh-8557.html) ·
[POS365 BOSS – App Store](https://apps.apple.com/us/app/id1362952861). (?) = chưa xác minh được. Tên chính xác các tab thanh dưới
của KiotViet / FABi / POS365 BOSS **chưa xác minh** (Google Play không đọc được) — cần xem video hoặc cài app thật nếu muốn khớp từng chữ.

**Làm theo:** (1) app chủ quán **tách riêng** khỏi app thu ngân, tên có chữ "Quản lý" (5/5 hãng); (2) app chủ tập trung **xem**:
doanh thu có so sánh, hóa đơn có lọc, báo cáo bán chạy, lọc **"Tất cả chi nhánh"**; (3) sửa nhẹ được trên app: **thực đơn** (KiotViet,
Sapo, CUKCUK); việc sâu vẫn làm trên trang quản trị web; (4) vào app quản lý chỉ dành cho vai trò quản lý (owner/manager).

**Khác đối thủ (chủ dự án đã đồng ý 04/10/2026):**
- **Quản trị mở được ngay trong app Thu ngân** (đối thủ đưa ra trình duyệt) — chủ dự án chọn "cửa sổ riêng trong app".
- **iPhone dùng web app** ("Thêm vào màn hình chính"), không lên App Store — chủ dự án chọn; tránh phí Apple ~99 USD/năm + máy Mac.
- **Android phát hành APK**, không qua Google Play — như app Thu ngân (QD-030).
- **Chưa có thông báo đẩy** ở P30 — chủ dự án bỏ qua đợt này (đối thủ đều có; làm ở phase sau).
- Đăng nhập **Email + Mật khẩu** rồi chọn quán (như app Thu ngân, như FABi), không gõ "tên gian hàng" như KiotViet.

## Các đợt

| Đợt | Nội dung | Xong khi (đo được) | Ước lượng |
|---|---|---|---|
| 30-01 | **☰ → Quản trị** trong app Thu ngân Windows + Android: cửa sổ riêng, phiên đăng nhập riêng | Máy quầy đang đăng nhập thu ngân → mở Quản trị → đăng nhập chủ → sửa giá 1 món → đóng → POS vẫn là thu ngân, món có giá mới | 2–3 ngày |
| 30-02 | **Màn "Quản lý" cho điện thoại** trên web (`/quan-ly`): đăng nhập, chọn quán, 5 tab; iPhone "Thêm vào màn hình chính" | Trên iPhone + Android (Chrome): đăng nhập → Tổng quan hiện doanh thu hôm nay **khớp** báo cáo admin cùng ngày; tắt "Còn món" → POS hiện "Hết" ≤ 5 giây | 5–7 ngày |
| 30-03 | **APK "TechMenu Quản lý"**: vỏ Android mở `/quan-ly`, tự cập nhật, nút tải + mã QR ở trang quản trị | Điện thoại sạch quét QR → cài ≤ 3 phút → đăng nhập → vào Tổng quan; bản 1.0.1 hiện "Cập nhật"; app Thu ngân đang cài **vẫn lên bản mới bình thường** | 2–3 ngày |

Tổng ~2 tuần. 30-01 độc lập, làm trước được. 30-03 cần 30-02.

## Giao diện (ĐÃ CHỐT 04/10/2026)

> Cột "Chốt": chủ dự án đánh ✅ giữ, hoặc ✏️ kèm chỗ cần đổi. Trang quản trị (admin) **không đổi** — 30-01 chỉ mở nó trong cửa sổ riêng.

### A. Quản trị trong app Thu ngân (30-01)

| # | Màn / chỗ | Nội dung | Đối thủ | Chốt |
|---|---|---|---|---|
| A1 | **Menu ☰** (Windows: menu trên cùng; Android: nút ☰ nổi) | Thêm mục **"Quản trị"** ngay dưới "Màn bếp", ngăn cách bằng một vạch: **Thu ngân · Màn bếp · ─ · Quản trị · ─ · Tải lại · Cài đặt máy in · …** (các mục khác giữ nguyên) | KiotViet web: Quản lý ↔ Thu ngân; POS365: nút "Quản lý" | ✅ |
| A2 | **Cửa sổ Quản trị** — Windows | Cửa sổ thứ hai, tiêu đề **"Quản trị — {tên quán}"**, mở to bằng cửa sổ chính. Lần đầu: màn **đăng nhập quản trị** hiện có (Email, Mật khẩu, "Đăng nhập") → trang Tổng quan admin. Bấm ✕ là đóng cửa sổ này, POS vẫn chạy. Bấm ☰ → Quản trị lần nữa khi đang mở → đưa cửa sổ lên trước | — | ✅ |
| A2' | **Màn Quản trị** — Android | Mở màn toàn màn hình phủ lên POS; trên cùng có thanh mỏng: nút **"← Về Thu ngân"** + chữ **"Quản trị — {tên quán}"**. Nút Back của Android: lùi trang trong admin, hết trang thì về POS | — | ✅ |
| A3 | **Ai vào được** | Chỉ **chủ quán / quản lý** (đăng nhập quản trị như web). Thu ngân/phục vụ đăng nhập → báo **"Tài khoản này không có quyền quản trị."** | iPOS: quyền `POS_CMS` riêng | ✅ |
| A4 | **Nhớ đăng nhập** | Quản trị **nhớ đăng nhập** giữa các lần mở (như web). Trong admin có sẵn nút "Đăng xuất". **"Đăng xuất máy quầy"** ở ☰ thì xóa luôn đăng nhập quản trị trên máy | — | ✅ |
| A5 | **Tải tệp / in** từ admin (Xuất Excel, in mã QR bàn) | Windows: hộp "Lưu tệp" như trình duyệt. Android: lưu vào thư mục Tải xuống + thông báo "Đã tải {tên tệp}" | — | ✅ |

### B. App "TechMenu Quản lý" (30-02 web + 30-03 Android)

| # | Màn / chỗ | Nội dung | Đối thủ | Chốt |
|---|---|---|---|---|
| B1 | **Tải app** — trang quản trị → **Tổng quan**, thẻ mới **"App quản lý trên điện thoại"** | Mã QR (quét mở trang tải) + nút **"Tải cho Android"** + liên kết **"Hướng dẫn cho iPhone"** (3 bước có ảnh: mở bằng Safari → nút Chia sẻ → **"Thêm vào MH chính"**) | Đối thủ dẫn tới App Store / Google Play | ✅ |
| B2 | **Đăng nhập** (`/quan-ly`) | Logo · **"TechMenu Quản lý"** · ô **Email** · ô **Mật khẩu** (có nút hiện/ẩn) · nút **"Đăng nhập"** · dòng nhỏ "Dành cho chủ quán và quản lý". Sai → "Email hoặc mật khẩu không đúng." Thu ngân/phục vụ → "Tài khoản này không có quyền quản lý." | KiotViet: gian hàng + tài khoản + mật khẩu; FABi: email + mật khẩu | ✅ |
| B3 | **Chọn quán** (chỉ khi tài khoản có >1 quán/chi nhánh) | Danh sách thẻ: tên quán + địa chỉ/slug; chuỗi có thêm dòng đầu **"Tất cả chi nhánh"**. Một quán thì bỏ qua màn này | Sapo: chọn cửa hàng; CUKCUK: "Tất cả chi nhánh" | ✅ |
| B4 | **Khung chung** | Trên cùng: **tên quán** (chạm → đổi quán nếu có nhiều) + **ô chọn kỳ**: **Hôm nay** / Hôm qua / 7 ngày qua / Tháng này / Tháng trước. Dưới cùng: **thanh 5 tab** có biểu tượng: **Tổng quan · Hóa đơn · Báo cáo · Thực đơn · Thêm** | KiotViet/Sapo: thanh dưới + "Thêm" | ✅ 04/10 |
| B5 | **Tab Tổng quan** | Thẻ to **"Doanh thu"** (số tiền + ▲/▼ % so với kỳ trước). Hàng 3 thẻ nhỏ: **Số hóa đơn** · **Trung bình/hóa đơn** · **Món hủy** (số món + tiền). Thẻ **"Đang phục vụ"**: số bàn có khách / tổng bàn + **tiền tạm tính** chưa thu (chạm → danh sách bàn: tên bàn, giờ vào, tạm tính). Biểu đồ cột **"Doanh thu theo giờ"** (hôm nay/hôm qua) hoặc **theo ngày** (kỳ dài). **"Món bán chạy"** top 5 (tên, số lượng, tiền) | KiotViet: doanh thu + so sánh; POS365: bàn đang ngồi, gọi gì | ✅ |
| B6 | **Tab Hóa đơn** | Ô tìm **"Tìm số hóa đơn, bàn"**. Danh sách theo kỳ, mới nhất trước, mỗi dòng: **giờ** · **bàn** (hoặc "Mang về") · **số hóa đơn** · **tổng tiền** (đậm) · phương thức (Tiền mặt/Chuyển khoản/…) · thu ngân. Chạm → **chi tiết**: danh sách món (tên, SL, thành tiền), giảm giá, phụ thu, thanh toán, giờ vào/ra, người thu. **Chỉ xem** (không hủy, không in lại trên app) | KiotViet: xem, lọc, "Hủy đơn", "In" | ✅ 04/10 chỉ xem |
| B7 | **Tab Báo cáo** | Danh sách mở/gập (dùng lại số liệu báo cáo admin): **Kết quả kinh doanh** (doanh thu, giá vốn, lãi gộp, chi phí, lãi) · **Theo nhóm món** · **Theo món** · **Theo phương thức thanh toán** · **Theo nhân viên** · **Món bị hủy** (món, SL, người hủy, lý do) · **Giảm giá**. Cuối trang: **"Xem báo cáo đầy đủ"** → mở trang báo cáo admin | CUKCUK: Báo cáo doanh thu, mặt hàng, thu chi, chi tiết HĐ | ✅ |
| B8 | **Tab Thực đơn** | Ô tìm món + hàng chip nhóm món. Mỗi dòng: **tên món** · **giá** · công tắc **"Còn / Hết"** (đổi ngay, POS + QR thấy "Hết"). Chạm vào món → hộp **"Sửa món"**: Tên, Giá bán, Nhóm, Đang bán (ẩn/hiện) · **"Lưu"** / "Hủy". Nút **"+ Thêm món"** ở góc → mở trang Thực đơn admin (đủ ảnh, tùy chọn, công thức) | KiotViet: Hàng hóa thêm/sửa/"Lưu"; CUKCUK: sửa món, "Không hiển thị trên thực đơn" | ✅ 04/10 Còn/Hết + sửa tên, giá, nhóm |
| B9 | **Tab Thêm** | Thẻ tài khoản (tên, email, vai trò). Nhóm **"Quản trị đầy đủ"**: Kho hàng · Sổ quỹ · Khách hàng · Nhân viên · Bàn & QR · Máy in · Cài đặt (mỗi mục mở trang admin tương ứng trong app). **Đổi quán / chi nhánh** (khi có nhiều). **Hướng dẫn cài lên iPhone** (chỉ hiện trên Safari). **"Đăng xuất"**. Dòng nhỏ "Phiên bản 1.0.0" | Sapo/KiotViet: "Thêm"/menu tính năng | ✅ |
| B10 | **Trạng thái trống / lỗi** | Kỳ không có hóa đơn: hình nhỏ + "Chưa có hóa đơn trong {kỳ}". Mất mạng: dải vàng trên cùng "Mất kết nối — số liệu có thể chưa mới" + nút "Thử lại". Hết hạn thuê bao: như banner admin hiện có | — | ✅ |
| B11 | **APK Android** | Tên **"TechMenu Quản lý"**, biểu tượng riêng (cùng logo, nền khác màu app Thu ngân), mã gói `vn.techmenu.quanly`. Mở app → `/quan-ly` toàn màn hình. Có bản mới → hộp **"Có bản mới 1.0.x"** · "Cập nhật" / "Để sau" (như app Thu ngân). Mất mạng → màn "Chưa kết nối được — đang thử lại" (dùng lại của app Thu ngân) | — | ✅ |

Điện thoại là bố cục chính (một cột, rộng 360–430 px). Tablet/máy tính mở `/quan-ly`: cùng bố cục, giới hạn rộng ~480 px ở giữa
(màn hình lớn thì đã có trang admin đầy đủ).

## Cần chủ dự án chốt

Đã chốt 04/10/2026: **5 tab** như đề xuất (B4) · **Hóa đơn chỉ xem** (hủy hóa đơn từ xa để sau) · **Thực đơn: Còn/Hết + sửa tên,
giá, nhóm** · **Quản lý (manager) dùng được** cả app Quản lý lẫn mục Quản trị, chỉ thấy chi nhánh mình (QD-028).

Toàn bộ bảng + tên app **"TechMenu Quản lý"** / `vn.techmenu.quanly`: chủ dự án chốt 04/10/2026 ("ok triển khai").

## Phát hiện khi rà code (04/10/2026)

- Một máy, một trình duyệt = **một phiên đăng nhập** cho cả origin: POS và admin dùng chung cookie Supabase. Thu ngân bấm vào
  `/admin` sẽ bị `canAccess` đẩy về POS (`lib/auth/rbac.ts`); nếu chủ đăng nhập admin trong cùng WebView thì **thu ngân bị đăng
  xuất khỏi POS**. ⇒ 30-01 bắt buộc **phiên riêng**: Electron `partition` riêng; Android WebView dùng **Profile riêng**
  (`androidx.webkit` đã có 1.12.1 — API Profile cần `WebViewFeature.MULTI_PROFILE`, WebView đời mới).
- App Android hiện gọi `CookieManager.getInstance().removeAllCookies` khi "Đăng xuất máy" (`MainActivity.kt`) — chỉ xóa profile
  mặc định ⇒ phải xóa thêm profile quản trị (A4).
- Admin hiện **không có danh sách hóa đơn** (chỉ báo cáo tổng hợp, `reports/page.tsx`) ⇒ tab Hóa đơn (B6) là phần mới, đọc
  `bills` + `bill_items` + `payments` (đọc theo `lib/billing/bill.ts`).
- Số liệu báo cáo dùng lại được: `lib/reports/deep.ts` (nhân viên, bàn, nhóm món theo tuần), `lib/reports/pnl*.ts` (kết quả kinh
  doanh, đã hỗ trợ nhiều chi nhánh), `reports/page.tsx` (nhóm món, món, phương thức thanh toán, món hủy, giảm giá). Tổng quan
  B5 **phải khớp số** với báo cáo admin cùng kỳ — dùng chung hàm, không viết lại câu truy vấn.
- Chọn quán sau đăng nhập: đã có logic "chọn chi nhánh" ở kích hoạt máy quầy (`/api/desktop/activate`, QD-028) và
  `boChonChiNhanh` ở layout admin — dùng lại.
- PWA đã có cho `/r/[slug]` (`manifest.webmanifest`, P17). `/quan-ly` cần manifest **riêng** (tên "TechMenu Quản lý",
  `start_url`/`scope` = `/quan-ly`) để iPhone lưu thành biểu tượng riêng, không lẫn với POS.
- Android project hiện một module, `applicationId = "vn.techmenu.thungan"` (không đổi được). App Quản lý thêm bằng **product
  flavor** dùng chung code cập nhật/màn mất mạng; **bắt buộc** kiểm APK Thu ngân build sau thay đổi vẫn cài đè lên bản đang chạy
  (cùng mã gói, cùng khóa ký).
