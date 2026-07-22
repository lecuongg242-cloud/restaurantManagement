# 03-04 SUMMARY — Hủy món có kiểm soát (PIN + lý do + log)

> Thực thi 22/07/2026. Trạng thái: **CHỜ NGHIỆM THU** (checkpoint human-verify).
> Requirements: ORDER-05 (hủy món đã gửi bếp cần PIN manager/cashier + lý do, có log).

## File đã đổi / thêm
| File | Loại | Vai trò |
|---|---|---|
| `lib/auth/pin-gate.ts` | thêm | `verifyPinForRoles({tenantId, membershipId, pin, allowedRoles})` — so bcrypt pin_hash + kiểm role, thông điệp lỗi CHUNG. Tái dùng cho P4 (đóng bill/giảm giá). |
| `app/r/[slug]/pos/actions.ts` | sửa | `cancelOrderItem` — guard POS + lý do bắt buộc + gate PIN (owner/manager bỏ qua) + item→cancelled (cancel_reason + cancelled_by) + roll-up + broadcast. |
| `app/r/[slug]/pos/page.tsx` | sửa | Nạp danh sách manager/cashier + cờ `isPrincipal` → truyền xuống board. |
| `lib/orders/pos.ts` | sửa | PosItem thêm `cancel_reason` (hiển thị log hủy trong panel). |
| `components/pos/PosBoard.tsx` | sửa | Thread `cancelStaff` + `canCancelWithoutPin` → OrderPanel. |
| `components/pos/OrderPanel.tsx` | sửa | Nút "Hủy" mỗi món chưa served/cancelled; dòng "Đã hủy · [lý do]"; render CancelItemDialog. |
| `components/pos/CancelItemDialog.tsx` | thêm | Chọn người duyệt (manager/cashier) + PinPad (tái dùng P1) + lý do; owner/manager bỏ PIN; lỗi tại chỗ; nhắc "sửa món = hủy + thêm mới". |

## Bằng chứng (tự động, chạy thật)
**Build/lint:** `tsc` sạch; `next lint` 0 warning; `next build` OK (route `/pos` 10.1 kB).

**Gate PIN + cancel + roll-up + log** (bcryptjs thật + SQL remote, staff test PIN đã biết):
```
cashier + 1234       → OK
cashier + 9999 (sai) → chặn (thông điệp chung)
waiter  + 5678 đúng  → chặn (sai quyền — CÙNG thông điệp, không lộ)
không tồn tại        → chặn
HỦY món1 → status=cancelled | cancel_reason="khách đổi ý" | cancelled_by=<cashier>  (log truy vết)
ROLL-UP hủy 1 (còn ready) → order=ready
ROLL-UP hủy hết           → order=cancelled
```
Dữ liệu + staff test đã dọn sạch.

## Cam kết must_haves
- [x] Món đã gửi bếp chỉ hủy được sau khi nhập PIN manager/cashier + lý do bắt buộc.
- [x] Waiter/kitchen (sai quyền) hoặc PIN sai → từ chối **cùng thông điệp** ("PIN hoặc quyền không hợp lệ") — không lộ điều kiện.
- [x] Item hủy: `status=cancelled` + `cancel_reason` + `cancelled_by` (log truy vết ai hủy).
- [x] Roll-up: mọi món cancelled → order cancelled; còn lại ready → order ready.
- [x] Broadcast → khách + KDS phản chiếu realtime (KDS bỏ món hủy khỏi vé — đã subscribe UPDATE ở 03-03).
- [x] Owner/manager đăng nhập email hủy KHÔNG cần PIN (vẫn bắt lý do), `cancelled_by` = membership của họ.
- [x] "Sửa món" = hủy dòng + Thêm món mới (quyết định P3 #3) — nhắc trong dialog.

## Bảo mật (D7)
- PIN so bcrypt **ở server** (`verifyPinForRoles`); client (PinPad) không giữ hash.
- Thông điệp lỗi không phân biệt sai-PIN vs sai-quyền vs không-tồn-tại.

## Còn lại cho manual verify (checkpoint — POS + KDS 2 cửa sổ)
1. Order 2 món đã duyệt (vé ở KDS). POS panel → "Hủy" 1 món: bỏ trống lý do → chặn.
2. Chọn waiter + PIN → từ chối "PIN hoặc quyền không hợp lệ". Chọn cashier + PIN sai → cùng thông điệp.
3. Cashier + PIN đúng + lý do → hủy: KDS bỏ món khỏi vé realtime; panel gạch + "Đã hủy · [lý do]".
4. Hủy nốt món còn lại → order cancelled; khách thấy đơn hủy.
5. Đăng nhập owner → hủy không cần PIN (vẫn bắt lý do).
