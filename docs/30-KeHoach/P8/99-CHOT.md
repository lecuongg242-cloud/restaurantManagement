# P8 — CHỐT

> Chốt ngày 24/09/2026. Spec: `superpowers/specs/2026-09-24-p8-toi-uu-tai-chi-phi-design.md`.
> Kế hoạch: `00-TongQuan.md`. Báo cáo từng phần: `08-01..08-05-SUMMARY.md`.

## Trạng thái

| Plan | Yêu cầu | Trạng thái | Số đo |
|---|---|---|---|
| 08-01 Gỡ WebSocket churn | PERF-01 | ☑ | Bill gộp 5 đơn **1.001ms → 163ms** (6×), bỏ đuôi 3s/đơn |
| 08-02 Cache thực đơn | PERF-02 | ☑ | `getCustomerMenu` **575–1.173ms → ~245ms** |
| 08-03 Cầu in nhịp thích ứng | PERF-03 | ☑ | Vắng 70s rồi thả phiếu → **4.518ms**; **1.800 → 360** request/giờ |
| 08-04 Đo lường theo tenant | PERF-04 | ◐ | Log chạy, số nền đã lấy; **chờ 2 tuần dữ liệu production** |
| 08-05 Chốt chặn lệch schema | OPS-07 | ☑ | Đối chứng âm hai chiều đã chạy |

Toàn bộ: **369 unit · 150 RLS · 16 E2E** xanh; `tsc` · `lint` · `build` sạch.

## Ba điều đáng giữ lại từ P8

**1. Đo trước khi sửa là đúng.** 08-04 xếp wave 1 nên có số "trước" mà so. Nhờ đó mới biết
`getCustomerMenu` tốn 575–1.173ms mỗi lần render POS — con số đó biến 08-02 từ phỏng đoán thành
việc đáng làm. Và nó cũng **sửa lại** một phát biểu của chính tôi: "đóng bill gộp mất 15 giây" là
xấu nhất lý thuyết, đo thật là ~1 giây.

**2. Kiểm giả định rủi ro nhất TRƯỚC khi thiết kế.** 08-01 đặt cược vào việc REST broadcast thay
được WebSocket. Nếu sai thì cả plan phải làm lại. Kiểm trước mất 5 phút: HTTP 202 trong 305ms, và
client đang subscribe nhận được sau 281ms với payload nguyên vẹn.

**3. Cạm bẫy ghi trong plan đã thành thật.** Plan 08-03 cảnh báo "import `print-bridge.mjs` vào
test là khởi động cầu in" — và đúng thế, vitest bị `process.exit(1)` giết. Cùng cái bẫy đó lặp lại
ở `schema-snapshot.mjs`, lần này đã bọc guard ngay từ đầu.

## Những lần đỏ đều là TEST sai, không phải sản phẩm sai

Ghi lại vì đây là chỗ dễ tự lừa mình nhất khi đọc kết quả:

| Đỏ | Sự thật |
|---|---|
| MENU-02 nghiệm thu | Tôi tắt món **thẳng trong DB** → cache không bị xóa, **đúng thiết kế**. Test ghi thẳng DB là test sai |
| ORDER-10 nghiệm thu | Nút "Bắt đầu" bị **vô hiệu hóa** khi SĐT sai; tôi đi bấm nó rồi chờ báo lỗi. Sản phẩm chặn **tốt hơn** cách tôi giả định |
| E2E `p3.spec` | Đỏ vì `pho-viet` ở `service_mode: counter`, không phải vì code. Đã xác minh bằng cách checkout commit trước P8 và chạy lại — đỏ y hệt, cùng dòng |
| `tests/menu/cache.test.ts` | Bắt được **2 hàm** mà script chèn tự động của tôi bỏ sót (`deleteItem`, `updateOption`). Đây là lần test bắt lỗi thật |

Nếu tôi sửa tiêu chí cho khớp thay vì điều tra, cả bốn đã thành "đã nghiệm thu" mà chẳng kiểm được gì.

## Còn lại của P8

**PERF-04 — chờ dữ liệu.** Tiêu chí là *"sau 2 tuần chạy thật, trả lời được: quán nào tốn nhất,
đường nào chậm nhất, POS render bao nhiêu lần mỗi giờ cao điểm"*. Code xong, số nền có, nhưng chưa
có 2 tuần dữ liệu production. Đây là con số quyết định có viết lại realtime (hướng C) hay không →
`QD-016`.

**Hướng C cố ý chưa làm.** Bỏ `router.refresh()` chạm sâu `PosBoard`/`KdsBoard` — hai bề mặt
qt-food dùng thật hằng ngày. Quyết bằng số của PERF-04, không bằng cảm giác.

**Rate limit endpoint ẩn danh cố ý chưa làm.** Chưa đo thì không biết đặt ngưỡng nào; ngưỡng sai
chặn khách thật.

## Rủi ro còn lại của toàn hệ thống (tính tới 24/09/2026)

| # | Rủi ro | Cần gì để đóng |
|---|---|---|
| 1 | **`unstable_cache` trên Vercel khác local** — cache phân tán theo region, `revalidateTag` lan truyền có độ trễ. Mới chứng minh ở local | Deploy rồi đo trên môi trường thật |
| 2 | Migration `0038`–`0041` đã ở production, code còn ở `dev` chưa deploy | Deploy |
| 3 | Cam kết thị giác (modal giữa màn + blur, đủ 7 khối) và bàn phím ảo | Mắt người + điện thoại thật |
| 4 | In ra giấy sau khi đổi cách xác thực (P7) | Máy in ESC/POS |
| 5 | Snapshot không so với migration — sửa tay rồi ghi đè snapshot thì CI vẫn xanh | Thêm job `db diff` khi CI có Docker |
| 6 | qt-food còn service-role key | Chủ dự án đã chấp nhận |

**Không có mục nào trong bảng này tôi đóng được một mình ở local.** Mục 1 và 2 mở ngay khi deploy —
báo tôi lúc deploy xong, tôi kiểm.
