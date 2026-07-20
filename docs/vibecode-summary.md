# Tóm tắt phương pháp VibeCode (từ Vibecode.pdf)

> Bản tóm tắt vận hành — dùng làm "luật chơi" cho toàn bộ quá trình build hệ thống nhà hàng.

## 1. Ba vai trò

| Vai | Ai | Nhiệm vụ |
|---|---|---|
| A — Chủ dự án | Bạn | Nói rõ muốn gì, duyệt thiết kế, quyết định "OK / Sửa lại / Xong" |
| B — Trợ lý (Kiến trúc sư) | AI planner | Hỏi làm rõ, vẽ bản thiết kế, viết danh sách yêu cầu, kiểm tra kết quả |
| C — Thợ xây | Claude Code | Viết code theo hướng dẫn, báo cáo có bằng chứng |

Ba từ khóa xác nhận của Chủ dự án: **"XÁC NHẬN LƯU"** (duyệt tài liệu) → **"XÁC NHẬN LÀM"** (cho phép build) → **"XÁC NHẬN XONG"** (nghiệm thu).

## 2. Năm câu hỏi then chốt (bắt buộc trước khi viết spec)

1. **AI SẼ DÙNG?** — người dùng chính là ai
2. **GIẢI QUYẾT VẤN ĐỀ GÌ?** — khó khăn cụ thể
3. **"XONG" KHI NÀO?** — 3–5 tiêu chí đo được, có số cụ thể
4. **KHÔNG LÀM GÌ?** — tính năng cố ý bỏ qua (chống phình phạm vi)
5. **HẠN HOÀN THÀNH?** — deadline cụ thể

## 3. Cấu trúc tài liệu dự án ("Một nguồn, Một sự thật")

```
docs/
├── 00-TongQuan/        ← Giới thiệu 10 dòng + Nhật ký thay đổi
├── 10-BanThietKe/      ← Bản thiết kế tổng quát + chi tiết từng phần
├── 20-DanhSachYeuCau/  ← "Hợp đồng cam kết" đo được cho từng phần
├── 30-HuongDanAI/      ← Hướng dẫn cho Thợ xây (Lam/KiemTra/Sua/RaSoat)
├── 40-KiemTra/         ← Báo cáo tiến độ + bằng chứng test
├── 15-QuyetDinh/       ← Ghi nhớ quyết định quan trọng (QD-00X)
└── 50-PhienBan/        ← Bản phát hành V1.0, V1.1... + hướng dẫn sử dụng
```

## 4. Danh sách yêu cầu = hợp đồng

Mỗi tiêu chí phải: **đo được** (có số), **kiểm tra được** (cách test rõ), **rõ ràng** (không mơ hồ).
- ✓ Tốt: "Tải ảnh 5MB lên trong 3 giây"
- ✗ Xấu: "Tải ảnh nhanh"

Kèm mục **KHÔNG ĐƯỢC LÀM** (điều cấm) + người chịu trách nhiệm + hạn.

## 5. Chu trình làm việc

Thiết kế → Thực thi → Kiểm thử → Bàn giao → Vận hành

- Mỗi phần build theo kế hoạch 3 bước: *Làm gì – Kết quả là gì – Kiểm tra thế nào*.
- Báo cáo theo mẫu: kế hoạch đã làm / file thay đổi / **bằng chứng (ảnh, video, log)** / rủi ro / trạng thái từng cam kết (ĐẠT / CHƯA ĐẠT).
- **Tối đa 3 vòng sửa lỗi** — nếu vẫn kẹt: đơn giản hóa yêu cầu, thử cách khác, hoặc escape hatch (gọi người thật).
- Không có bằng chứng = chưa bàn giao.

## 6. Kỷ luật vận hành

- **Evidence Report**: mọi phát hành có ảnh/video/log.
- **Triage Matrix** khi lỗi thật: 429 → giảm batch + backoff; 5xx/timeout → retry rồi PARTIAL_FAIL; bảng vỡ → table guard; code/latex sai → KEEP_CODE_BLOCKS.
- **Bảo mật tối thiểu**: khóa API phân quyền + rotate 90 ngày, không log key; auto-delete file tạm; mask PII.
- **Cost-cap**: đặt trần chi phí/phiên ngay từ đầu, không vượt nếu chưa phê duyệt.
- **Sửa tối thiểu**: chỉ sửa phần được yêu cầu, không đụng phần khác.

## 7. KPI theo dõi

| KPI | Ngưỡng |
|---|---|
| Tỉ lệ tiêu chí ĐẠT trước phát hành | ≥ 90% |
| Thời gian hoàn thành 1 phần nhỏ | ≤ vài ngày (quá lâu → chia nhỏ) |
| Số vòng sửa trung bình/phần | ≤ 3 vòng |

## 8. Phát hành

"Phát hành sớm, phát hành thường xuyên" — V1 dùng được → V1.1 tính năng nhỏ → V2 thay đổi lớn.
Mỗi phiên bản: checklist cuối + ghi chú phát hành + hướng dẫn sử dụng 1 trang + video demo + backup.
