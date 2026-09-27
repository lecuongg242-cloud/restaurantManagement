# Sao lưu hằng đêm — cài đặt một lần & khôi phục

> Lập 26/09/2026 (P11 · 11-01 · OPS-09 · QD-019 D1). Workflow: `.github/workflows/sao-luu.yml`.

Mỗi đêm **02:00 giờ VN**, GitHub Actions sao lưu production (dữ liệu + ảnh + tự kiểm), **khóa** bằng `age`,
rồi cất 90 ngày ở mục *Actions → Sao lưu hằng đêm → (một lần chạy) → Artifacts*. Lỗi bất kỳ bước nào →
lần chạy đỏ → GitHub gửi email cho chủ repo.

---

## A. Cài đặt một lần (chủ dự án)

### 1. Tạo cặp khóa

Cài `age` trên Windows: `winget install FiloSottile.age` (hoặc tải bản Windows ở trang phát hành của age trên GitHub).

```
age-keygen -o khoa-sao-luu.txt
```

Lệnh in ra một dòng `Public key: age1...` — đó là **khóa công khai** (cho GitHub). Tệp `khoa-sao-luu.txt`
chứa **khóa bí mật** (`AGE-SECRET-KEY-...`).

**Khóa bí mật:**
- Cất ở **hai nơi**: ví dụ máy tính của anh/chị + USB (hoặc trình quản lý mật khẩu).
- **Không** gửi qua Zalo/email, **không** đưa lên GitHub, **không** để trong thư mục dự án.
- Mất khóa bí mật = **mọi** bản sao lưu thành vô dụng. Không có cách lấy lại.

### 2. Thêm secrets vào GitHub

Repo → *Settings → Secrets and variables → Actions → New repository secret*:

| Tên | Giá trị |
|---|---|
| `BACKUP_DB_URL` | Chuỗi kết nối production **non-pooling** (giống `POSTGRES_URL_NON_POOLING` trong `.env.local`) |
| `BACKUP_SUPABASE_URL` | `NEXT_PUBLIC_SUPABASE_URL` của production |
| `BACKUP_SERVICE_ROLE_KEY` | `SUPABASE_SERVICE_ROLE_KEY` của production (để tải ảnh) |
| `BACKUP_AGE_RECIPIENT` | Khóa **công khai** `age1...` ở bước 1 |

### 3. Chạy thử

*Actions → Sao lưu hằng đêm → Run workflow*. Xanh + có artifact `sao-luu-YYYY-MM-DD` là xong. Làm tiếp
phần B tới bước 3 (`kiem` ĐẠT) một lần để chắc chắn khóa bí mật mở được.

---

## B. Khôi phục

Làm trên máy có repo + Node (máy dev).

1. **Tải** artifact của đêm cần khôi phục (tệp `.zip`), giải nén → được `sao-luu-YYYY-MM-DD.tar.gz.age`.
2. **Mở khóa + giải nén:**
   ```
   age -d -i khoa-sao-luu.txt -o sao-luu.tar.gz sao-luu-YYYY-MM-DD.tar.gz.age
   tar -xzf sao-luu.tar.gz
   ```
   Được thư mục `YYYY-MM-DD/` gồm các tệp `.jsonl`, `_tom-tat.json`, `storage-menu-images/`.
3. **Tự kiểm** — phải ĐẠT trước khi làm gì tiếp:
   ```
   node scripts/db-backup.mjs kiem YYYY-MM-DD
   ```
4. **Nạp vào database đích** (project trống đã áp đủ migration — xem `DiTru-Singapore.md` phần dựng project):
   ```
   node scripts/db-backup.mjs restore YYYY-MM-DD "<db-url đích>"
   node scripts/db-backup.mjs verify  YYYY-MM-DD "<db-url đích>"
   ```
   `verify` phải báo **"Mọi bảng khớp."**
5. **Ảnh món:** `restore` chỉ nạp *siêu dữ liệu* ảnh. Nội dung ảnh nằm ở `storage-menu-images/`, tên tệp đã
   đổi `/` thành `__` — tải lên lại bucket `menu-images` đúng đường dẫn gốc (đổi `__` về `/`).
6. Đổi env Vercel sang project đích, deploy, chạy `npm run smoke:prod -- --slug qt-food`.

**Xong thì xóa** `sao-luu.tar.gz` và thư mục đã giải nén — trong đó có tên, SĐT, địa chỉ khách.
