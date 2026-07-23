# BẢN ĐỒ LIÊN KẾT & TÀI KHOẢN

> Cập nhật: 2026-07-23. Gom mọi đường link (route) + tài khoản đăng nhập của dự án vào một chỗ.
> Ví dụ dùng slug `pho-viet`. Thay `pho-viet` bằng slug nhà hàng khác khi cần. Nguồn sự thật: route
> thật trong `app/`, seed trong `scripts/seed.mjs` + `supabase/seed.sql`.

## 1. URL gốc theo môi trường
| Môi trường | Base URL | Ghi chú |
|---|---|---|
| local | `http://localhost:3000` | `npm run dev` |
| dev | Vercel preview (branch `dev`) | Preview URL của Vercel |
| prod | Vercel production (branch `main`) | Domain thật |

**Định tuyến tenant:** theo path `/r/[slug]/...` (middleware đặt header `x-tenant-slug`). Nhánh
subdomain đã viết sẵn nhưng **TẮT** (`ENABLE_SUBDOMAIN=false`, bật ở V2). Không có redirect ở
middleware — guard quyền nằm ở layout/page.

## 2. Tài khoản đăng nhập

### Super-admin (quản trị SaaS)
| Vai trò | Email | Mật khẩu | Vào |
|---|---|---|---|
| Super-admin | `super@demo.test` | `SuperPass123!` | `/super` |

### Owner / Station (tài khoản demo seed — mật khẩu mạnh)
| Nhà hàng | Owner | Station (thiết bị) |
|---|---|---|
| Phở Việt (`pho-viet`) | `ownerA@pho-viet.test` / `DemoPass123!` | `station@pho-viet.test` / `StationPass123!` |
| Bún Bò (`bun-bo`) | `ownerB@bun-bo.test` / `DemoPass123!` | `station@bun-bo.test` / `StationPass123!` |

### Nhân viên — đăng nhập Email + PIN (QD-009)
Đăng nhập thẳng ở `/pos/login` hoặc `/kds/login` bằng **email + PIN 4 số** → vào ngay bề mặt.

**Nhân viên seed (`npm run seed`):**
| Nhà hàng | Tên | Vai trò | Email | PIN |
|---|---|---|---|---|
| pho-viet | Lan | Thu ngân | `lan@pho-viet.test` | `1234` |
| pho-viet | Hùng | Bếp | `hung@pho-viet.test` | `5678` |
| bun-bo | Mai | Phục vụ | `mai@bun-bo.test` | `4321` |

**Nhân viên đã backfill trên DB hiện tại (PIN tạm `1234`, đổi ở `/admin/staff`):**
| Nhà hàng | Tên | Vai trò | Email | PIN |
|---|---|---|---|---|
| pho-viet | Cuong | Phục vụ | `cuong@pho-viet.staff.local` | `1234` |
| pho-viet | Lan | Thu ngân | `lan@pho-viet.staff.local` | `1234` |
| pho-viet | Hùng | Bếp | `hung@pho-viet.staff.local` | `1234` |
| bun-bo | Mai | Phục vụ | `mai@bun-bo.staff.local` | `1234` |

> Owner/manager cũng đăng nhập được ở `/pos/login` (dùng mật khẩu thường thay PIN).

## 3. Bản đồ route

### Chung / marketing
| URL | Mô tả | Truy cập |
|---|---|---|
| `/` | Trang marketing | Công khai |
| `/style-guide` | Style-guide design system | Công khai (nội bộ) |

### Super-admin
| URL | Mô tả | Truy cập |
|---|---|---|
| `/super/login` | Đăng nhập super-admin | Công khai |
| `/super` | Bảng điều khiển SaaS | Super-admin |
| `/super/new` | Tạo nhà hàng + owner | Super-admin |

