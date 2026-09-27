# 11-06 SUMMARY — Cầu in tự cập nhật + bảng cầu in `/super`

> Thực hiện 27/09/2026. Yêu cầu: PRINT-12, PRINT-13. Quyết định: QD-019 D8.
> **Trạng thái: code + migration 0053 xong; tự cập nhật, SHA sai, quay về bản cũ đều CHẠY THẬT trên
> Windows (cmd.exe + Node 26 và Node 24 đi kèm). Còn: một vòng thật ở quán sau khi qt-food cài lại
> bằng bộ cài chung (bộ cài cũ không có `POS_URL` nên chưa tự cập nhật được).**

## Tệp đã đổi

| Tệp | Việc |
|---|---|
| `scripts/print-bridge.mjs` | `BRIDGE_VERSION = 2` (1 = mọi bản trước), `MA_THOAT_DA_CAP_NHAT = 4`, `nenCapNhat`, `khopSha`; nhịp tim gửi `p_version`; kiểm bản mới lúc khởi động + mỗi giờ; **thoát ở điểm an toàn** (xem dưới); chạy khỏe 5 phút → xóa bộ đếm chết liên tiếp |
| `scripts/print-bridge.bat` | Mã 4 → chạy lại ngay; chết bất thường → đếm vào `loi-lien-tiep.txt`; 3 lần liên tiếp + có `print-bridge.old.mjs` → quay về bản trước |
| `lib/print/bridge-release.ts` (mới) | Đọc `scripts/print-bridge.mjs` đang deploy: phiên bản từ hằng, SHA từ nội dung — **một nguồn duy nhất** |
| `app/api/bridge/latest/route.ts`, `…/file/route.ts` (mới) | Công bố `{version, sha256, url}` và nội dung tệp; `no-store` |
| `next.config.ts` | `outputFileTracingIncludes` cho hai route — không có thì hàm trên Vercel không mang tệp theo (đã kiểm trong `.nft.json`) |
| `supabase/migrations/0053_bridge_version.sql` (mới) | Cột `printer_heartbeats.version`; **thay** hàm 2 tham số bằng 3 tham số (drop trước — không overload) |
| `lib/print/cau-in-super.ts` (mới), `app/super/BridgeTable.tsx` (mới), `app/super/page.tsx` | Bảng "Cầu in các quán": cách in · sống/chết · máy in · phiên bản; quán cần chú ý lên đầu. Dùng lại `trangThaiMayIn` của 09-05 |
| `tests/rls/bridge-activation.test.ts` | Khôi phục `print_mode` + dọn nhịp tim của quán demo sau test (xem "lỗi của tôi") |

## Bằng chứng

```
tests/print/cap-nhat.test.ts         11 passed (quyết định cập nhật, SHA, mã thoát, server công bố đúng tệp + SHA, route)
tests/print/cau-in-super.test.ts      5 passed
tests/rls/printer-heartbeat.test.ts  15 passed — kèm phiên bản → lưu; gọi kiểu 0043 (không tham số) và 0044 (2 tham số)
                                      → vẫn chạy, GIỮ phiên bản; chủ quán vẫn không giả được
toàn bộ unit 635 · test:rls 264 · tsc · lint · build · schema:check sạch
build: scripts/print-bridge.mjs có trong .nft.json của /api/bridge/latest và /api/bridge/latest/file
```

**Cầu in thật của qt-food sau migration 0053** (chạy bản cũ, gọi 2 tham số): nhịp tim vẫn cập nhật đều
30 giây (17:25:07 → 17:25:37 UTC), `version = null` — đúng.

**Chạy thật trên Windows** (server local phát hành bản 2, tài khoản cầu in thật của quán demo):

| Kịch bản | Kết quả |
|---|---|
| Cầu in bản 1 → tự cập nhật | "Đã tải cầu in bản 2 (đang chạy bản 1)"; tệp thành bản 2, `print-bridge.old.mjs` = bản 1; **mã thoát 4 ở 10/10 lần** (Node 26 × 5, Node 24 đi kèm × 5) |
| Server giả: bản 99, SHA sai | "KHÔNG khớp SHA-256 — bỏ qua, giữ bản 2"; không thay tệp; **cầu in chạy tiếp** tới khi bị `timeout` dừng |
| `print-bridge.bat`, bản mới chết liên tục | chết ×3 → "QUAY VE BAN TRUOC" → bản cũ chạy; `.old` và bộ đếm được dọn |
| `print-bridge.bat`, mã 4 | "Da cap nhat cau in - chay ban moi" → chạy lại ngay; **không** tạo bộ đếm lỗi |

**`/super` mở bằng trình duyệt thật** (super-admin demo): bảng hiện qt-food "Cầu in · Sống · Phản hồi ·
cũ (trước 11-06)" — đúng, cầu in ở quán chưa có tự cập nhật; nút "Mã cài cầu in" (11-05) hiện đúng.

## Lỗi thật tìm ra khi chạy — không test đơn vị nào bắt được

**`process.exit(4)` ngay trong lúc tải → mã thoát 127**, kèm `Assertion failed: !(handle->flags &
UV_HANDLE_CLOSING), file src\win\async.c`. libuv trên Windows hủy ngang tiến trình khi thoát giữa lúc
một socket khác đang đóng dở — ứng viên là bước thử máy in của nhịp tim chạy song song. Hậu quả nếu lọt:
bat thấy 127 → coi là chết → đếm lỗi → sau 3 lần cập nhật **tự quay về bản cũ** vô cớ. Tái hiện rút gọn
(fetch + exit, fetch Supabase dở + exit) **không** ra lỗi — nên sửa theo hướng không phụ thuộc thủ phạm:
chỉ đặt cờ, thoát ở đầu vòng poll sau khi dừng nhịp định kỳ và chờ nhịp tim đang chạy xong.

## Lỗi của tôi

Test `bridge-activation` (11-05) đổi mã trên fixture A/B — **chính là hai quán demo** `pho-viet`/`bun-bo`
— làm chúng sang `print_mode = bridge` mà không trả lại. Lộ ra nhờ bảng `/super` vừa làm ("bun-bo: Cầu
in · Chưa có"). Sửa test lưu/khôi phục settings + dọn nhịp tim; dọn dữ liệu hiện có; kiểm lại sau cả bộ
RLS: `pho-viet=browser`, `bun-bo=browser`, `qt-food=bridge`.

## Chưa kiểm được

- Vòng thật ở quán: qt-food cần cài lại một lần bằng bộ cài chung (11-05) để có `POS_URL` → từ đó tự
  cập nhật. Sau đó: tăng `BRIDGE_VERSION`, deploy, xem `/super` chuyển qt-food sang bản mới trong ≤ 1 giờ.
- Nghiệm thu 5 (tắt cầu in máy thử → dòng đổi "chết" ≤ 2 phút) mới kiểm qua dữ liệu có sẵn (pho-viet "MẤT
  KẾT NỐI" sau khi cầu in thử dừng), chưa bấm giờ.
