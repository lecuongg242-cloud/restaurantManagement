# 09-02 — Sao lưu tự động + đường lui · BÁO CÁO (dở dang)

> Yêu cầu: **OPS-09**. 24/09/2026. **Phần không phụ thuộc quyết định đã xong; lịch chạy chờ `QD-015`.**

## Đã xong

| Hợp đồng | Kết quả |
|---|---|
| **Tự kiểm** | `kiem` đọc CHÍNH tệp dữ liệu: đủ tệp · đúng số dòng · mọi dòng là JSON · mã băm · đủ ảnh. 13 test |
| **Nói được tuổi** | `tuoi <thư-mục-cha> [giờ]` — bản mới nhất bao giờ; **không có bản nào → mã 1** |
| **Một lệnh để đặt lịch** | `day-du` = dump + ảnh + tự kiểm |
| Mã băm | `dump` ghi sha256 từng bảng vào tệp tóm tắt |

Lệnh npm: `db:backup:day-du`, `db:backup:kiem`, `db:backup:tuoi`.

## Lỗ hổng tìm ra — và bằng chứng

**`verify` cũ không đọc tệp dữ liệu.** Nó đối chiếu tệp *tóm tắt* với database đích. Đối chứng âm
trên bản sao lưu thật, cắt bớt đúng một hóa đơn:

| | Bản sao lưu mất 1 hóa đơn |
|---|---|
| `verify` cũ | `OK public.bills: sao lưu 6071 / đích 6071` · **Mọi bảng khớp.** · mã 0 |
| `kiem` mới | **HỎNG** · `public.bills: có 6070 dòng, tóm tắt ghi 6071` · mã 1 |

Bản sao lưu hỏng mà trông như lành là loại an toàn giả plan đã cảnh báo — nay có số chứng minh nó
có thật. (Bản đối chứng chứa PII nên đã xóa ngay sau khi chạy.)

**`chepAnh` gặp ảnh tải lỗi chỉ ghi log rồi đi tiếp** — "18/19" mà lệnh vẫn thành công. `kiem` so số
tệp ảnh với số object trong bucket nên bắt được.

## Chạy thật

```
kiem backup-restaurant-20260924    ĐẠT (bản cũ, chưa có mã băm — nói rõ điều đó)
kiem backup-sg1-1128               ĐẠT (như trên)
day-du sao-luu/2026-09-24-p9       28 bảng · 19/19 ảnh · ĐẠT, đúng mã băm
tuoi sao-luu 24                    0 giờ · ĐẠT · mã 0
tuoi <thư mục rỗng>                KHÔNG có bản sao lưu nào · mã 1
tuoi sao-luu 0  (giả lập quá hạn)  QUÁ HẠN · mã 1
```

Bản `sao-luu/2026-09-24-p9` là **bản sao lưu đầy đủ mới nhất** của production, nằm ngoài repo.

## Diễn tập khôi phục

**Đã diễn tập thật một lần — chính là lần chuyển SG1 → SG2 sáng 24/09:** 42 migration, 27 bảng
`verify` khớp, **doanh thu 693.415.000đ khớp tuyệt đối**, 19/19 ảnh, 159/159 RLS.

**Còn thiếu** so với nghiệm thu: lần đó chạy bằng công cụ **cũ** (không có `kiem`), và không đo thời
gian tới lúc app chạy lại. Diễn tập lại cần một project trống, mà gói free chỉ có 2 slot — xem
`QD-015` phương án C (nạp lại vào SG1 mỗi đêm = diễn tập mỗi đêm).

## Chờ chủ dự án

`QD-015`: nơi cất (A/B/C), ngưỡng chịu mất (đề xuất 24 giờ), ai giữ khóa. Chưa chốt thì **chưa đặt
lịch** — plan ghi rõ "chọn sai không lộ ra cho tới ngày mất dữ liệu".

**Không xóa SG1** cho tới khi diễn tập bằng công cụ mới xong.

## Đã sửa trong plan

Cảnh báo "database ở lại trạng thái tắt kiểm tra khóa ngoại" — **sai**. `set session_replication_role`
chỉ sống trong phiên kết nối.
