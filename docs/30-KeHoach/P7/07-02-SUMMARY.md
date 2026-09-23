# 07-02 SUMMARY — Cầu in bỏ service-role

> Thực hiện 23/09/2026. Yêu cầu: PRINT-05. Kế hoạch: `07-02-PLAN.md`. Quyết định: QD-012 §1.
> **Trạng thái: code xong, CHƯA nghiệm thu trên phần cứng, CHƯA chuyển đổi qt-food.**

## Tệp đã đổi

| Tệp | Việc |
|---|---|
| `supabase/migrations/0038_printer_role.sql` (mới) | `memberships_role_check` nhận `printer` |
| `lib/auth/session.ts` | `Role` thêm `"printer"` |
| `lib/auth/rbac.ts` | `canAccess` trả `false` cho `printer` ở mọi khu vực |
| `lib/print/bridge-account.ts` (mới) | `bridgeEmailForSlug`, `provisionPrintBridgeAccount` |
| `app/super/actions.ts` | `createPrintBridgeAccount` (lớp mỏng kiểm quyền) |
| `app/super/tenant-actions.tsx`, `page.tsx` | Form “Tài khoản cầu in” |
| `scripts/print-bridge.mjs` | Đăng nhập email/mật khẩu; tenant suy từ token; `--test-auth` |
| `scripts/print-pack.ps1` | Không còn đóng gói service-role; thêm `-BridgePassword` |
| `.env.local.example`, `docs/50-PhienBan/V1x-CauInBep.md` | Quy trình lắp đặt mới |
| `tests/auth/rbac.test.ts`, `tests/print/bridge-account.test.ts`, `tests/rls/printer-account.test.ts` | Test |

## Bằng chứng: bán kính thiệt hại đã thu hẹp

Cùng một truy vấn `/rest/v1/tenants?select=slug`, hai loại khóa:

```
KHOA_CAU_IN_THAY   = ["bun-bo"]
SERVICE_ROLE_THAY  = ["bun-bo","pho-viet","qt-food"]
```

Đó là toàn bộ lý do tồn tại của phần việc này. Trước: một laptop quán bị mất = lộ **mọi** nhà
hàng. Sau: lộ **một** nhà hàng, và chỉ ở mức đọc qua PostgREST thô.

```
grep -c SERVICE_ROLE scripts/print-bridge.mjs  →  0
grep -c PRINT_TENANT scripts/print-bridge.mjs  →  0
node scripts/print-bridge.mjs --test-auth      →  Đăng nhập OK. Cầu in phục vụ tenant b61ecc31-…
```

`--test-auth` chạy với `.env.local` **không có** service-role key. Thiếu biến thì báo lỗi chỉ
thẳng chỗ cấp tài khoản, không phải lỗi mơ hồ.

## Test

```
tests/auth/rbac.test.ts            81 passed   (+5 test printer)
tests/print/bridge-account.test.ts  3 passed
tests/rls/printer-account.test.ts   6 passed
```

Test đáng chú ý: *“chỉ thấy đúng MỘT nhà hàng — đây là bán kính thiệt hại khi lộ khóa”*. Nó giữ
cho tính chất trên không âm thầm mất đi khi ai đó sửa policy sáu tháng sau.

## Lỗi test bắt được (nếu không TDD thì lên production mới biết)

`provisionPrintBridgeAccount` ban đầu dùng `upsert(..., { onConflict: "tenant_id,user_id" })`.
Test đỏ ngay:

```
Error: Không gán được quyền cầu in: there is no unique or exclusion constraint matching the ON CONFLICT specification
```

`uniq_membership_tenant_user` (0001) là index **một phần** (`where user_id is not null`), mà
`ON CONFLICT` không khớp được index có điều kiện. Đổi sang tra-rồi-ghi.

## Phát hiện ngoài kế hoạch: `scripts/print-pack.ps1`

Kế hoạch bỏ sót script đóng gói bộ cài. Nó đọc `SUPABASE_SERVICE_ROLE_KEY` từ `.env.local` repo và
ghi thẳng vào `.env.local` của bộ cài mang tới quán — tức là **nguồn** của chính lỗ hổng. Sửa
luôn: chỉ lấy `NEXT_PUBLIC_SUPABASE_ANON_KEY`, và bắt buộc truyền `-BridgePassword`.

## CHƯA XONG — cần người thao tác

1. **In thử trên máy in phần cứng.** Không có máy in ESC/POS ở môi trường này. Phần đã kiểm là
   đăng nhập + quyền đọc/ghi `print_jobs`; phần chưa kiểm là luồng từ `print_jobs` ra giấy —
   luồng đó không đổi ở plan này, nhưng chưa chạy lại sau khi đổi xác thực.
2. **Chuyển đổi cầu in qt-food.** `cau-in-qt-food/.env.local` (gitignore đã chặn, không bị commit)
   vẫn đang giữ service-role key, và laptop tại quán qt-food cũng vậy. Chủ dự án yêu cầu không
   chạm vào qt-food nên **không** thực hiện. Quy trình đã ghi trong `50-PhienBan/V1x-CauInBep.md`:

   `/super` → cấp tài khoản → `print-pack.bat -BridgePassword "…"` → chép `.env.local` mới sang
   laptop quán → `node print-bridge.mjs --test-auth` → khởi động lại tác vụ `CauInBep`.

   **Làm ngoài giờ phục vụ**: trong lúc đổi, phiếu bếp không tự in. Quy trình đầy đủ (sao lưu,
   từng bước, đọc lỗi, cách quay lại trong 30 giây, dọn bản sao cũ) ở §*Chuyển đổi quán đang chạy*
   trong cùng tài liệu đó.

3. **Xoay `SUPABASE_SERVICE_ROLE_KEY`.** Chuyển cầu in làm laptop thôi *dùng* khóa cũ, nhưng khóa
   đó vẫn còn hiệu lực và đã nằm ngoài tầm kiểm soát nhiều tháng (laptop quán, file zip bộ cài,
   Downloads, lịch sử chat). Ai đã copy thì vẫn mở được dữ liệu mọi nhà hàng. Việc này rủi ro khác
   hẳn — xoay JWT secret sẽ đăng xuất toàn bộ nhân viên và phải cập nhật Vercel env ngay — nên tách
   riêng, nhưng đừng bỏ.

> Chừng nào chưa làm bước 2, lỗ hổng vẫn còn nguyên **ở quán qt-food**. Code đã sẵn sàng, nhưng
> mã nguồn sạch không tự làm cho cái key trên laptop ngoài kia biến mất.

## Rủi ro còn lại (đã cân nhắc, chấp nhận — QD-012 §1)

Tài khoản `printer` vẫn có membership ở tenant nên `auth_tenant_ids()` vẫn cho nó **đọc các bảng
khác của chính quán đó** qua PostgREST thô (đơn, bill của quán mình). Bịt nốt đòi hỏi policy nhận
biết vai trò trên cả 18 bảng — thay đổi rộng, rủi ro cao, lợi ích nhỏ vì kẻ cầm được máy đặt tại
quán đó vốn đã đứng trong quán đó. Hướng nếu cần siết tiếp: helper `auth_is_printer()` + loại trừ
trong policy từng bảng.
