# 10-03 — Summary: Kiểm kê cuối ngày, xuất hủy, chốt sổ ngày

> Yêu cầu: INV-08, INV-09 (+ INV-10). Làm 24/09/2026. TDD.

## Kết quả

| Cam kết | Trạng thái | Bằng chứng |
|---|---|---|
| INV-08 kiểm kê + xuất hủy | ◐ code + kiểm xong | `/admin/inventory/count`. E2E: sổ 1 kg, đếm "0,8" → độ lệch **−200 g** tính lại ở server; "Khác" không ghi chú → bị từ chối; hủy 0,1 kg lý do "hỏng" → dòng `waste` −100 g. Màn ghi rõ "tính cho ngày dd/mm/yyyy" |
| INV-09 chốt sổ bất biến | ◐ | `daily-close.test.ts` 10/10 trên DB thật: tự chốt **đúng D1..D3, không chốt hôm nay**; D1 tồn cuối 700, phở 25.000đ; D2 tồn đầu = 700, kiểm kê −50 → 1.250, phở 30.000đ; D3 giá cũ `stale:D2`; chạy lại không tạo bản thứ hai; **sửa định lượng sau khi chốt → bản chốt D2 vẫn 30.000đ**; owner update/delete → **0 dòng**; quán B đọc → 0 dòng |
| INV-10 | ☑ cho 10-03 | không đổi bảng cũ; quán không có dòng sổ nào thì không chốt gì |

## Số đo

| | Kết quả |
|---|---|
| `npm run test` | **547/547**, 45 file (`close.test.ts` 15 test mới) |
| `npm run test:rls` | **238/238**, 13 file; ma trận **23 bảng** |
| `schema:check` · `tsc` · `lint` · `build` | sạch (30 bảng, 28 hàm, 35 policy) |
| E2E `inventory.spec.ts` | 5/5; 360px không cuộn ngang ở cả 4 tab |
| Dữ liệu thử còn sót sau mọi lượt chạy | 0 dòng ở cả 5 bảng P10 |

Migration **0047 đã áp**: bảng `daily_closes` (chỉ policy select + insert), tách `inventory_usage`
dùng chung, `inventory_on_hand` lấy mốc gốc từ bản chốt gần nhất (test 10-02 vẫn 9/9 sau refactor),
thêm `inventory_day`.

## Lệch so với plan

- **Bỏ nút "Chốt ngày" cho hôm nay.** Plan có nút này. Nhưng chốt lúc quán còn bán thì mọi đơn sau
  thời điểm chốt nằm ngoài sổ vĩnh viễn, vì bản chốt không sửa được. Chỉ **tự chốt các ngày đã qua**
  khi mở khu Nguyên liệu (và khu Báo cáo, ở 10-04).
- **`counted` là cờ đúng/sai, không lưu số đếm tuyệt đối.** Báo cáo hao hụt chỉ cần độ lệch:
  dùng thực tế = dùng lý thuyết + hủy − độ lệch. Số đếm vẫn có trong ghi chú của dòng sổ để tra cứu.
- **Kiểm kê ghi cả độ lệch 0**: "đã kiểm, khớp" phải khác "không kiểm".
- Bản chốt dùng **định lượng tại lúc chốt**. Ngày D chốt vào lần mở trang đầu tiên sau 00:00 ngày
  D+1, nên sửa định lượng *sau* lúc đó không đổi số ngày D — đúng với tiêu chí INV-09.

## Cạm bẫy gặp thật

- Tự chốt nằm ở **layout** của khu Nguyên liệu: chuyển tab bằng điều hướng phía client thì layout
  không render lại. Không sao — chỉ cần chạy một lần sau nửa đêm; 10-04 gọi thêm ở trang Báo cáo.
- Fixture ma trận RLS cho `daily_closes` đặt năm **2000**: năm tương lai sẽ thành "bản chốt gần nhất"
  và làm test chốt sổ tưởng mọi ngày đã chốt.
- `daily-close.test.ts` từ chối chạy nếu `pho-viet` còn dòng sổ từ lần trước, và báo rõ lý do, thay vì
  cho ra kết quả sai.

## Còn chờ

Checkpoint người thật: một tối kiểm kê thật 3–5 nguyên liệu; sáng hôm sau mở trang, xem ngày hôm qua đã
tự chốt và tồn đầu ngày đúng số đếm.
