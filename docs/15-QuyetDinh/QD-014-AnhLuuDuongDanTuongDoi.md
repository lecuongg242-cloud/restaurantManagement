# QD-014 — Ảnh lưu đường dẫn tương đối, ghép host lúc đọc

**Ngày:** 24/09/2026 · **Trạng thái:** đã áp dụng

## Bối cảnh

`menu_items.image_url`, `tenants.logo_url`, `tenants.cover_url` lưu **URL tuyệt đối** do
`getPublicUrl()` sinh ra, tức là nhúng tên project Supabase vào dữ liệu:

```
https://<project-ref>.supabase.co/storage/v1/object/public/menu-images/<tenant>/<tệp>.png
```

Khi chuyển database sang Singapore, 10 dòng vẫn trỏ vào project Mỹ đã xóa. Toàn bộ ảnh món của
qt-food vỡ, phải vá bằng một lệnh `UPDATE` trên quán đang bán hàng. Dữ liệu và hạ tầng lẽ ra phải
độc lập với nhau, nhưng ở đây một cái thay đổi thì cái kia hỏng.

## Quyết định

Database lưu **đường dẫn tương đối trong bucket** (`<tenantId>/<tệp>.png`). Host ghép lúc đọc từ
`NEXT_PUBLIC_SUPABASE_URL`.

- `urlAnh(v)` — giá trị trong DB → URL hiển thị. Đặt ở **biên đọc** (10 chỗ truy vấn DB), không
  đặt ở component: 13+ component chỉ nhận prop, bắt chúng gọi helper là luật sai và luật sai thì
  sẽ bị tắt đi.
- `duongDanAnh(v)` — giá trị bất kỳ → đường dẫn để lưu và để xóa tệp.

Cả hai **nuốt được dữ liệu cũ lẫn mới**. URL cũ trỏ host đã chết được viết lại sang host hiện tại.
Nhờ vậy không có khoảnh khắc nào ảnh vỡ, dù deploy code trước hay chuyển dữ liệu trước.

`duongDanAnh` trả `null` cho URL nằm ngoài bucket — nó không phải tệp của ta, xóa theo là xóa nhầm.

## Đánh đổi

Mỗi lần đọc phải ghép chuỗi. Không đáng kể so với việc mỗi lần đổi hạ tầng lại phải sửa dữ liệu
sản xuất bằng tay.

Đổi lại, **không thể** trỏ ảnh sang CDN ngoài bằng cách ghi thẳng URL vào cột nữa. Hiện không có
nhu cầu đó; nếu sau này có, `urlAnh` đã giữ nguyên URL ngoài bucket nên vẫn mở đường.

## Phương án đã cân nhắc và loại

| Phương án | Vì sao loại |
|---|---|
| Giữ URL tuyệt đối, mỗi lần đổi hạ tầng chạy `UPDATE` | Chính là việc vừa phải làm trên quán đang bán hàng. Không có gì nhắc, lần sau sẽ lại quên. |
| Chuyển đổi ở component thay vì biên đọc | 13+ component so với 10 biên đọc, và mỗi component mới là một cơ hội quên. |
| Cột sinh (generated column) ghép host trong Postgres | Host là cấu hình ứng dụng, đưa vào schema thì đổi host phải chạy migration — đúng thứ đang muốn tránh. |

## Nghiệm thu

`tests/storage/public-url.test.ts` — 11 test. Gồm một **chốt chặn** quét `app/` + `components/` +
`lib/`, đỏ nếu có truy vấn nào đọc cột ảnh mà không qua helper. Ngoại lệ hẹp cho phép `!!x.logo_url`
(chỉ hỏi có ảnh hay không, không có URL thoát ra). Đã kiểm chứng bằng vi phạm giả.

**Kết quả trên production:** 10 dòng đã chuyển, 0 URL tuyệt đối còn lại, 9/9 ảnh trên trang khách
trả `http=200`. Xác nhận code mới đã chạy bằng một canary trên tenant demo `bun-bo` (đặt đường dẫn
tương đối, thấy production trả về URL đầy đủ), không đụng dữ liệu qt-food.
