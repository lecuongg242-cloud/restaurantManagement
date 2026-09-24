# 08-02 SUMMARY — POS thôi nạp lại thực đơn mỗi lần refresh

> Thực hiện 24/09/2026. Yêu cầu: PERF-02. Số nền từ `08-04-SUMMARY.md`.

## Tệp đã đổi

| Tệp | Việc |
|---|---|
| `lib/menu/cache.ts` (mới) | `menuTag(tenantId)`, `revalidateMenu(tenantId)` |
| `lib/orders/customer-menu.ts` | Tách tra-tenant (không cache) khỏi đọc-thực-đơn (cache theo `tenantId`) |
| `menu/actions.ts` (9 hàm), `modifiers/actions.ts` (7 hàm), `onboarding/actions.ts` (`seedSampleMenu`) | Gọi `revalidateMenu` sau khi ghi |
| `tests/menu/cache.test.ts` (mới) | 5 test |

## Đo trước/sau

| | `getCustomerMenu` |
|---|---|
| Trước | 575–1.173 ms |
| Sau (ổn định) | **~245 ms** |

5 truy vấn thực đơn không còn chạm DB mỗi lần render. Phần 245ms còn lại là **một** lượt tra
`tenants` — cố ý không cache, để quán bị tạm ngưng chặn được ngay chứ không đợi cache hết hạn.

## Điều rủi ro nhất — đã chứng minh, không chỉ suy luận

Rủi ro của cache không phải hiệu năng mà là **dữ liệu cũ**: nhân viên bấm "hết món" mà khách vẫn
đặt được thì hỏng nghiệp vụ (MENU-02, MENU-04), tệ hơn chậm mà đúng.

**Bước 1 — cache có thật sự cache không?** Đổi tên món **thẳng trong DB** (không qua action, nên
không có `revalidateMenu`):

```
grep "TEN-MOI-CACHE-TEST" trên trang khách → 0
```

Vẫn thấy tên cũ ⇒ cache đang hoạt động.

**Bước 2 — xóa cache có thật sự xóa không?** Chạy đúng đường nhân viên dùng: đăng nhập owner bằng
trình duyệt thật (Playwright), bấm nút "hết món" ở `/admin/menu`, rồi tải lại trang khách:

```
NUT_TREN_ADMIN con=12 het=0
NHAN_HET_TREN_TRANG_KHACH truoc=0 sau=1
SAU_KHI_BAT_LAI=0
```

Khách thấy "Hết" **ngay lần tải kế tiếp**, và bật lại thì mất. Đây là phép kiểm duy nhất chứng minh
được cả chuỗi `server action → revalidateMenu → unstable_cache`; mọi test đơn vị đều không.

## Lưới an toàn cho về sau

`tests/menu/cache.test.ts` **đọc mã nguồn**: mọi `export async function` trong hai tệp action thực
đơn phải gọi `revalidateMenu`. Thêm hàm ghi mới mà quên thì test đỏ và **nêu đích danh tên hàm**,
chứ không phải đợi khách phát hiện hộ.

Lần chạy RED đầu tiên nó liệt kê đủ 16 hàm — đúng danh sách trong plan.

Script chèn tự động của tôi có lỗi dịch vị trí nên **sót 2 hàm** (`deleteItem`, `updateOption`).
Chính test này bắt được, nêu đúng hai tên. Không có nó thì hai lỗ đó đã lọt.

## Đã bỏ khỏi phạm vi so với plan

Plan ghi `setTenantStatus` (ở `/super`) cũng phải gọi `revalidateMenu`. **Không cần**: phần tra
tenant nằm **ngoài** cache, nên tạm ngưng quán có hiệu lực ngay lập tức mà không phụ thuộc cache
thực đơn. Thêm lời gọi ở đó chỉ tạo ấn tượng sai rằng nó cần thiết.

## Test

```
tests/menu/cache.test.ts   5 passed
toàn bộ unit             369 passed
tsc + lint + build       sạch
```
