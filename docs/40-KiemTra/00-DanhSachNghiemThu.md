# DANH SÁCH NGHIỆM THU — chuyển `◐` thành `☑`

> Lập 24/09/2026. Nguồn: `20-DanhSachYeuCau/00-Requirements.md`.
> Mục đích: biến 44 mục "code xong, chờ checkpoint" thành việc làm được trong vài buổi ngồi.

## Cách dùng

Mỗi dòng là **mở đâu → làm gì → phải thấy gì**. Thấy đúng thì đánh dấu và đổi `◐` thành `☑` trong
`00-Requirements.md`. Thấy sai thì ghi lại hiện tượng, đừng tự sửa tiêu chí cho khớp.

Gom theo **phiên** chứ không theo mã yêu cầu: ngồi một chỗ, mở một bề mặt, làm hết việc của bề mặt
đó. Đi theo thứ tự mã sẽ phải nhảy qua lại giữa 4 màn hình.

Tài khoản: `ownerA@pho-viet.test` / `DemoPass123!` · super-admin `super@demo.test` / `SuperPass123!`.
Dùng **tenant demo** (`pho-viet`, `bun-bo`), không nghiệm thu trên qt-food đang phục vụ khách.

---

## Phần A — đã xác minh bằng máy, có thể đổi ☑ ngay

Bốn mục dưới đây có tiêu chí chấp nhận **hoàn toàn tự động**, không cần ai nhìn. Bằng chứng chạy
ngày 23–24/09/2026.

| Mã | Bằng chứng | Chạy lại bằng |
|---|---|---|
| TENANT-05 | Ma trận RLS 127 test + 3 fixture; đối chứng âm bằng bảng canary xác nhận bắt được policy sai | `npm run test:rls` |
| TENANT-06 | Build production + curl: 5 bề mặt của quán bị ngưng đều hiện màn tạm ngưng (HTTP 200, không vòng lặp), `api/order` → 404, quán khác không ảnh hưởng, bật lại dữ liệu nguyên vẹn | `npx vitest run tests/rls/suspend.test.ts tests/tenant/active.test.ts` |
| PRINT-05 | `grep -c SERVICE_ROLE scripts/print-bridge.mjs` = 0; `--test-auth` chạy được với `.env.local` không có service-role; đo thật: token cầu in thấy **1** quán, service-role thấy **3** | `npx vitest run tests/rls/printer-account.test.ts tests/print/bridge-account.test.ts` |
| REPORT-04 | `report_summary(qt-food, 01/08→24/09)` = **565.880.000đ / 5.327 hóa đơn**, khớp tuyệt đối với `select` chạy thẳng trên Postgres. 5.327 > 1.000 nên đã vượt qua đúng ngưỡng mà PostgREST từng cắt | Truy vấn đối chiếu trong `30-KeHoach/P7/07-01-SUMMARY.md` |

> **Lưu ý cho REPORT-04:** truy vấn đối chiếu phải dùng `bills_revenue.business_at`, **không** phải
> `bills.paid_at`. Dùng sai cột sẽ ra lệch ~10 hóa đơn và tưởng là lỗi doanh thu (đã vấp một lần —
> xem QD-013).

---

## Phần A+ — đã TỰ ĐỘNG hóa bằng trình duyệt (24/09/2026)

`tests/e2e/nghiem-thu.spec.ts` chạy bằng Chromium trên localhost. Chạy lại:

```bash
npm run build && PORT=3005 npm run start     # cửa sổ khác
npx playwright test tests/e2e/nghiem-thu.spec.ts
```

10/10 xanh. Mỗi dòng dưới đây **thay thế** phần tương ứng trong danh sách thủ công:

