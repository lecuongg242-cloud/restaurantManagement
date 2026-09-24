# BUG — Phiếu bếp thất lạc (174 lượt `failed`, 122 không bao giờ tới bếp)

> Điều tra 24/09/2026, phát hiện trong lúc truy bug "in trùng".
> Trạng thái: **đã sửa phần thử lại (1)**; mục (2) và (3) chưa làm.

## Quy mô

qt-food, phiếu bếp:

| Trạng thái | Số lượt | Gần nhất |
|---|---|---|
| `printed` | 4.203 | **24/09/2026** — cầu in đang chạy bình thường |
| `failed` | **174** | 16/09/2026 |
| `pending` treo | 11 | 14/08/2026 |

Lỗi rải trên **28 ngày** (02/08 – 16/09), đỉnh **43 lượt ngày 10/09**. Tám ngày gần đây không có
lỗi nào.

## Hậu quả thật

| | |
|---|---|
| Lượt lỗi | 174 |
| Được in lại thành công sau đó | **52** |
| **Không bao giờ in lại** | **122** |
| Trong 122 đó: vẫn phục vụ được | **121** |
| Bị hủy | 1 |

Nhà hàng **xoay xở được** — nhân viên thấy chip đỏ rồi báo miệng xuống bếp. Nên đây là ma sát vận
hành, không phải mất đơn. Nhưng 122 lần bếp phải làm việc mà không có phiếu là 122 lần dựa vào trí
nhớ con người giữa giờ cao điểm.

## Nó còn làm hỏng số liệu của bug kia

66/203 cặp "in trùng" phiếu bếp có dính một lượt `failed` — tức là nhân viên bấm lại vì lần trước
không ra giấy. Một phần con số "in trùng" thật ra là **phản ứng đúng** trước bug này, không phải
lỗi riêng. Sau khi cầu in biết thử lại, nhóm đó phải tự giảm; nếu không giảm thì giả thuyết sai.

## Nguyên nhân gốc

`scripts/print-bridge.mjs` — gặp lỗi gửi là **đánh dấu hỏng luôn, không thử lại**:

```js
} catch (err) {
  await markJob(job.id, { status: "failed" }).catch(() => {});
  log(`IN LỖI phiếu ${job.id}: ${err.message} — bấm in lại ở POS sau khi sửa máy in.`);
}
```

`sendToPrinter` ném khi máy in không với tới được: rút dây, mất điện máy in, đổi IP, hoặc chỉ là
một nhịp nghẽn mạng LAN (timeout socket 8 giây). **Một cú chớp mạng = một phiếu mất vĩnh viễn**,
trừ khi có người để ý chip đỏ rồi bấm in lại.

Việc phục hồi đang hoàn toàn dựa vào con người, giữa lúc đông khách — và số liệu cho thấy con
người bỏ sót **70%** (122/174).

## Rò rỉ thứ hai: 11 phiếu `pending` treo vĩnh viễn

Cầu in chỉ lấy phiếu mới hơn `MAX_JOB_AGE_MIN` (mặc định 30 phút):

```js
const since = new Date(Date.now() - MAX_JOB_AGE_MIN * 60_000).toISOString();
... &created_at=gte.${since}
```

Chốt này có lý do đúng (bật lại cầu in sau một đêm thì không tuôn cả chục phiếu của hôm qua),
nhưng phiếu quá hạn **không được đánh dấu gì cả** — chúng nằm mãi ở `pending`, và POS hiện "chưa
in" vĩnh viễn cho những đơn đó.

## Hướng sửa đề nghị

**1. Thử lại trước khi bỏ cuộc** (sửa gốc) — ✅ **ĐÃ LÀM**.

`thuLaiGui` trong `scripts/print-bridge.mjs`: 1 lần đầu + **2 lần thử lại**, chờ giãn dần
**1s → 3s**, chỉ đánh `failed` sau khi hết lượt. Ném lỗi của **lần cuối** để log nói đúng nguyên
nhân thật. Số lần chỉnh được qua `PRINT_RETRY` (0 = giữ hành vi cũ).

Chờ giãn dần chứ không dội liên tiếp: máy in đang nghẽn mà bắn liên tục vào thì chỉ nghẽn thêm.

Kiểm trên cầu in thật, trỏ vào cổng chết:

```
IN LỖI phiếu f5000000-…-bb (đã thử 3 lần): connect ECONNREFUSED 127.0.0.1:9 — bấm in lại ở POS…
```

Trước: bỏ cuộc ngay lần đầu. Sau: thử đủ 3 lần trong ~4 giây rồi mới báo hỏng.
Test: `tests/print/retry.test.ts` 6/6 — gồm cả "hỏng rồi thành công thì KHÔNG mất phiếu".

**2. Phiếu quá hạn phải có kết cục rõ ràng.** Đánh `failed` kèm lý do "quá hạn" thay vì để treo
`pending` mãi. POS hiện đúng trạng thái thay vì "đang chờ" giả.

**3. (Cân nhắc) Báo động khi lỗi dồn.** Nhiều lượt `failed` liên tiếp trong ít phút = máy in đang
hỏng thật, đáng báo rõ ở POS chứ không chỉ chip đỏ trên từng đơn. Ngày 10/09 có 43 lượt — gần như
chắc chắn là máy in hỏng suốt một ca mà không ai xử lý sớm.

## Lưu ý khi triển khai

Cầu in ở qt-food **vẫn là bản cũ** (còn giữ service-role, chưa có nhịp thích ứng của PERF-03). Mọi
sửa đổi ở đây chỉ có tác dụng sau khi chuyển đổi cầu in — xem `50-PhienBan/V1x-CauInBep.md`
§Chuyển đổi quán đang chạy. Nên gộp cả ba thay đổi vào **một** lần ra quán, thay vì bắt người lắp
đi lại nhiều lần.
