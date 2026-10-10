import { Card, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { createAdminClient } from "@/lib/supabase/admin";
import { thongTinBoCai } from "@/lib/print/bo-cai";
import { thongTinApp } from "@/lib/desktop/phat-hanh";
import { thongTinAndroid } from "@/lib/android/phat-hanh";
import { gioNgayNamVn } from "@/lib/time/vn";

/**
 * Ba thẻ tải app ở cuối trang Cài đặt (chuyển từ trang Máy in theo yêu cầu chủ dự án 10/10/2026):
 * TechMenu Thu ngân Windows (P21 DESK-11), Android (P24 ANDR-01), cầu in CAI-DAT.bat (PRINT-17).
 * `loi` là câu đã tra từ bảng cố định `CAU_LOI` — không nhận chuỗi tùy ý từ URL.
 */
export async function CaiAppThuNgan({ slug, loi }: { slug: string; loi: string | null }) {
  const [boCai, app, appAndroid] = await Promise.all([
    thongTinBoCai(createAdminClient()),
    thongTinApp(),
    thongTinAndroid(),
  ]);

  return (
    <>
      {/* P21 DESK-11 — như KiotViet "Tải KiotViet Thu ngân": một tệp cài, đăng nhập bằng tài khoản chủ quán ngay trong app. */}
      {app && (
        <Card>
          <CardTitle>Cài TechMenu Thu ngân trên máy quầy</CardTitle>
          <ol className="mt-md list-decimal space-y-xs pl-lg text-sm text-slate">
            <li>Mở trang này <span className="font-medium text-ink">trên chính máy quầy</span> → bấm tải.</li>
            <li>
              Mở tệp vừa tải. Windows báo &quot;Windows protected your PC&quot; → bấm{" "}
              <span className="font-medium text-ink">More info</span> →{" "}
              <span className="font-medium text-ink">Run anyway</span>.
            </li>
            <li>App tự mở → đăng nhập email + mật khẩu chủ quán → chọn &quot;Có — máy quầy&quot; → cài máy in → In thử.</li>
          </ol>
          <p className="mt-sm text-sm text-slate">
            Đăng nhập trên máy mới thì máy cũ đang in cho quán <span className="font-medium text-ink">ngừng in</span>. Máy đặt
            ở bếp chọn &quot;Không — chỉ xem&quot;. Chi tiết:{" "}
            <a href="/huong-dan-cai-dat#cai-app" className="font-medium text-primary underline">
              hướng dẫn cài đặt
            </a>
            .
          </p>
          <div className="mt-md flex flex-wrap items-center gap-md">
            <a href="/api/desktop/latest" className={buttonVariants({ variant: "primary" })}>
              Tải TechMenu Thu ngân{app.kichThuoc > 0 ? ` (${Math.max(1, Math.round(app.kichThuoc / 1048576))} MB)` : ""}
            </a>
            <span className="text-sm text-steel">Windows 10/11 · bản {app.phienBan}</span>
          </div>
        </Card>
      )}

      {/* P24 ANDR-01 — APK tự cài, không qua Google Play (QD-030 D2). Ẩn khi chưa có bản phát hành, như bản Windows. */}
      {appAndroid && (
        <Card>
          <CardTitle>Cài TechMenu Thu ngân trên tablet / điện thoại Android</CardTitle>
          <ol className="mt-md list-decimal space-y-xs pl-lg text-sm text-slate">
            <li>Mở trang này <span className="font-medium text-ink">trên chính máy Android</span> → bấm tải.</li>
            <li>
              Mở tệp vừa tải. Android hỏi quyền → bật{" "}
              <span className="font-medium text-ink">Cho phép cài ứng dụng không rõ nguồn gốc</span> (cho Chrome) → quay lại →{" "}
              <span className="font-medium text-ink">Cài đặt</span>.
            </li>
            <li>
              Nếu hiện cảnh báo &quot;ứng dụng chưa xác định&quot; của Play Protect → bấm{" "}
              <span className="font-medium text-ink">Vẫn cài đặt</span>.
            </li>
            <li>Mở app → đăng nhập email + mật khẩu chủ quán.</li>
          </ol>
          <p className="mt-sm text-sm text-slate">
            App tự báo khi có bản mới — bấm <span className="font-medium text-ink">Cập nhật</span>.
          </p>
          <div className="mt-md flex flex-wrap items-center gap-md">
            <a href="/api/android/latest" className={buttonVariants({ variant: "primary" })}>
              Tải TechMenu Thu ngân cho Android ({Math.max(1, Math.round(appAndroid.kichThuoc / 1048576))} MB)
            </a>
            <span className="text-sm text-steel">Android 8 trở lên · bản {appAndroid.phienBan}</span>
          </div>
        </Card>
      )}

      {/* PRINT-17 — tải bộ cài ngay trên laptop quầy, không cần ai gửi qua Zalo/USB. Trang Cài đặt chỉ chủ quán vào
          (canManage "settings") nên bộ cài luôn kèm sẵn mã kích hoạt. */}
      <Card>
        <CardTitle>{app ? "Cách cũ — cầu in cài bằng CAI-DAT.bat" : "Cài cầu in trên laptop quầy"}</CardTitle>
        {app && (
          <p className="mt-xs text-sm text-steel">Chỉ dùng cho máy đã cài theo cách này trước đây. Máy mới cài TechMenu Thu ngân ở trên.</p>
        )}
        <ol className="mt-md list-decimal space-y-xs pl-lg text-sm text-slate">
          <li>Mở trang này <span className="font-medium text-ink">trên chính laptop quầy</span> → bấm tải bộ cài (có thể mất tới 1 phút mới bắt đầu tải — đừng bấm lại).</li>
          <li>Chuột phải file vừa tải → <span className="font-medium text-ink">Extract All</span> (Giải nén tất cả) → Extract.</li>
          <li>Double-click <span className="font-medium text-ink">CAI-DAT.bat</span> → Yes → trả lời 2 câu hỏi trên màn hình.</li>
        </ol>
        <p className="mt-sm text-sm text-slate">
          Bộ cài <span className="font-medium text-ink">kèm sẵn mã kích hoạt</span> — không phải gõ mã. Cài trong vòng
          30 phút; quá hạn thì tải lại. Cài bằng bộ cài mới trên máy khác thì cầu in đang chạy ở máy cũ{" "}
          <span className="font-medium text-ink">ngừng in</span>.
        </p>
        {loi && (
          <p role="alert" className="mt-sm text-sm text-status-late">
            {loi}
          </p>
        )}
        <div className="mt-md flex flex-wrap items-center gap-md">
          {boCai ? (
            <form method="post" action={`/r/${slug}/admin/printers/bo-cai`}>
              <button type="submit" className={buttonVariants({ variant: "primary" })}>
                Tải bộ cài cầu in ({Math.max(1, Math.round(boCai.kichThuoc / 1048576))} MB)
              </button>
            </form>
          ) : (
            <p className="text-sm text-slate">Chưa có bộ cài để tải — liên hệ quản trị hệ thống.</p>
          )}
          {boCai && <span className="text-sm text-steel">Đóng gói lúc {gioNgayNamVn(boCai.capNhatLuc)}</span>}
        </div>
      </Card>
    </>
  );
}
