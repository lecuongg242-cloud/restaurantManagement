# BUG — "Bấm in một lần nhưng ra nhiều tờ"

> Báo cáo 24/09/2026. Nguồn: chủ dự án báo từ qt-food.
> Trạng thái: **giai đoạn 1 đã sửa và kiểm**; giai đoạn 2 chưa làm (xem cuối).

## Bằng chứng — dữ liệu thật, không phải phỏng đoán

`print_jobs` là bảng log: mỗi lượt in để lại một dòng. Đếm theo đơn trên qt-food:

| Loại phiếu | Đơn có >1 lượt | Bản thừa |
|---|---|---|
| Phiếu khách | 326 | **364** |
| Phiếu bếp | 138 | **203** |

Khoảng cách giữa hai lượt liên tiếp — chỗ tách "lỗi" khỏi "in lại có chủ ý":

| Khoảng cách | Phiếu khách | Phiếu bếp |
|---|---|---|
| **< 2 giây** | 12 | 20 |
| 2–10 giây | 84 | 20 |
| 10–60 giây | 153 | 67 |
| > 60 giây | 115 | 96 |

Nhỏ nhất **0,63 giây**. Cụm dưới 2 giây không thể là người bấm hai lần có ý thức.

## Tái hiện được

```
BAN_DAU=1
SAU_KHI_MO_TRANG_IN=2          (+1)
SAU_KHI_DOI_KHO_GIAY=3         (+1)   ← bấm link đổi khổ giấy = in thêm một tờ
```

## Nguyên nhân gốc

Nguyên tắc bị vi phạm: **"in" là hành động của con người, nhưng hệ thống suy nó ra từ một sự kiện
điều hướng** (trang in được mở). Điều hướng xảy ra vì nhiều lý do chẳng liên quan gì tới việc muốn
có tờ giấy.

**A. Nút in không bị khóa** — `components/pos/TicketPrintButtons.tsx`

`<button onClick={printKitchen}>` không có `disabled`, không có cờ in-flight. Mỗi lần bấm là một
`queueKitchenTicketPrint` → một dòng `pending` → **cầu in ra một tờ giấy thật**. Bấm đúp = hai tờ.

**B. Việc in gắn với "trang được mở"** — `components/print/{Kitchen,Customer,Receipt}*Doc.tsx`

```tsx
const ran = useRef(false);
useEffect(() => { if (ran.current) return; ran.current = true; log(...); setTimeout(() => window.print(), 400); }, [...]);
```

`ran` chỉ chặn trong **một lần mount**. Link đổi khổ giấy `<a href="?w=80">` là điều hướng →
remount → ghi thêm lượt **và** `window.print()` chạy lại. Đây là đường dễ vấp nhất vì nút đổi khổ
nằm ngay cạnh phiếu.

`print_jobs` không có ràng buộc chống trùng nào, dù dự án đã có sẵn hạ tầng `idempotency_keys`
(migration `0034`) dùng cho đơn và thanh toán.

## Đã sửa — giai đoạn 1

| # | Sửa | Tệp |
|---|---|---|
| 1 | Khổ giấy thành state phía client, **không điều hướng** | 3 tệp `*Doc.tsx` |
| 2 | Khóa nút in 2 giây khi đang gửi (`disabled` + cờ) | `TicketPrintButtons.tsx` |
| 3 | Server bỏ qua lượt trùng trong **3 giây**, trả `ok` thay vì tạo dòng mới | `lib/print/dedupe.ts` + 2 action |

### Vì sao 3 giây

Không phải con số tròn cho đẹp. Dữ liệu cho thấy hai cụm **tách bạch**:

- double-fire: 0,63 – 2 giây
- in lại có chủ ý: dồn ở > 10 giây

Ba giây nằm trong khoảng trống giữa hai cụm — chặn lỗi mà không chặn ý định. Nới lên 30 giây sẽ
nuốt mất lượt in lại thật của nhân viên (giấy kẹt, in mờ), và họ sẽ không hiểu vì sao bấm mà không
ra giấy.

Lỗi hạ tầng khi kiểm trùng → **không chặn**. In thừa thì bỏ tờ giấy; in thiếu thì bếp không biết mà
làm.

## Kiểm chứng

| Test | Kết quả |
|---|---|
| `tests/e2e/in-trung.spec.ts` — đổi khổ giấy không tạo lượt mới | đỏ trước khi sửa → **xanh** sau |
| `tests/rls/print-dedupe.test.ts` — 6 phép cửa sổ 3 giây, kể cả không rò chéo tenant | **6/6** |
| Toàn bộ | 375 unit · 156 RLS · 17 E2E xanh |

## Một test tôi CỐ Ý không giữ

Test "tải lại trang in thì không ghi thêm lượt" **đã bỏ**. Đo thật: một lần `reload` mất ~6,5 giây,
vượt cửa sổ 3 giây nên không bị chặn — và điều đó **đúng thiết kế**: tải lại sau 6 giây là một hành
động khác của người dùng, không phải "bấm một lần ra nhiều tờ".

Nới cửa sổ cho test đó xanh là chữa triệu chứng của test, không phải chữa bug.

## Còn lại

**Giai đoạn 2 — tách lệnh in khỏi sự kiện mở trang.** Lượt in do **nút bấm** tạo ra; trang in chỉ
còn là nơi hiển thị. Đúng bản chất nhất, nhưng chạm sâu vào luồng qt-food dùng hằng ngày. Giờ đã có
log theo tenant (PERF-04) nên **đo được** số bản thừa có giảm không rồi mới quyết.

**Cụm 2–10 giây (104 cặp)** chưa được xử lý. Nhiều khả năng là "nhân viên sốt ruột bấm lại vì không
thấy gì xảy ra" — đó là vấn đề **phản hồi**, không phải vấn đề chống trùng. Nới cửa sổ để nuốt nó
sẽ chặn nhầm ý định thật. Đo lại sau khi giai đoạn 1 chạy thật rồi mới quyết.

## Phát hiện kèm theo — có thể nghiêm trọng hơn

Phiếu bếp của qt-food có **174 lượt `failed`** và **11 lượt `pending` treo**: ít nhất 174 lần bếp
**không nhận được phiếu**. In thiếu thường đau hơn in thừa. Đây là bug riêng, chưa điều tra.
