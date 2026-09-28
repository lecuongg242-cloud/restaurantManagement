import { bankByBin } from "@/lib/payments/banks";
import type { PlatformConfig } from "@/lib/platform/config";
import { formatVnd } from "@/lib/orders/cart";
import { CopyButton } from "@/components/ui/copy-button";
import { cn } from "@/lib/utils";

/**
 * Khối "QR + thông tin chuyển khoản" của trang Gia hạn — dùng chung cho quán lẻ (/r/…/admin/gia-han) và chuỗi
 * (/b/…/admin/gia-han). `svg` rỗng = chưa cấu hình tài khoản nhận của nền tảng.
 */
export function KhoiChuyenKhoan({
  cfg,
  svg,
  amount,
  content,
  moTa,
}: {
  cfg: PlatformConfig;
  svg: string | null;
  amount: number | null;
  content: string;
  /** Câu giải thích nội dung, vd "= Gia hạn quán X, gói 1 năm." */
  moTa: React.ReactNode;
}) {
  return (
    <>
      {svg && cfg.bank ? (
        <div className="mt-md flex flex-col gap-lg md:flex-row md:items-start">
          <div className="flex shrink-0 flex-col items-center gap-xs">
            <div
              className="h-60 w-60 rounded-md border border-hairline-soft bg-white p-xs [&_svg]:h-full [&_svg]:w-full"
              data-renewal-qr
              dangerouslySetInnerHTML={{ __html: svg }}
            />
            <p className="text-xs text-steel">Quét bằng app ngân hàng</p>
          </div>
          <dl className="grid min-w-0 flex-1 gap-sm text-sm" data-thong-tin-chuyen-khoan>
            <DongCk nhan="Ngân hàng" giaTri={`${bankByBin(cfg.bank.bin)?.shortName ?? cfg.bank.bin} — ${bankByBin(cfg.bank.bin)?.name ?? ""}`} />
            <DongCk nhan="Số tài khoản" giaTri={cfg.bank.account_no} chep mono />
            <DongCk nhan="Chủ tài khoản" giaTri={cfg.bank.account_name} />
            <DongCk
              nhan="Số tiền"
              giaTri={amount ? formatVnd(amount) : "Theo báo giá — liên hệ hỗ trợ"}
              chepGiaTri={amount ? String(amount) : undefined}
              chep={!!amount}
              dam
            />
            <div className="rounded-md border-2 border-primary/40 bg-cream-soft p-sm">
              <DongCk nhan="Nội dung chuyển khoản" giaTri={content} chep mono dam />
              <p className="mt-xxs text-xs text-slate">
                {moTa} <strong>Giữ nguyên nội dung này</strong> khi chuyển (quét QR thì đã điền sẵn) — bên hỗ trợ dựa vào nó
                để biết tiền của ai.
              </p>
            </div>
          </dl>
        </div>
      ) : (
        <p className="mt-md text-sm text-steel">
          {amount ? `Số tiền: ${formatVnd(amount)}. ` : ""}Chưa có thông tin tài khoản nhận. Vui lòng liên hệ
          {cfg.supportPhone ? ` ${cfg.supportPhone}` : " bộ phận hỗ trợ"}.
        </p>
      )}
      <ol className="mt-md list-decimal space-y-xxs pl-lg text-xs text-steel">
        <li>Chọn gói, quét QR bằng app ngân hàng (số tiền và nội dung tự điền) hoặc chép từng dòng để chuyển tay.</li>
        <li>Bên hỗ trợ xác nhận tiền về và cập nhật hạn dùng — thường trong giờ làm việc.</li>
        <li>Hạn mới hiện ở trang này; chi nhánh đang bị khóa mở lại ngay khi tải lại trang.</li>
      </ol>
      {cfg.supportPhone && (
        <p className="mt-xs text-xs text-steel">
          Đã chuyển mà chưa được gia hạn? Gọi{" "}
          <a href={`tel:${cfg.supportPhone.replace(/\s/g, "")}`} className="text-ink underline-offset-4 hover:underline">
            {cfg.supportPhone}
          </a>
          .
        </p>
      )}
    </>
  );
}

/** Một dòng thông tin chuyển khoản; `chep` = có nút sao chép (chép `chepGiaTri` nếu có, không thì `giaTri`). */
function DongCk({
  nhan,
  giaTri,
  chepGiaTri,
  chep,
  mono,
  dam,
}: {
  nhan: string;
  giaTri: string;
  chepGiaTri?: string;
  chep?: boolean;
  mono?: boolean;
  dam?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-sm">
      <div className="min-w-0">
        <dt className="text-xs text-steel">{nhan}</dt>
        <dd className={cn("break-words text-ink", mono && "font-mono", dam && "text-base font-semibold")}>{giaTri}</dd>
      </div>
      {chep && <CopyButton value={chepGiaTri ?? giaTri} label={nhan.toLowerCase()} />}
    </div>
  );
}