| Mã | Phần đã tự động | Phần CÒN phải xem bằng mắt |
|---|---|---|
| ORDER-07 | Link thiếu token → ẩn hành động cần bàn | Thẻ nhận diện: tên quán, tên bàn, tên khách sửa được, 2 lối hỗ trợ |
| ORDER-10 | Tên trống → không gửi được · SĐT sai định dạng → không gửi được · bỏ SĐT → gửi được | Modal ở GIỮA màn, nền che + blur |
| MENU-02 / MENU-04 | Tắt "hết món" ở admin → khách thấy "Hết" ở lần tải kế tiếp | Tắt từ **POS** bằng tài khoản cashier; tắt **option** trong nhóm tùy chọn |
| MKT-01 | Không tràn ngang ở 360px · không còn link `/style-guide` hay `/r/pho-viet` | Đủ 7 khối, ảnh chụp từ tenant demo |
| MKT-02 | SĐT sai → **không** ghi vào `leads` | Lời cảm ơn khi gửi đúng; gửi 2 lần trong 60s → 1 bản ghi |
| REPORT-05 | `from > to`, kỳ > 400 ngày, ngày rác → **không** lỗi 500 | 43 cột ngày với khoảng cụ thể; 6 preset |
| AUTH-05 | Owner **thấy** mục Cài đặt (đối chứng dương) | Manager **không** thấy; gõ thẳng `/admin/settings` bị đá về |
| TENANT-06 | 3 bề mặt của quán bị ngưng đều chặn | — (đã ☑) |

> **Vì sao vẫn còn cột phải xem bằng mắt:** những thứ như "modal ở giữa màn", "nền che + blur",
> "đủ 7 khối" là cam kết về **cảm nhận thị giác**. Máy khẳng định được phần tử tồn tại, không
> khẳng định được nó trông đúng. Tự động hóa phần đó chỉ tạo cảm giác an toàn giả.

### Ba lần đỏ đầu tiên đều là test sai, không phải sản phẩm sai

Ghi lại vì đây là cái bẫy dễ mắc khi đọc kết quả nghiệm thu:

1. **MENU-02** — tôi tắt món **thẳng trong DB**, cache không bị xóa (đúng thiết kế), nên khách vẫn
   thấy món còn bán. Test ghi thẳng DB là **test sai**. Sửa: đi đúng đường nhân viên dùng (bấm nút
   ở `/admin/menu`).
2. **ORDER-10** — nút "Bắt đầu" bị **vô hiệu hóa** khi SĐT sai; tôi lại đi bấm nó rồi chờ báo lỗi.
   Sản phẩm chặn **tốt hơn** cách tôi giả định.
3. **MKT-02 / ORDER-10** — selector sai (`placeholder` thật là "Nguyễn Văn A", "VD: Anh Nam").

Không lần nào là lỗi sản phẩm. Nhưng nếu tôi sửa tiêu chí cho khớp thay vì điều tra, cả ba đã
thành "đã nghiệm thu" mà chẳng kiểm được gì.

## Phiên 1 — Khu admin, đăng nhập owner (~30 phút)

Mở `/r/pho-viet/admin`.

- [ ] **MENU-01** Thực đơn → tạo 1 danh mục, 1 món (ảnh, giá, mô tả) → sửa tên → kéo đổi thứ tự →
      xóa. Mỗi thao tác phải thấy đổi ngay, không phải tải lại trang.
- [ ] **MENU-01** Upload ảnh **> 2MB** → phải bị từ chối kèm thông báo, không âm thầm bỏ qua.
- [ ] **MENU-03** Thực đơn → Nhóm tùy chọn → tạo nhóm có `min/max/required`, thêm option có phụ
      thu → gắn vào món. Mở `/r/pho-viet/menu` bằng điện thoại: option hiện đúng, chọn thiếu so với
      `min` thì không thêm vào giỏ được.
- [ ] **MENU-02** Tắt "hết món" một món ở admin → mở `/menu` khách: món hiện mờ + nhãn "Hết", bấm
      không thêm được vào giỏ.
- [ ] **TABLE-01** Khu vực & bàn → tạo 1 khu, 2 bàn có số ghế → **in QR**: file ra phải in được,
      mỗi bàn một mã riêng.
- [ ] **ORDER-13** Cài đặt → upload **ảnh bìa** (ngang) + **avatar** trong một lần lưu. Mở trang
      chào bàn: bìa full-width, lớp tối nhẹ ở đáy, avatar tròn viền trắng nhô lên đè bìa.
