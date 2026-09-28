import type { TenantSettings } from "@/lib/tenant/settings";
import type { BillStatus } from "./types";
import { bankByBin } from "@/lib/payments/banks";
import { buildVietQrPayload, transferContent } from "@/lib/payments/vietqr";

/** Khối QR chuyển khoản in dưới dòng TỔNG của hóa đơn (PAY-03, QD-021 D5). */
export type TransferQr = {
  payload: string;
  bankShortName: string;
  accountNo: string;
  accountName: string;
  content: string;
};

/**
 * Hóa đơn này có in QR không, và QR mang gì. Chỉ in khi ĐỦ cả bốn: quán khai tài khoản, bật cờ in, bill
 * còn MỞ, tổng > 0. Bill đã trả mà vẫn in QR là mời khách chuyển tiền lần hai; bill "vỏ chứa" của lần
 * chia đều không thu trực tiếp (thu ở từng bill con).
 *
 * `total` là tổng CỦA VIEW MODEL hóa đơn — không tính lại ở đây, để số trên QR luôn bằng số in trên giấy.
 */
export function dungTransferQr(input: {
  settings: TenantSettings;
  status: BillStatus;
  isSplitContainer: boolean;
  total: number;
  billNo: number | null;
  createdAt: string | null;
}): TransferQr | undefined {
  const { settings, status, isSplitContainer, total, billNo, createdAt } = input;
  const bank = settings.bank;
  if (!bank || !settings.print_qr_on_receipt) return undefined;
  if (status !== "open" || isSplitContainer) return undefined;
  if (!Number.isInteger(total) || total <= 0 || billNo == null) return undefined;

  const content = transferContent(billNo, createdAt ? new Date(createdAt) : new Date());
  return {
    payload: buildVietQrPayload({ bin: bank.bin, accountNo: bank.account_no, amount: total, content }),
    bankShortName: bankByBin(bank.bin)?.shortName ?? bank.bin,
    accountNo: bank.account_no,
    accountName: bank.account_name,
    content,
  };
}
