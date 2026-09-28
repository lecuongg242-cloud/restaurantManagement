import { Card, CardTitle } from "@/components/ui/card";
import { formatVnd } from "@/lib/orders/cart";
import type { DuBaoHienThi } from "@/lib/forecast/read";
import { ForecastChart } from "./ForecastChart";

const ngayThang = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const phay = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: 0 });

/**
 * Khối "7 ngày tới" (P18 18-01, AI-01/02). Chỉ hiện con số khi đủ ≥ 6 tuần có bán VÀ sai lệch backtest ≤ 25%
 * (QD-025 D5, U3); luôn kèm khoảng sai số + nhãn độ chính xác — khác đối thủ (họ không hiện), lý do ở P18/00-TongQuan.
 */
export function ForecastCard({ du }: { du: DuBaoHienThi }) {
  return (
    <Card data-du-bao>
      <div className="flex flex-wrap items-baseline justify-between gap-sm">
        <CardTitle>Dự báo 7 ngày tới</CardTitle>
        {du.trangThai !== "chua-co" && (
          <span className="text-xs text-steel">
            Tính lúc {ngayThang(du.runDate)}
            {du.cu && <span className="ml-xs font-medium text-status-late">— bản cũ, đêm qua chưa tính được</span>}
          </span>
        )}
      </div>

      {du.trangThai === "chua-co" && <p className="mt-sm text-sm text-slate">Chưa có dự báo — hệ thống tính mỗi đêm, sáng mai sẽ có.</p>}

      {du.trangThai === "chua-tin" && (
        <p className="mt-sm text-sm text-slate" data-du-bao-chua-tin>
          Chưa đủ dữ liệu để dự báo đáng tin.{" "}
          {du.soTuan < 6
            ? `Cần ít nhất 6 tuần có bán (hiện có ${du.soTuan}).`
            : du.saiLechPct !== null
              ? `Thử dự báo lại 4 tuần vừa qua thì sai lệch trung bình ${phay(du.saiLechPct)}% — cao hơn ngưỡng 25%.`
              : ""}
        </p>
      )}

      {du.trangThai === "hien" && (
        <>
          <div className="mt-sm flex flex-wrap items-baseline gap-x-lg gap-y-xs">
            <p className="text-2xl font-medium tabular-nums text-ink">{formatVnd(du.tong.value)}</p>
            <p className="text-sm text-slate">
              khoảng {formatVnd(du.tong.low)} – {formatVnd(du.tong.high)}
              {du.tong.tuanTruoc > 0 && (
                <>
                  {" · "}
                  {du.tong.value >= du.tong.tuanTruoc ? "cao" : "thấp"} hơn tuần trước{" "}
                  {phay(Math.abs(((du.tong.value - du.tong.tuanTruoc) / du.tong.tuanTruoc) * 100))}%
                </>
              )}
            </p>
          </div>
          <p className="mt-xxs text-xs text-steel" data-do-chinh-xac>
            Sai lệch trung bình ±{phay(du.saiLechPct ?? 0)}% (thử dự báo lại 4 tuần gần nhất rồi so với thực tế).
          </p>
          <div className="mt-md">
            <ForecastChart ngay={du.ngay} />
          </div>
          {du.monNhieu.length > 0 && (
            <p className="mt-sm text-sm text-slate">
              Món dự kiến bán nhiều: {du.monNhieu.map((m) => `${m.ten} (~${phay(m.sl)})`).join(", ")}.
            </p>
          )}
        </>
      )}
    </Card>
  );
}