### Khách hàng — `/r/pho-viet/...` (không cần đăng nhập)
| URL | Mô tả | Truy cập |
|---|---|---|
| `/r/pho-viet` | Trang landing nhà hàng | Công khai |
| `/r/pho-viet/menu?...` | Menu gọi món qua QR bàn | Công khai (cần token bàn để đặt) |
| `/r/pho-viet/online` | Đặt món mang về / giao | Công khai, ẩn danh |
| `/r/pho-viet/reserve` | Đặt bàn online | Công khai |
| `/r/pho-viet/order/[id]` | Theo dõi trạng thái đơn | Công khai (theo id đơn) |

### Admin (owner / manager) — `/r/pho-viet/admin/...`
| URL | Mô tả | Truy cập |
|---|---|---|
| `/r/pho-viet/admin/login` | Đăng nhập khu admin | Công khai |
| `/r/pho-viet/admin` | Bảng tổng quan admin | owner/manager |
| `/r/pho-viet/admin/menu` | Quản lý danh mục & món | owner/manager |
| `/r/pho-viet/admin/menu/modifiers` | Nhóm tùy chọn + phụ thu | owner/manager |
| `/r/pho-viet/admin/tables` | Khu vực, bàn | owner/manager |
| `/r/pho-viet/admin/staff` | Nhân viên (email + PIN) | owner/manager |
| `/r/pho-viet/admin/settings` | Cấu hình nhà hàng | owner/manager |
| `/r/pho-viet/admin/onboarding` | Wizard khởi tạo | owner/manager |
| `/r/pho-viet/admin/reports` | Báo cáo doanh thu | owner/manager |
| `/r/pho-viet/admin/data-scope` | Kiểm chứng phạm vi dữ liệu (RLS) | owner/manager |

### POS — `/r/pho-viet/pos/...` (đăng nhập email + PIN)
| URL | Mô tả | Truy cập |
|---|---|---|
| `/r/pho-viet/pos/login` | Đăng nhập nhân viên (email + PIN) | Công khai |
| `/r/pho-viet/pos` | Sơ đồ bàn + gọi món + thanh toán | cashier/waiter/owner/manager |
| `/r/pho-viet/pos/online` | Hàng đợi đơn online (nhận → bếp → thu tiền) | cashier/waiter/owner/manager |
| `/r/pho-viet/pos/reservations` | Đặt bàn theo ngày (duyệt, đặt hộ) | cashier/waiter/owner/manager |

### KDS (bếp) — `/r/pho-viet/kds/...` (đăng nhập email + PIN)
| URL | Mô tả | Truy cập |
|---|---|---|
| `/r/pho-viet/kds/login` | Đăng nhập nhân viên bếp (email + PIN) | Công khai |
| `/r/pho-viet/kds` | Màn hình bếp realtime | kitchen/owner/manager |

### In ấn — `/r/pho-viet/print/...`
| URL | Mô tả | Truy cập |
|---|---|---|
| `/r/pho-viet/print/qr` | In QR các bàn | owner/manager |
| `/r/pho-viet/print/kitchen/[orderId]` | Phiếu bếp | Nhân viên phiên POS/KDS |
| `/r/pho-viet/print/receipt/[billId]` | Hóa đơn khách | Nhân viên phiên POS |

### API (route handler)
| URL | Mô tả | Truy cập |
|---|---|---|
| `POST /r/pho-viet/api/order` | Khách gửi order QR | Công khai (token bàn) |
| `GET /r/pho-viet/api/order/[id]` | Đọc trạng thái order | Công khai (id) |
| `POST /r/pho-viet/api/online-order` | Khách gửi đơn mang về/giao | Công khai |

## 4. Ghi chú
- **Đăng nhập nhân viên** đã đổi sang **email + PIN 1 bước** (QD-009): không còn bước "Chọn nhân
  viên"; tài khoản `station` giữ tương thích nhưng không còn bắt buộc.
- **Tài liệu cũ lệch**: một số plan P5 ghi `/admin/reservations`, `/admin/online` — thực tế trong
  code hai màn này nằm ở `/pos/reservations` và `/pos/online` (đã chuyển khỏi khu admin).
- Guard quyền theo vai trò xem `lib/auth/rbac.ts` (`canAccess`); cách ly tenant do RLS
  (`auth_tenant_ids()`), không phân biệt vai trò ở tầng DB.
