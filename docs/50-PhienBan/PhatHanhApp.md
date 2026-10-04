# Phát hành app — Thu ngân (Windows, Android) và Quản lý (Android)

> Lập 04/10/2026 (P30). Lần phát hành gần nhất: **04/10/2026** — Thu ngân Windows **1.0.4**, Thu ngân Android **1.0.1**,
> Quản lý Android **1.0.0**. Quyết định: QD-026 (Windows), QD-030 (Android), QD-033 (Quản lý).

Web (Vercel) **không** cần phát hành app: giao diện POS / Màn bếp / Quản trị / Quản lý ở máy chủ. Chỉ phát hành app khi đổi
code trong `desktop/` hoặc `android/` (vỏ app, cầu in, menu ☰, tự cập nhật…).

## Công cụ trên máy dev

| Công cụ | Nằm ở | Ghi chú |
|---|---|---|
| **GitHub CLI `gh`** | `C:\Users\lecuong\tools\gh\bin\gh.exe` | **Đã đăng nhập** `lecuongg242-cloud` (keyring, quyền `repo`). Thư mục đã thêm vào **PATH của tài khoản Windows** (04/10/2026) — terminal / VS Code mở TRƯỚC ngày đó phải mở lại mới thấy. Kiểm: `gh auth status` |
| **JDK 17** (build Android) | `C:\Users\lecuong\tools\jdk17` | Không có trong PATH — đặt `JAVA_HOME` trước khi chạy `gradlew` / script Android |
| **Android SDK** + máy ảo | `%LOCALAPPDATA%\Android\Sdk` | Máy ảo kiểm: `techmenu-35` (Android 15, WebView 124) — chạy kèm `-dns-server 8.8.8.8,1.1.1.1` mới ra mạng |
| **Khóa ký Android** | `C:\Users\lecuong\techmenu-khoa-ky\` (`techmenu-android.jks` + `mat-khau.txt` + `DOC-TRUOC.txt`) | Alias `techmenu`. **Ngoài repo**, giữ ≥ 2 bản sao. Mất khóa = máy đã cài không lên được bản mới. Cả hai app Android ký cùng khóa (chứng chỉ SHA-256 `ae654a27…`) |

Nơi đặt tệp: **GitHub Releases của repo** — Windows: mỗi bản một tag `thu-ngan-v<x.y.z>` (bản mới nhất phải là "Latest");
Android: một bản phát hành nhãn cố định `android` chứa các APK + tệp chỉ mục `android-latest.json` (Thu ngân),
`android-quan-ly-latest.json` (Quản lý). App web chuyển tiếp qua `/api/desktop/*` và `/api/android/*?app=`.

## Thu ngân Windows

```bash
cd desktop
npm version patch --no-git-tag-version   # 1.0.4 → 1.0.5
npm run release                          # build → quét bí mật → gh release create thu-ngan-v<x.y.z> --latest
```

Kiểm: `https://restaurant-management-zeta.vercel.app/api/desktop/latest` chuyển tới tệp `…-Setup-<bản mới>.exe`.
Máy quầy tự tải trong ≤ 1 giờ, tự cài khi để yên 5 phút. Commit `desktop/package.json` + `package-lock.json`.

## Android (Thu ngân hoặc Quản lý)

```bash
export JAVA_HOME="C:/Users/lecuong/tools/jdk17"
export TECHMENU_KEYSTORE='C:\Users\lecuong\techmenu-khoa-ky\techmenu-android.jks'
export TECHMENU_KEYSTORE_PASS="$(tr -d '\r\n' < /c/Users/lecuong/techmenu-khoa-ky/mat-khau.txt)"   # không in ra

node android/scripts/phat-hanh.mjs 1.0.2                # Thu ngân  (vn.techmenu.thungan)
node android/scripts/phat-hanh.mjs 1.0.1 --app quan-ly  # Quản lý   (vn.techmenu.quanly)
```

Phiên bản lấy từ tham số (mã phiên bản = a·10000 + b·100 + c, phải lớn hơn bản đang phát hành). Kiểm:
`/api/android/latest?thongTin=1&app=thu-ngan` (hoặc `quan-ly`) trả bản mới — CDN của GitHub có thể trễ vài phút.
Máy đang chạy hiện hộp "Có bản mới …" khi để yên, bấm "Cập nhật".

**Trước khi phát hành:** chạy kịch bản kiểm trên máy ảo (`android/scripts/thu-cap-nhat.mjs`, `thu-quan-tri.mjs`,
`thu-quan-ly.mjs`) và đối chiếu chứng chỉ ký với bản cũ:
`apksigner verify --print-certs <apk>` → dòng `SHA-256 digest` phải trùng `ae654a27…`.

## Sự cố đã gặp

- 04/10/2026: `gh release create` của `desktop/scripts/phat-hanh.mjs` hỏng vì chạy qua shell, tiêu đề có dấu cách bị tách
  tham số — đã sửa (chỉ `npx` chạy qua shell). Nếu build xong mà bước tải lên hỏng: tệp nằm sẵn ở `desktop/dist/`, chạy lại
  riêng `gh release create thu-ngan-v<x.y.z> dist/TechMenu-ThuNgan-Setup-<x.y.z>.exe dist/…exe.blockmap dist/latest.yml
  --title "TechMenu Thu ngân <x.y.z>" --notes "…" --latest`.
- 04/10/2026: tưởng máy không có `gh` vì chỉ tìm trong PATH — `gh` nằm ở `C:\Users\lecuong\tools\gh\bin` (nay đã vào PATH).
