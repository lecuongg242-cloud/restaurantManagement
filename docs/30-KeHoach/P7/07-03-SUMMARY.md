# 07-03 SUMMARY — Khóa nhà hàng (`suspended`) thực thi ở DB

> Thực hiện 23/09/2026. Yêu cầu: TENANT-06. Kế hoạch: `07-03-PLAN.md`. Quyết định: QD-012 §2.

## Tệp đã đổi

| Tệp | Việc |
|---|---|
| `supabase/migrations/0039_suspend_gate.sql` (mới) | `auth_tenant_ids()` chỉ trả tenant `active` |
| `lib/tenant/active.ts` (mới) | `activeTenantBySlug()`, `isTenantActive()` |
| `components/tenant/TenantSuspended.tsx` (mới) | Màn “Nhà hàng đang tạm ngưng” |
| `app/r/[slug]/layout.tsx` | Chốt chặn cho mọi bề mặt `/r/[slug]/*` |
| `lib/orders/customer-menu.ts`, `create-order.ts`, `online.ts`, `lib/reservations/reservations.ts`, `app/r/[slug]/api/order/[id]/route.ts` | Tra tenant qua helper |
| `tests/rls/suspend.test.ts`, `tests/tenant/active.test.ts` | Test |

## Trước khi thay `auth_tenant_ids()` — kiểm tương đương

Hàm này nằm trên đường đi của **mọi** policy tenant, và DB có qt-food đang phục vụ khách. Sai một
chữ là POS của họ đứng giữa ca. Nên so tập `(user_id, tenant_id)` của logic cũ và logic mới trước
khi swap:

```
TUONG_DUONG = {"cu_n":10, "moi_n":10, "mat_di":0, "them_vao":0}
QUAN_KHONG_ACTIVE = []
```

Khớp 100%. Hiện không quán nào ở trạng thái khác `active`, nên với dữ liệu hôm nay thay đổi này là
**no-op** cho mọi người dùng — kể cả qt-food.

## RED → GREEN

Trước migration, lỗ hổng lộ rõ:

```
× ngưng B → owner B đọc mọi bảng đều ra 0 dòng
  AssertionError: memberships: quán bị ngưng vẫn đọc được: expected […(4)] to have a length of +0 but got 4
× ngưng B → owner B không thấy cả dòng tenants của mình
× ngưng B → owner B không GHI được nữa
      Tests  3 failed | 3 passed (6)
```

Sau migration: `6 passed (6)`.

## Không hồi quy — bằng chứng chính

```
npm run test:rls  →  Test Files 5 passed (5)   Tests 148 passed (148)
```

Bao gồm nguyên 127 test ma trận của 07-01. Đây là lý do 07-01 phải làm trước: viết lại
`auth_tenant_ids()` mà không có ma trận thì không có cách nào biết mình vừa làm thủng bảng nào.

## Chạy thật (build production, port 3123)

Ngưng `bun-bo`:

```
/r/bun-bo/menu        -> HTTP 200 | Nhà hàng đang tạm ngưng
/r/bun-bo/pos         -> HTTP 200 | Nhà hàng đang tạm ngưng
/r/bun-bo/kds         -> HTTP 200 | Nhà hàng đang tạm ngưng
/r/bun-bo/admin       -> HTTP 200 | Nhà hàng đang tạm ngưng
/r/bun-bo/admin/login -> HTTP 200 | Nhà hàng đang tạm ngưng
```

`curl -L --max-redirs 5` không báo lỗi vòng lặp — chốt chặn render thẳng, không chuyển hướng.

API (không đi qua layout):

```
/r/bun-bo/api/order/<uuid>  -> 404
/r/bun-bo/api/call          -> 400, không ghi dòng nào
```

Quán khác không ảnh hưởng: `/r/pho-viet/menu` và `/r/qt-food/menu` đều HTTP 200, không hiện màn
tạm ngưng. Bật lại `bun-bo` → `/r/bun-bo/menu` trở lại bình thường, dữ liệu nguyên vẹn.

## Cái bẫy mà kế hoạch đã lường trước

Quán bị ngưng làm `auth_tenant_ids()` rỗng → policy `tenants_member_read` giấu luôn dòng tenant →
`getSessionMembership` trả `null` → guard admin đá về `/admin/login` → đăng nhập lại **thành công**
→ lặp vô hạn. Vì vậy layout **render** màn tạm ngưng chứ không `redirect`. Không chuyển hướng thì
không có vòng lặp nào để mà sai.

## Đánh đổi đã chấp nhận (QD-012 §2)

Khóa là **tức thì và toàn phần**. Quán đang phục vụ khách mà bị ngưng nhầm thì POS đứng ngay giữa
ca — không có ân hạn, không có cảnh báo trước. Đó đúng là hành vi mong muốn của một công tắc khóa,
và thao tác ngưng nằm sau `/super` chỉ super-admin vào được.

## Cam kết vs thực tế

| Cam kết trong PLAN | Trạng thái |
|---|---|
| `auth_tenant_ids()` chỉ trả tenant active | ✅ 0039, đã áp, kiểm tương đương trước |
| 6 test suspend | ✅ 6/6 |
| 3 test `activeTenantBySlug` | ✅ 3/3 |
| Ma trận 07-01 không hồi quy | ✅ 148/148 |
| 5 bề mặt hiện màn tạm ngưng, không vòng lặp | ✅ chạy thật |
| API của quán đã ngưng bị chặn | ✅ 404 / 400 |
| Super-admin vẫn bật lại được, dữ liệu nguyên vẹn | ✅ |
| `tsc` + `lint` + `build` sạch | ✅ (341 unit test cũng xanh) |
