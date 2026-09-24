# P9 — Vận hành không còn chỗ mù

> Lập 24/09/2026, ngay sau lần di trú database sang Singapore.
> Plan là hợp đồng + nghiệm thu, không phải bản nháp code.

## Vì sao P9 là việc này

Trong **một ngày**, hai lỗi lọt ra tới người dùng ở quán. Cả hai đều thoát qua 403 unit test,
159 RLS test, 16 E2E, `tsc`, `lint`, `build`:

| Lỗi | Vì sao mọi test đều xanh |
|---|---|
| Hóa đơn ghi `23:34 23/09` trong khi đang là sáng 24/09 | Định dạng giờ không nêu múi giờ → lấy giờ **máy đang chạy**. Máy dev ở UTC+7 nên luôn đúng; Vercel ở UTC nên luôn sai |
| Toàn bộ ảnh món vỡ sau khi đổi database | `image_url` lưu URL tuyệt đối có tên project trong đó. Local và production **dùng chung một database** nên chưa bao giờ có hai host để lộ ra |

Đây không phải hai lỗi rời rạc mà **một lớp lỗi**: thứ chỉ sai khi môi trường chạy khác máy dev.
Sửa hai chỗ đó rồi thì lớp lỗi vẫn còn nguyên.

Cùng ngày, database Mỹ bị xóa khi chưa có bản sao lưu tự động nào. Khôi phục được là nhờ một bản
dump chạy tay đúng lúc — **may, không phải quy trình**.

**P9 kết thúc bằng "không còn lớp lỗi nào chỉ xuất hiện trên production, và mất database không còn
là sự cố"** — không phải bằng một tính năng mới.

## Các plan

| Plan | Yêu cầu | Phụ thuộc | Vì sao |
|---|---|---|---|
| 09-01 Bịt khoảng cách local ↔ production | OPS-08 | không | Đóng **lớp lỗi**, không phải hai lỗi |
| 09-02 Sao lưu tự động + đường lui | OPS-09 | không | Hôm nay mất database, khôi phục bằng may mắn |
| 09-03 Cầu in: đóng nốt ba việc tồn | PRINT-06, PRINT-07 | không | **122 phiếu bếp chưa từng tới bếp** — đo được, đang chảy máu |
| 09-04 Kết luận PERF-04 → `QD-016` | PERF-04 | **đủ 2 tuần log**, sớm nhất 08/10/2026 | Quyết viết lại realtime bằng số, không bằng cảm giác |

09-01, 09-02, 09-03 độc lập, chạy song song được. 09-04 là cổng thời gian.

## Đổi số hiệu quyết định

`QD-014` trong `P8/99-CHOT.md` và `Roadmap.md` được đặt trước cho kết luận realtime, nhưng số đó
đã dùng cho **"Ảnh lưu đường dẫn tương đối"** ngày 24/09. Từ nay:

- `QD-015` — nơi cất bản sao lưu (09-02, vì bản dump chứa PII của khách)
- `QD-016` — có viết lại realtime hay không (09-04)

## Không nằm trong P9

| Việc | Vì sao |
|---|---|
| **42 yêu cầu đang `◐` chờ nghiệm thu người thật** | Là 7 phiên bấm tay ở `40-KiemTra/00-DanhSachNghiemThu.md`, cần mắt người và điện thoại thật. Không phải việc code, không gộp vào plan |
| Viết lại realtime (bỏ `router.refresh()`) | Chờ số của 09-04. Chạm sâu `PosBoard`/`KdsBoard` — hai bề mặt qt-food dùng hằng ngày |
| Rate limit endpoint ẩn danh | Chưa đo thì không biết đặt ngưỡng nào; ngưỡng sai chặn khách thật |
| Gói cước SaaS | Đã chốt ở V3 (Roadmap) |
| Tự động hóa việc đổi env trên Vercel | Một năm làm một lần. Tự động hóa việc hiếm là thêm thứ để hỏng |

## Ràng buộc xuyên suốt

- **qt-food đang bán hàng thật.** Mọi phép thử chạy trên tenant demo (`pho-viet`, `bun-bo`); đụng
  dữ liệu qt-food phải sao lưu trước và nêu rõ trong summary.
- **Không xóa project SG1** (`wsbinfgagdanrfvrxxuz`) cho tới khi 09-02 xong. Sau khi database Mỹ
  mất, đó là đường lui duy nhất còn lại.
- Mỗi plan kết thúc bằng một `-SUMMARY.md` có **số đo**, không phải "đã xong".