- [ ] **OPS-06** Logo + tên quán hiện ở: header khách, header admin, đầu hóa đơn, đầu phiếu bếp.
      Chrome sản phẩm giữ nguyên theme, không đổi màu theo quán.
- [ ] **AUTH-06** `/admin/staff` → owner tạo được thành viên vai trò **Quản lý** bằng mật khẩu ≥8
      ký tự (không phải PIN 4 số).
- [ ] **AUTH-06** Đăng nhập bằng chính manager vừa tạo → form nhân viên **không có** lựa chọn vai
      trò "Quản lý"; không sửa/xóa được membership của owner.
- [ ] **AUTH-05** Vẫn phiên manager: sidebar **không có** mục "Cài đặt". Gõ thẳng
      `/r/pho-viet/admin/settings` → bị đá về `/admin`.

## Phiên 2 — Khách trên điện thoại thật, màn 360px (~30 phút)

Quét QR bàn hoặc mở `/r/pho-viet?t=<token>`. **Dùng điện thoại thật**, không phải chế độ responsive
của trình duyệt — ba mục dưới đây đều về bàn phím ảo và chỉ lộ ra trên máy thật.

- [ ] **ORDER-07** QR đúng token → thẻ nhận diện (tên quán, tên bàn, tên khách sửa được) + 2 lối hỗ
      trợ + nút vào thực đơn. Mở link **thiếu token** → chế độ chỉ-xem, ẩn mọi hành động cần bàn.
- [ ] **ORDER-10** Vừa vào bàn → modal giữa màn hình, nền che tối + mờ: **tên bắt buộc**, SĐT tùy
      chọn nhưng nhập sai định dạng VN thì báo lỗi tại ô.
- [ ] **ORDER-11** Chạm ô nhập trong sheet (giỏ hàng, ghi chú món, gọi nhân viên, lý do hủy) →
      sheet **không trôi lên**, không mất phần trên, ô nhập vẫn chạm được khi bàn phím mở.
- [ ] **ORDER-01/09** Gọi món xong → nút chat nổi mở panel "Đơn của bạn" liệt kê đơn đã gửi **từ
      máy này** kèm trạng thái + tạm tính. Để panel **đang mở**, nhờ người ở POS duyệt đơn → panel
      phải tự đổi trạng thái, không cần đóng mở lại.
- [ ] **ORDER-06** Bấm "Gọi nhân viên", chọn chip gợi ý hoặc tự ghi → POS hiện banner "bàn đang
      gọi" kèm nội dung, realtime. Nhân viên bấm đánh dấu đã xử lý → banner tắt.
- [ ] **ORDER-08** Bấm "Gọi thanh toán" → chọn tiền mặt/chuyển khoản/thẻ → POS thấy ngay trong cùng
      danh sách gọi, nội dung mở đầu bằng "Thanh toán · ".

## Phiên 3 — POS + KDS, hai máy cạnh nhau (~45 phút)

`/r/pho-viet/pos` và `/r/pho-viet/kds`.

- [ ] **AUTH-03** Đăng nhập POS và KDS bằng **email + PIN 4 số** của cashier/waiter/kitchen → vào
      thẳng đúng bề mặt, hiện đúng tên người đó. Không còn bước "Chọn nhân viên".
- [ ] **ORDER-12** Khách gửi đơn → POS hiện banner full-width nền kem viền primary ngay dưới
      header, có chuông rung, chip từng đơn (bàn · giờ · số món). Bấm chip → mở drawer duyệt.
- [ ] **MENU-04** Ngay tại POS bật/tắt "hết món" → món mờ + nhãn "Hết" trong `MenuPanel`, không
      thêm vào giỏ được. Làm bằng tài khoản **cashier** (không phải owner) để chứng minh quyền mở
      đúng mức.
- [ ] **ORDER-05** Hủy một món **đã gửi**: tài khoản waiter phải bị từ chối; manager/cashier nhập
      PIN + **bắt buộc ghi lý do** thì mới hủy được.
