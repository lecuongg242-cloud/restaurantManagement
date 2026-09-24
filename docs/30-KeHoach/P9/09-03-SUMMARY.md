# 09-03 — Cầu in: biết khi nó chết, tự đi đường khác · BÁO CÁO

> Yêu cầu: **PRINT-06** ☑ · **PRINT-07** ◐ · **PRINT-08** ◐. 24/09/2026.
> ◐ = máy đã kiểm xong; còn phần phải làm tại quán.

## Kết quả chính — trên production thật

`tests/e2e/cau-in.spec.ts`, tenant demo `pho-viet`. **Cùng một nút, cùng một đơn**, chỉ khác tuổi
nhịp tim:

| Nhịp tim | Phiếu bếp |
|---|---|
| Cũ 10 phút (cầu in chết) | **`printed`** — in bằng trình duyệt |
| Vừa xong (cầu in sống) | **`pending`** — vào hàng đợi cho cầu in |

Trên code cũ, dòng đầu ra `pending` — phiếu nằm đó không ai lấy, đúng lỗi 24/09. Băng
*"Chưa có cầu in bếp nào kết nối"* hiện trên POS production (đã chụp màn hình).

## Theo nghiệm thu

| # | Tiêu chí | Kết quả |
|---|---|---|
| 1 | Ngưỡng + quan hệ ngưỡng + khóa một phiên | 18 + 4 test; **đối chứng âm**: đặt lại giá trị cũ (chip 40 lần hỏi, ngưỡng 60s) → 2 test quan hệ đỏ |
| 2 | RLS nhịp tim | **9/9**, từ chối **đúng lý do**: chủ quán bị chính hàm từ chối (không phải "không tìm thấy hàm"), anon bị chặn quyền EXECUTE |
| 3 | `superseded` chặn tờ trùng | `cau-in-db` 6/6, chạy bằng quyền nhân viên (RLS thật) |
| 4 | Production: không cầu in → trình duyệt; có → hàng đợi | **2/2** (bảng trên) |
| 5 | `--test-auth` báo cả đăng nhập + nhịp tim | Chạy từ **chính thư mục gói** mang ra quán: cả hai OK |
| 6 | Tại quán: cài, tắt/bật máy, double-click lần hai | **Chưa** — việc của chủ dự án |

Chạy thật cầu in (tenant demo): cầu in thứ hai bị chặn, **mã thoát 3**; nhịp tim
`07:00:39 → 07:01:09`, đúng chu kỳ 30 giây. Logic `errorlevel` của `.bat` thử trên cmd.exe thật.

## Ngưỡng — từ dữ liệu, không chọn cho đẹp

| Ngưỡng | Giá trị | Nguồn |
|---|---|---|
| Mất kết nối | 90s (3 nhịp × 30s) | Một nhịp trễ vì mạng chập mà đổi đường là bếp nhận hai tờ khi cầu in bắt kịp |
| Phiếu quá hạn | 120s | p99 in qua cầu in = 67s; **4/2.482** phiếu thành công vượt 120s |
| Lỗi dồn dập | ≥3 / 5 phút | Lỗi lẻ 73 lần, đôi 39 lần là thân; từ 3 là đuôi (có đợt 16 lỗi liền) |

## Lệch khỏi plan

**Không viết bộ cài mới.** Plan bản đầu định viết bộ cài Windows tự chạy khi bật máy. Đọc `scripts/`
trước khi code thì thấy **đã có sẵn** (`print-setup.ps1` + `print-bridge.bat` + `print-pack.ps1`).
Sửa plan thay vì viết trùng.

Đọc bộ cài đó lộ ra **hai rủi ro in trùng**, cả hai đã vá:

1. Tác vụ chạy ngầm dưới SYSTEM, **không có cửa sổ** → nhân viên tưởng cầu in tắt, double-click
   `.bat` → hai cầu in. Vá bằng khóa một phiên (cổng TCP) + `.bat` nhận mã 3 thì dừng, không vòng
   lặp. Đây có thể là một nguồn của lỗi in trùng đã điều tra trước đó.
2. Cài lại (nâng cấp) **không tắt cầu in cũ đang chạy** — bản cũ chưa có khóa nên không nhường. Vá
   trong `print-setup.ps1`.

**Mốc giờ nhịp tim do database ghi.** Plan chưa nói; phát hiện khi đo: `printed_at` do laptop ghi
cho p50 = 6,5s trong khi poll là 2s — một phần là đồng hồ laptop lệch.

**Cảnh báo cũ sai trong `print-pack.ps1`** ("bộ này chứa khóa máy chủ, bỏ qua RLS toàn project") —
sai từ P7. Đã sửa.

## Gói mang ra quán

`cau-in-qt-food.zip` (gitignored — chứa mật khẩu cầu in). Trỏ project Singapore, **không có
service-role**, cầu in bản mới. Đã xóa thư mục gói cũ còn service-role key của project Mỹ đã xóa.

Nhịp tim thử của qt-food đã **xóa** sau khi kiểm, để băng trên POS nói đúng sự thật cho tới khi cầu
in thật kết nối.

## Còn lại

- **Tại quán, trước 5h sáng 25/09:** giải nén gói → `CAI-DAT.bat`. Rồi: tắt máy bật lại → cầu in tự
  chạy; double-click `print-bridge.bat` → báo "đã chạy nền"; rút dây máy in, in 3 phiếu → băng đỏ.
- Khe hẹp `superseded`: cầu in đang gửi (~1s) đúng lúc bấm in lại → vẫn có thể hai tờ. Chấp nhận.
- REPORT-11 lấy mốc "đã in lúc" từ `print_jobs` **không lọc trạng thái** — lượt `superseded` (chưa
  từng in) cũng được tính, giống lượt `pending` trước giờ. Không phải lỗi mới, nhưng nên biết.
