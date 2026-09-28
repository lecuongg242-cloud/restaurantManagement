# MKT-04 — SUMMARY: trang công khai "Hướng dẫn cài đặt" (`/huong-dan-cai-dat`)

> **Trạng thái: CODE XONG 29/09/2026** — chưa commit, chưa deploy.

## Đối thủ làm thế nào (tra 29/09/2026)

| Đối thủ | Cách trình bày | Nguồn |
|---|---|---|
| KiotViet | Chỉ ghi chung "hoạt động với mọi thiết bị, mọi trình duyệt", không liệt kê | kiotviet.vn/phan-cung-bar-cafe-nha-hang/ |
| iPOS | 7 mục đánh số, mỗi loại thiết bị một ảnh + một câu công dụng, không giá | thietbi.ipos.vn/san-pham-thiet-bi-nha-hang/ |
| POS365 | Tên = loại + hãng + mã máy ("Máy in hóa đơn Xprinter Q806K"), có giá (họ bán máy) | pos365.vn/may-ban-hang |
| CUKCUK | Cấu hình máy tính Tối thiểu / Khuyến nghị (Windows 10/11, RAM 4/8GB, Core i5) + máy in 58/80mm | helpv2.cukcuk.vn/vi/kb/phan_mem_cho_thu_ngan |

Làm theo: khung đánh số + hình + một câu công dụng (iPOS), ghi đúng mã máy (POS365), bảng Tối thiểu / Nên có (CUKCUK).

## Chủ dự án chốt (29/09/2026)

- Máy in ghi đúng **Sapo SPR02** + "hoặc máy tương đương: khổ 80mm, có cổng LAN".
- Máy quầy: **laptop hoặc máy tính để bàn (PC)**. Bắt buộc: máy tính + máy in + wifi.
- Trang **công khai**. Ảnh **minh họa** (không ảnh chụp). **Không ghi giá**, không mục "không cần mua", không mục mất mạng.

## Tệp

- `app/(marketing)/huong-dan-cai-dat/page.tsx` (mới) — đầu trang 3 thứ bắt buộc; 7 thiết bị (máy tính, máy in, wifi + dây
  LAN — bắt buộc; điện thoại/tablet, giấy K80, máy in bếp, màn hình bếp); sơ đồ nối; 3 bước bắt đầu; 5 câu hỏi thường gặp;
  form để lại số (MKT-02).
- `public/marketing/thiet-bi/*.jpg` — ảnh thật từ kho miễn phí (Pexels / Unsplash), 800×600; nguồn từng ảnh ở `NGUON-ANH.md`.
- `app/(marketing)/page.tsx` — lối vào dưới form đầu trang + chân trang.
- `tests/e2e/huong-dan-cai-dat.spec.ts` (mới).

## Bằng chứng

```
npx playwright test huong-dan-cai-dat.spec landing.spec → 6 passed
  (lối vào từ trang chủ; 3 thứ bắt buộc; 7 thiết bị; máy in đủ mã + khổ 80mm + cổng LAN; không có giá / "không cần mua" /
   "mất mạng"; 360px không tràn ngang; form MKT-02 vẫn chạy)
npx tsc --noEmit sạch · next lint sạch · console trình duyệt 0 lỗi
```

Ảnh: `anh/1-may-tinh.png`, `anh/2-dien-thoai-360.png`.

## Bổ sung 29/09/2026 (chủ dự án)

- Đổi đường dẫn `/can-chuan-bi-gi` → **`/huong-dan-cai-dat`**.
- Bỏ hình vẽ SVG, thay bằng **ảnh thật** (ảnh kho miễn phí, cho dùng thương mại, không bắt buộc ghi nguồn). Máy in trong
  ảnh là máy in hóa đơn để bàn khác hãng (không có ảnh SPR02 miễn phí) — chữ trên trang vẫn ghi đúng Sapo SPR02.
- Thêm mục **"Bên mình hỗ trợ gì"**. Đối thủ (tra 29/09/2026): KiotViet "miễn phí cài đặt, triển khai, nâng cấp và hỗ
  trợ", 7h–22h 365 ngày; POS365 "giá gói đã bao gồm hỗ trợ thiết lập ban đầu, chuyển giao thao tác cơ bản… hỗ trợ kỹ thuật
  24/7", tận nơi báo giá riêng; CUKCUK đào tạo 1 kèm 1 3.950.000đ, triển khai tận nơi 11.950.000đ; Sapo không công bố.
  Chủ dự án chọn kiểu POS365: **từ xa miễn phí, tận nơi báo phí, 24/7**. Nội dung: cài máy in + phần mềm, nhập thực đơn
  (gửi ảnh qua Zalo), thiết lập quán, hướng dẫn chủ quán + nhân viên, hỗ trợ 24/7 (số lấy từ /super → Cài đặt nền tảng),
  tới tận quán báo phí. Thêm câu hỏi "Cài đặt có mất phí không?".

```
npx playwright test huong-dan-cai-dat.spec landing.spec → 6 passed (thêm: ≥ 10 ảnh thiết bị đều tải được; mục hỗ trợ đủ
  6 ý + "miễn phí")
tsc + next lint sạch
```