- [ ] **BILL-06** Bàn đang có bill `open` → hủy 1 món → tổng bill giảm **đúng** tiền món đó. Hủy
      hết món → bill bị xóa, bàn về "chưa có hóa đơn". Bill đã `paid` **không** bị đụng.
- [ ] **BILL-07** Áp giảm giá qua PIN của người khác (không phải người đang đăng nhập) → mở
      `/admin/reports` khối "Giảm giá": phải ghi tên **chủ nhân mã PIN**, không phải người đăng nhập.
- [ ] **ORDER-14** Đơn mang về/tại quầy đang chờ → bấm **"Gọi thêm"** → ô "Đơn mới" đổi sang chế độ
      nối, hiện rõ *"Đang thêm vào Đơn #N"* + nút bỏ liên kết → gửi → ra **đơn thật** (phiếu bếp
      riêng) nhưng khi thu tiền chỉ **một hóa đơn, một lần thu**.
- [ ] **ORDER-17** Tab "Đã xong" → đơn/món bị hủy hiện `Đã hủy HH:MM · "<lý do>" · <tên> (<vai
      trò>)`. Hủy cả đơn thì lý do hiện **một lần** ở đầu thẻ, không lặp ở từng món.
- [ ] **ORDER-18** Chip **Tất cả / Đã thu / Đã hủy**: lọc phải chạy ở server — đơn nằm ngoài trang
      hiện tại vẫn ra. Dòng tổng kết tách rõ `<N> đơn đã thu · <tiền>` và `<M> đơn hủy`.
- [ ] **ORDER-04** Khách gửi đơn → vé hiện trên KDS **≤ 3 giây**, không ai bấm gì. Bấm đồng hồ đo.

## Phiên 4 — Báo cáo (~30 phút)

`/r/pho-viet/admin/reports`. Chạy `npm run seed:demo pho-viet` trước nếu dữ liệu thưa.

- [ ] **REPORT-01** 3 KPI: tổng doanh thu, số bill, trung bình/bill — đổi theo mốc thời gian chọn.
- [ ] **REPORT-05** Bấm đủ 6 preset (Hôm nay/Hôm qua/7 ngày/30 ngày/Tháng này/Tháng trước) + lịch
      tùy chọn. Gõ URL `?from=2026-07-01&to=2026-08-12` → biểu đồ đúng **43 cột ngày**. Gõ
      `from > to` hoặc kỳ > 400 ngày → tự về tháng này, **không lỗi 500**.
- [ ] **REPORT-06** Kỳ 1 ngày → 24 cột giờ · kỳ 30 ngày → theo ngày · kỳ 180 ngày → theo tuần
      (mốc thứ Hai) · kỳ > 1 năm → theo tháng.
- [ ] **REPORT-07** Mỗi KPI có delta % đúng dấu so kỳ trước. Chọn kỳ mà kỳ trước = 0 → hiện "–",
      không phải `NaN`/`∞`. "Tháng này" phải cắt **đến hôm nay** và kỳ trước cắt bằng số ngày.
- [ ] **REPORT-02** Khối theo món xếp theo **tiền đóng góp**, không theo số lượng; tỷ trọng 2 chữ
      số thập phân.
- [ ] **REPORT-03** Tách tiền mặt / chuyển khoản; tổng hai cột = tổng doanh thu.
- [ ] **REPORT-08** Ba chiều: nhóm món · nơi phục vụ · khu vực & bàn. Σ mỗi chiều = KPI doanh thu.
      Quán **chế độ quầy** có đơn `takeaway` không gắn bàn phải hiện **"Tại quán"**, không phải
      "Mang về". Quán không có bàn nào → **ẩn hẳn** khối khu vực & bàn.
- [ ] **REPORT-09** Kỳ ≥ 7 ngày → heatmap 7×24; KPI "Giờ cao điểm" trỏ đúng ô đậm nhất.
- [ ] **REPORT-10** Khối "Món bị hủy": 3 KPI + theo người duyệt + top món + chi tiết. Gồm **cả
      dine-in lẫn mang về**.
