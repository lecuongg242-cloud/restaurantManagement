# DANH SÁCH CAM KẾT — P2: Dữ liệu nhà hàng

**Trạng thái: ĐÃ DUYỆT** — "XÁC NHẬN LƯU" ngày 21/07/2026 (sau vòng góp ý v0.2). Đây là hợp đồng nghiệm thu P2; chờ "XÁC NHẬN LÀM" để bắt đầu build.
**Người chịu trách nhiệm:** Thợ Xây (Claude Code) · **Nghiệm thu:** Chủ dự án
**Nguồn:** `10-BanThietKe/20-P2-DuLieuNhaHang.md` · **Yêu cầu phủ:** MENU-01, MENU-02, MENU-03, TABLE-01, TENANT-03

## Kết quả mong muốn
Chủ nhà hàng tự cấu hình menu + khu vực/bàn + QR trong ≤ 15 phút; khách quét QR bằng điện thoại thấy đúng menu của nhà hàng — sẵn sàng cho lõi order P3.

## Các tiêu chí phải đạt

| # | Tiêu chí | Cách kiểm tra |
|---|---|---|
| 1 | CRUD danh mục + món đầy đủ: tên, giá VND, mô tả, ảnh ≤ 2MB, tùy chọn (nhóm single/multiple + phụ thu), ẩn/hiện (`is_active`) và hết món (`is_sold_out`) là 2 cờ riêng, sắp xếp | Video tạo 1 danh mục + 1 món đủ trường (có ảnh, 2 nhóm tùy chọn); sửa; xóa có xác nhận |
| 2 | Ảnh > 2MB hoặc sai MIME bị chặn ở **cấu hình bucket** (`file_size_limit` + `allowed_mime_types`), không chỉ ở client/policy | Upload file 3MB và file .gif **qua API trực tiếp (bỏ qua client)** → Storage từ chối, bucket không có file; upload trái tenant → bị policy từ chối |
| 3 | Toggle "hết món" 1 chạm → app khách phản ánh ≤ 3 giây, không tải lại trang | Quay 2 màn hình cạnh nhau (admin + điện thoại xem menu): bấm toggle, đếm giây, 5/5 lần đạt |
| 4 | Menu khách mobile-first: tải lần đầu ≤ 3 giây trên 4G, không vỡ layout từ 360px, điểm chạm ≥ 44px | Chrome DevTools throttle Fast 4G, 10 lần lấy trung vị ≤ 3s; ảnh chụp 360px; Lighthouse mobile đính kèm |
| 5 | CRUD khu vực + bàn; tạo bàn hàng loạt; mỗi bàn có QR duy nhất, đổi tên bàn không làm QR đã in mất hiệu lực | Video tạo "Tầng 1" 8 bàn một lần; kiểm tra `qr_token` unique; đổi tên bàn → quét QR cũ vẫn vào đúng bàn |
| 6 | Xuất QR ra file in được: PNG từng bàn + trang in tổng khổ A4 (khu vực, tên bàn, QR, hướng dẫn) | In thật (hoặc lưu PDF) trang in tổng; quét bản in bằng điện thoại thật → mở đúng `/r/[slug]/t/[qr_token]` |
| 7 | Quét QR ra **đúng nhà hàng + đúng bàn**; QR của bàn đã xóa → trang báo lỗi thân thiện | Quét QR 2 tenant khác nhau → mỗi cái ra đúng menu tenant đó; xóa 1 bàn rồi quét lại QR cũ → trang "không còn hiệu lực" |
| 8 | **Anon KHÔNG SELECT trực tiếp được `tables`/`areas`**; resolve QR chỉ qua RPC `resolve_table_by_qr`: token đúng → đúng 1 dòng, token sai → 0 dòng | Test tự động: anon query 2 bảng → bị từ chối/0 dòng; gọi RPC token đúng/sai/bàn đã xóa → 1/0/0 dòng; log đính kèm |
| 9 | RLS cho 6 bảng mới: chéo tenant = 0 truy cập; anon chỉ đọc dữ liệu active, không ghi được gì; bộ test P1 không hỏng | `npm run test:rls` xanh toàn bộ (43 assertions cũ + assertions mới cho menu/bàn/anon); log đính kèm |
| 10 | **Ràng buộc tại database**: composite FK kèm `tenant_id` chặn liên kết chéo tenant trên cả 4 quan hệ (món→danh mục, nhóm tùy chọn→món, lựa chọn→nhóm, bàn→khu vực); CHECK giá ≥ 0 | Test tự động: INSERT món của tenant A trỏ danh mục tenant B (chạy bằng service-role, lách RLS) → FK từ chối, đủ 4 quan hệ; INSERT giá âm → CHECK từ chối |
| 11 | Onboarding wizard **4 bước** (Nhà hàng → Menu → Bàn → In QR), checklist hoàn tất cuối bước 4 (≥ 1 danh mục, ≥ 10 món, ≥ 5 bàn, đã mở trang in QR) | Video đi hết wizard; thoát giữa chừng rồi vào lại vẫn tiếp tục được |
| 12 | **TENANT-03**: người ngoài onboard tenant hoàn chỉnh ≤ 15 phút | Biên bản đo thật với 1 người không tham gia build: thời gian từng bước, tổng ≤ 15 phút |

## KHÔNG ĐƯỢC LÀM
- ✗ Không xây tính năng P3+: giỏ hàng, gửi order, sơ đồ bàn POS/trạng thái bàn realtime (TABLE-02), bill
- ✗ Không dùng service-role key trong route khách/quản trị — mọi thao tác qua session user + RLS (giữ nguyên quy tắc P1)
- ✗ Không tắt/bỏ qua RLS; anon chỉ được mở đọc đúng phạm vi thiết kế (menu active), không policy `USING (true)`
- ✗ Không cấp anon SELECT trực tiếp trên `tables`/`areas` — resolve QR bắt buộc đi qua RPC `resolve_table_by_qr`
- ✗ Không sửa database dev/prod thủ công — schema mới đi qua migration 0002 → PR → pipeline
- ✗ Không gọi dịch vụ ngoài để sinh QR (sinh cục bộ bằng thư viện)
- ✗ Không hardcode tenant/slug/domain trong QR hay bất kỳ đâu

## Bằng chứng bàn giao (docs/40-KiemTra/BaoCao-P2-*.md)
Video các luồng (CRUD menu, hết món realtime, tạo bàn + in QR, quét QR điện thoại thật, wizard onboarding), log test RLS, số đo 4G + Lighthouse, file/ảnh bản in QR, biên bản đo onboarding, danh sách file đã tạo/sửa, trạng thái từng tiêu chí (ĐẠT/CHƯA ĐẠT).

## Hạn hoàn thành
Đề xuất: 1 tuần kể từ "XÁC NHẬN LÀM". Tối đa 3 vòng sửa. Kế hoạch 3 plan: 02-01 CRUD menu + trang menu khách; 02-02 khu vực/bàn + QR + in; 02-03 onboarding + đo nghiệm thu.
