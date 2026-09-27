# P17 — Bán khi quán mất mạng

> Lập 27/09/2026, **sửa cùng ngày** theo thông tin chủ dự án: khi wifi quán mất, nhân viên order bằng điện thoại 5G.
> Plan là hợp đồng + nghiệm thu, không phải bản nháp code.
> Quyết định: `15-QuyetDinh/QD-024` (chờ chốt C2) · Yêu cầu: OFFLINE-01..04, OPS-04 · Phụ thuộc: P12 (POS đầy đủ trên điện thoại).

## Vì sao P17 là việc này

Wifi quán chập chờn là chuyện thường. Điện thoại 5G vẫn bán được (P12), nhưng **cầu in trên PC quầy cần internet** ⇒ bếp không nhận
phiếu, hóa đơn không in; máy quầy tải lại thì trắng màn. KiotViet và POS365 quảng cáo "bán khi mất mạng".

**P17 kết thúc bằng: rút dây mạng quán giữa giờ bán — nhân viên tiếp tục gọi món và thu tiền trên điện thoại 5G; cầu in tự chuyển sang
wifi phát từ điện thoại quản lý, phiếu bếp tiếp tục ra (phiếu kẹt tự in bù); cả quán thấy cảnh báo khi in bị kẹt; máy quầy không trắng
màn và chỉ đường sang điện thoại.**

## Các plan

| Plan | Yêu cầu | Phụ thuộc | Giá trị khi dừng ở đây |
|---|---|---|---|
| 17-01 PWA + đọc khi mất mạng + chỉ báo mạng | OPS-04, OFFLINE-01 | không | Cài lên màn hình chính; máy quầy mất mạng không trắng màn |
| 17-02 Cầu in có mạng dự phòng + cảnh báo in kẹt toàn quán | OFFLINE-02, OFFLINE-03 | QD-024 C2 | Bếp vẫn nhận phiếu khi wifi quán mất |
| 17-03 Diễn tập mất mạng + tài liệu | OFFLINE-04 | 17-01, 17-02 | Có bằng chứng quán bán liền mạch khi rút mạng; nhân viên biết làm gì |

## Phát hiện khi rà code (27/09/2026)

- Mọi ghi là server action; POS `force-dynamic`; **không** có manifest, service worker, IndexedDB (OPS-04 ☐).
- Cầu in poll Supabase mỗi 2s bằng JWT tài khoản `printer`; hóa đơn tải ảnh PNG từ `/api/print/jobs/:id/image`; tự cập nhật từ
  `/api/bridge/latest` ⇒ **mọi** đường của cầu in cần internet. Bỏ phiếu cũ > 30 phút (`print-bridge.mjs:62-71`).
- Nhịp tim cầu in + `/admin/printers` + bảng `/super` (PRINT-13) đã biết cầu in sống/chết ⇒ nguồn cho cảnh báo toàn quán.
- Chip trạng thái in trên từng phiếu đã có (P12 12-03).

## Ràng buộc xuyên suốt

- Không đổi nghiệp vụ tiền, số phiếu, PIN, chốt sổ.
- Thử bằng **rút dây mạng thật** ở máy quầy + điện thoại 5G thật, không chỉ DevTools offline.

## Không nằm trong P17

| Việc | Vì sao |
|---|---|
| Bán khi cả 5G cũng mất (hàng đợi ghi offline, số phiếu tạm, đồng bộ) | QD-024 D5 — để sau, chỉ làm khi số liệu thật đòi hỏi |
| In trực tiếp từ điện thoại ra máy in LAN | Trình duyệt không mở được socket 9100 (QD-018); cần app vỏ |
| KDS offline | KDS chỉ xem (QD-021 C4); bếp dùng phiếu giấy |