- [ ] **REPORT-11** KPI "Hủy sau khi đã in phiếu bếp" + cột *sau khi in* + cột *đã in lúc*. Khối
      riêng "Đơn đã in phiếu bếp · hủy toàn bộ · chưa ghi nhận thanh toán". Món hủy **trước** khi in
      **không** được vào chỉ số. Dòng chưa xét được hiện riêng "chưa xét được N món".
- [ ] **REPORT-12** Khối "Giảm giá": ai duyệt · số lượt · tổng tiền giảm · tỷ trọng. Lượt giảm
      **trước** migration `0037` hiện "Không rõ", không suy đoán ngược.

## Phiên 5 — Trang giới thiệu + khu super (~20 phút)

- [ ] **MKT-01** Mở `/` → đủ 7 khối: hero · 3 nỗi đau · ảnh báo cáo · 4 bề mặt · lưới 10 tính năng
      · vì sao tin được · CTA cuối. **Không** còn link `/style-guide` hay `/r/pho-viet`. Thu về
      360px: không vỡ, không tràn ngang.
- [ ] **MKT-02** Gửi form với SĐT sai → báo lỗi tại ô, **không** ghi DB. Gửi đúng → lời cảm ơn.
      Gửi 2 lần cùng số trong 60 giây → chỉ **1** bản ghi.
- [ ] **MKT-03** (phần UI — phần khóa kín đã xác minh bằng máy) `/super/leads` liệt kê tên · SĐT
      bấm gọi được (`tel:`) · ghi chú · thời điểm; nút "Đã gọi" đổi trạng thái.
- [ ] **OPS-01** Mở app trên **local**, **dev** (Vercel preview từ branch `dev`) và **prod** (từ
      `main`) — cả ba đều vào được. *Chưa làm được cho tới khi P7 được deploy.*

## Phiên 6 — Onboarding, cần người ngoài team (~20 phút)

- [ ] **TENANT-03** Nhờ **một người không thuộc team** tạo nhà hàng mới + 10 món + 5 bàn + in QR.
      **Bấm đồng hồ.** Đạt khi ≤ 15 phút. Đây là phép đo thật, không phải tự ước lượng — người
      trong team đã biết đường đi nên đo ra số vô nghĩa.

## Phiên 7 — Cần phần cứng máy in (~20 phút)

Ba mục này đang `☐`, gộp vào đây vì cùng cần máy in ESC/POS.

- [ ] **PRINT-02** Bấm in phiếu bếp → giấy ra ở **bếp**, đủ: bàn, giờ, món + SL + tùy chọn + ghi
      chú. Khổ 58/80mm rõ, không tràn.
- [ ] **PRINT-03** Bấm in hóa đơn → giấy ra ở **quầy**, đủ: tên quán, bàn, món + giá, các dòng điều
      chỉnh, tổng. Khổ 80mm không tràn.
- [ ] **PRINT-01/02** Cầu in: `node print-bridge.mjs --test-auth` → OK; rồi in thật một phiếu để
      xác nhận luồng `print_jobs` → giấy vẫn chạy sau khi đổi cách xác thực (P7).

---

## Không nằm trong danh sách này

| Mã | Vì sao |
|---|---|
| OPS-02 | "Migration chạy tự động khi merge" cần secrets CI được cấu hình — kiểm sau khi deploy. Vế "schema dev = prod" đã xử lý ở `0040`/`0041` (QD-013). |
| OPS-04 (PWA) | Chưa code (`☐`). |
| ORDER-15/16 | E2E đang đỏ do `pho-viet` ở `service_mode: counter` — lệch giữa test và dữ liệu, sửa test trước rồi mới nghiệm thu. |

## Sau khi làm xong

1. Đổi `◐` → `☑` trong `20-DanhSachYeuCau/00-Requirements.md` cho từng mục đã xác nhận.
2. Đánh dấu `[x]` cho P2–P7 trong `00-TongQuan/Roadmap.md`.
3. Mục nào **không** đạt: ghi hiện tượng quan sát được vào đây, mở việc sửa. Đừng nới tiêu chí cho
   khớp hiện trạng — tiêu chí là thứ duy nhất còn lại để biết sản phẩm có đúng như đã hứa không.
