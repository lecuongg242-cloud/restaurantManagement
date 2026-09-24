# 08-03 SUMMARY — Cầu in nhịp thích ứng

> Thực hiện 24/09/2026. Yêu cầu: PERF-03.

## Tệp đã đổi

| Tệp | Việc |
|---|---|
| `scripts/print-bridge.mjs` | `nextPollMs` + guard entry point + vòng lặp dùng bậc thang |
| `tests/print/poll-backoff.test.ts` (mới) | 6 test |
| `docs/50-PhienBan/V1x-CauInBep.md` | Ghi hành vi mới ở phần xử lý sự cố |

## Cạm bẫy trong plan đã thành thật

Plan cảnh báo: import `print-bridge.mjs` vào test là **khởi động cầu in**. Đúng như vậy — lần chạy
RED đầu tiên:

```
Thiếu NEXT_PUBLIC_SUPABASE_URL / ... / PRINT_BRIDGE_PASSWORD trong ...\.env.local.
Error: process.exit unexpectedly called with "1"
      Tests  no tests
```

Vitest bị `process.exit(1)` giết giữa chừng. Đã bọc phần thân trong
`if (laEntry) { … }` với `laEntry = import.meta.url === pathToFileURL(process.argv[1]).href`.
Giữ đúng một tệp — không tách file mới, để không mất tính chất "copy 1 tệp là chạy".

## Ba trạng thái, không phải hai

`pollOnce` trả về `"co-phieu"` · `"rong"` · `"khong-xac-dinh"`. Trạng thái thứ ba là chỗ dễ sai:

- **Lỗi mạng đọc `print_jobs`** không phải "vắng khách". Mất mạng 2 phút rồi có phiếu ngay khi nối
  lại mà nhịp đang nằm ở trần thì bếp chờ oan.
- **Quán đang tạm ngưng** (P7) cũng vậy — có thể được bật lại bất cứ lúc nào.

Cả hai giữ nguyên `emptyStreak`: không phạt, không thưởng.

## Đo thật

| Phép | Kết quả |
|---|---|
| Cầu in chạy 70 giây không có phiếu (nhịp lên trần), rồi thả một phiếu | phát hiện sau **4.518 ms** |
| Tiêu chí PERF-03 | ≤ **10.000 ms** |

Nhịp ở trần là 10 giây ⇒ **360 request/giờ** khi quán vắng, so với 1.800 trước đây (**1/5**), đạt
tiêu chí ≤ 400. Con số này suy từ bậc thang đã được 6 test khẳng định, cộng với phép đo trên chứng
minh vòng lặp thật sự dùng bậc thang đó.

`node --check` sạch; `grep SERVICE_ROLE` vẫn = 0 (không làm hỏng thành quả P7).

## Còn lại

Cầu in ở quán đang chạy chưa được cập nhật — cùng lượt với việc chuyển đổi qt-food, xem
`50-PhienBan/V1x-CauInBep.md` §Chuyển đổi quán đang chạy.
