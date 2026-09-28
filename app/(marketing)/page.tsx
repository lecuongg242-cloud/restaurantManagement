import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  BadgeCheck,
  Bell,
  ChartNoAxesColumn,
  ClipboardList,
  Percent,
  Printer,
  QrCode,
  Receipt,
  ShieldCheck,
  Store,
  Timer,
  UtensilsCrossed,
  Users,
  Zap,
} from "lucide-react";
import { LeadForm } from "./LeadForm";

export const metadata: Metadata = {
  title: "Phần mềm quản lý nhà hàng — gọi món QR, POS, bếp, báo cáo",
  description:
    "Một hệ thống chạy từ lúc khách quét QR gọi món tới khi bạn xem báo cáo cuối ngày: POS, màn hình bếp, tách/gộp bill, in hóa đơn, đặt bàn, giao hàng.",
};

/**
 * Trang giới thiệu sản phẩm (MKT-01). Người đọc mục tiêu: chủ nhà hàng nhỏ/vừa.
 * Nguyên tắc nội dung: mọi câu chỉ nói tính năng ĐÃ CHẠY THẬT (đối chiếu
 * docs/00-TongQuan/GioiThieu.md + 20-DanhSachYeuCau). Ảnh chụp từ tenant demo, không
 * bao giờ dùng dữ liệu nhà hàng thật. Trang không có lối vào demo — CTA duy nhất là để lại số.
 */
export default function MarketingHome() {
  return (
    <main className="min-h-screen bg-canvas">
      {/* ---- 1. Hero ---- */}
      <section className="mx-auto max-w-5xl px-lg pb-xxl pt-xxl sm:pt-section">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">
          Phần mềm quản lý nhà hàng
        </p>
        <h1 className="mt-md max-w-3xl font-display text-4xl leading-[1.08] tracking-tight text-ink sm:text-5xl">
          Bàn nào gọi gì, bếp làm tới đâu, hôm nay thu bao nhiêu — biết ngay.
        </h1>
        <p className="mt-lg max-w-2xl text-lg text-slate">
          Một hệ thống chạy liền mạch từ lúc khách quét QR gọi món tới khi anh/chị xem báo cáo cuối
          ngày. Không sổ giấy, không ba bốn phần mềm rời rạc.
        </p>
        <div className="mt-xl">
          <LeadForm variant="compact" />
        </div>
        <p className="mt-md text-sm text-slate">
          Cần máy móc gì?{" "}
          <Link href="/huong-dan-cai-dat" className="font-medium text-primary underline-offset-4 hover:underline">
            Xem quán cần chuẩn bị gì →
          </Link>
        </p>
      </section>

      <div className="h-6 w-full bg-sunset" />

      {/* ---- 2. Ba nỗi đau ---- */}
      <section className="mx-auto max-w-5xl px-lg py-section-sm">
        <h2 className="font-display text-3xl text-ink">Ba thứ khiến quán mất tiền mỗi ngày</h2>
        <div className="mt-xl grid grid-cols-1 gap-lg md:grid-cols-3">
          <Pain
            icon={<ClipboardList className="h-5 w-5" />}
            problem="Order thất lạc trên đường ra bếp"
            fix="Khách bấm gửi là món hiện trên màn hình bếp trong khoảng 3 giây. Không còn tờ giấy nào để rơi hay quên."
          />
          <Pain
            icon={<UtensilsCrossed className="h-5 w-5" />}
            problem="Bếp làm sai món, làm thiếu món"
            fix="Mỗi món một dòng: số lượng, tùy chọn, ghi chú của khách. Bếp bấm xong từng món, phục vụ biết ngay cái nào bưng được."
          />
          <Pain
            icon={<ChartNoAxesColumn className="h-5 w-5" />}
            problem="Cuối ngày không biết thật sự thu bao nhiêu"
            fix="Doanh thu tính thẳng từ hóa đơn đã thu, tách tiền mặt và chuyển khoản để đối soát. Số trên màn hình khớp tiền trong két."
          />
        </div>
      </section>

      {/* ---- 3. Ảnh lớn: báo cáo ---- */}
      <section className="bg-cream-soft py-section-sm">
        <div className="mx-auto max-w-5xl px-lg">
          <h2 className="max-w-2xl font-display text-3xl text-ink">
            Mở máy là biết quán đang chạy thế nào
          </h2>
          <p className="mt-md max-w-2xl text-slate">
            Chọn hôm nay, 7 ngày, 30 ngày hay bất kỳ khoảng ngày nào. Mỗi con số kèm mức tăng giảm so
            với kỳ trước, nên anh/chị thấy ngay quán đang lên hay đang xuống.
          </p>
          <Shot
            src="/marketing/bao-cao.png"
            width={1024}
            height={690}
            alt="Màn báo cáo dòng tiền: doanh thu, số hóa đơn, biểu đồ theo ngày, cơ cấu nhóm món và khung giờ cao điểm"
          />
          <ul className="mt-lg grid grid-cols-1 gap-md text-sm text-slate sm:grid-cols-2 lg:grid-cols-4">
            <Tick>Doanh thu, số hóa đơn, trung bình mỗi hóa đơn</Tick>
            <Tick>Món bán chạy và cơ cấu theo nhóm món</Tick>
            <Tick>Khung giờ cao điểm theo từng thứ trong tuần</Tick>
            <Tick>Tách tiền mặt / chuyển khoản để đối soát</Tick>
          </ul>
        </div>
      </section>

      {/* ---- 4. Bốn bề mặt ---- */}
      <section className="mx-auto max-w-5xl px-lg py-section-sm">
        <h2 className="font-display text-3xl text-ink">Bốn màn hình, một hệ thống</h2>
        <p className="mt-md max-w-2xl text-slate">
          Khách, phục vụ, bếp và chủ quán mỗi người một màn riêng — nhưng cùng chung một dữ liệu, nên
          không ai phải nhập lại của ai.
        </p>

        <div className="mt-xl flex flex-col gap-section-sm">
          <Surface
            eyebrow="Cho khách"
            title="Quét QR ở bàn là gọi được món"
            points={[
              "Quét mã là vào thẳng thực đơn đúng quán, đúng bàn — không cần tải ứng dụng",
              "Chọn tùy chọn, ghi chú riêng từng món rồi gửi một lần",
              "Gọi nhân viên hoặc gọi thanh toán ngay từ bàn, quầy nhận được liền",
              "Khách tự theo dõi đơn của mình đang ở bước nào",
            ]}
            shot={{ src: "/marketing/chao-ban.png", width: 420, height: 840, phone: true }}
            alt="Màn hình khách thấy sau khi quét QR: tên quán, số bàn, nút gọi nhân viên, gọi thanh toán và vào thực đơn"
          />
          <Surface
            eyebrow="Cho phục vụ & thu ngân"
            title="POS ở quầy, và POS gọn trong điện thoại"
            reverse
            points={[
              "Duyệt đơn khách gọi qua QR trước khi món xuống bếp",
              "Mở bàn gọi thay khách; nhân viên đi bàn gõ thẳng trên điện thoại",
              "Tách bill theo món, chia đều N người, gộp nhiều bàn thành một hóa đơn",
              "Thu tiền mặt hoặc chuyển khoản rồi in hóa đơn",
            ]}
            shot={{ src: "/marketing/pos.png", width: 1280, height: 820 }}
            alt="Màn POS: sơ đồ bàn, đơn chờ duyệt và giỏ món đang gọi"
          />
          <Surface
            eyebrow="Cho bếp"
            title="Màn hình bếp thay cho tập phiếu giấy"
            points={[
              "Vé món xếp theo thứ tự gọi, kèm số đơn để bếp biết làm cái nào trước",
              "Bấm “đang làm” / “xong” ở mức từng món, không phải cả đơn",
              "Món mới xuống bếp là màn tự cập nhật, không cần bấm tải lại",
            ]}
            shot={{ src: "/marketing/kds.png", width: 1280, height: 400 }}
            alt="Màn hình bếp KDS: các vé món theo bàn kèm trạng thái đang làm và xong"
          />
          <Surface
            eyebrow="Cho chủ quán"
            title="Khu quản trị gọn trong một chỗ"
            reverse
            points={[
              "Thực đơn, nhóm tùy chọn và phụ thu, bật tắt món hết",
              "Khu vực, bàn và in mã QR từng bàn",
              "Nhân viên và phân quyền theo vai trò",
              "Báo cáo dòng tiền theo bất kỳ khoảng thời gian nào",
            ]}
            shot={{ src: "/marketing/admin.png", width: 1024, height: 660 }}
            alt="Khu quản trị: danh sách khu vực và bàn, mỗi bàn có mã QR in được"
          />
        </div>
      </section>

      {/* ---- 5. Lưới tính năng ---- */}
      <section className="bg-cream-soft py-section-sm">
        <div className="mx-auto max-w-5xl px-lg">
          <h2 className="font-display text-3xl text-ink">Những việc hằng ngày, hệ thống lo sẵn</h2>
          <div className="mt-xl grid grid-cols-1 gap-lg sm:grid-cols-2 lg:grid-cols-3">
            <Feature icon={<QrCode />} title="Gọi món bằng QR tại bàn">
              Mỗi bàn một mã riêng, in ra dán lên bàn là dùng được.
            </Feature>
            <Feature icon={<UtensilsCrossed />} title="Thực đơn có ảnh & tùy chọn">
              Nhóm tùy chọn bắt buộc hay không, có phụ thu riêng từng lựa chọn.
            </Feature>
            <Feature icon={<Bell />} title="Báo hết món ngay tại quầy">
              Bấm một nút là món mờ đi ở cả thực đơn của khách, khỏi vào khu quản trị.
            </Feature>
            <Feature icon={<Receipt />} title="Tách, gộp và chia đều hóa đơn">
              Tách theo món, chia đều N người, hoặc gộp nhiều bàn thành một hóa đơn.
            </Feature>
            <Feature icon={<Percent />} title="Giảm giá, phí phục vụ, VAT">
              Cấu hình theo quán; tổng tiền tính đúng thứ tự, không lệch đồng nào.
            </Feature>
            <Feature icon={<Printer />} title="In phiếu bếp & hóa đơn">
              Khổ 58mm và 80mm, chữ rõ, không tràn lề.
            </Feature>
            <Feature icon={<Store />} title="Đặt bàn, mang về, giao tận nơi">
              Khách đặt online, quán duyệt; đơn mang về và giao vào chung hàng đợi.
            </Feature>
            <Feature icon={<Bell />} title="Gọi nhân viên từ bàn">
              Khách bấm gọi kèm yêu cầu, quầy hiện ngay tên bàn và nội dung.
            </Feature>
            <Feature icon={<Users />} title="Phân quyền theo vai trò">
              Chủ, quản lý, thu ngân, phục vụ, bếp — mỗi người chỉ thấy phần của mình.
            </Feature>
            <Feature icon={<ShieldCheck />} title="Nhiều chi nhánh, dữ liệu tách bạch">
              Mỗi nhà hàng một không gian riêng, không nhìn thấy dữ liệu của nhau.
            </Feature>
          </div>
        </div>
      </section>

      {/* ---- 6. Vì sao tin được ---- */}
      <section className="mx-auto max-w-5xl px-lg py-section-sm">
        <h2 className="font-display text-3xl text-ink">Vì sao tin được</h2>
        <div className="mt-xl grid grid-cols-1 gap-lg sm:grid-cols-2">
          <Proof icon={<ShieldCheck className="h-5 w-5" />} title="Dữ liệu từng nhà hàng tách bạch">
            Việc cách ly nằm ở tầng cơ sở dữ liệu chứ không chỉ trong giao diện, và có bộ kiểm tra tự
            động chạy lại mỗi lần hệ thống cập nhật.
          </Proof>
          <Proof icon={<Zap className="h-5 w-5" />} title="Món xuống bếp trong khoảng 3 giây">
            Màn hình bếp tự nhận món mới qua kết nối thời gian thực, không phải bấm tải lại trang.
          </Proof>
          <Proof icon={<BadgeCheck className="h-5 w-5" />} title="Doanh thu khớp với tiền đã thu">
            Con số được tổng hợp thẳng trong cơ sở dữ liệu nên không bị cắt bớt, dù quán có vài chục
            hay vài nghìn hóa đơn mỗi tháng.
          </Proof>
          <Proof icon={<Timer className="h-5 w-5" />} title="Không cần máy chủ đặt tại quán">
            Hệ thống chạy trên hạ tầng đám mây; quán chỉ cần máy tính hoặc máy tính bảng có mạng.
          </Proof>
        </div>
      </section>

      {/* ---- 7. CTA cuối ---- */}
      <section className="border-t border-hairline bg-cream py-section-sm">
        <div className="mx-auto max-w-5xl px-lg">
          <h2 className="font-display text-3xl text-ink">Để lại số, mình gọi lại tư vấn</h2>
          <p className="mt-md max-w-2xl text-slate">
            Anh/chị cho biết quán đang vận hành thế nào, mình tư vấn xem hệ thống hợp tới đâu và mất
            bao lâu để chạy được.
          </p>
          <div className="mt-xl">
            <LeadForm variant="full" id="lien-he" />
          </div>
        </div>
      </section>

      <footer className="border-t border-hairline py-xl">
        <p className="mx-auto max-w-5xl px-lg text-sm text-steel">
          Hệ thống quản lý nhà hàng · Gọi món QR, POS, màn hình bếp, đặt bàn &amp; báo cáo. ·{" "}
          <Link href="/huong-dan-cai-dat" className="text-primary underline-offset-4 hover:underline">
            Cần chuẩn bị gì
          </Link>
        </p>
      </footer>
    </main>
  );
}

// ---- Mảnh ghép ------------------------------------------------------------

function Pain({ icon, problem, fix }: { icon: React.ReactNode; problem: string; fix: string }) {
  return (
    <div className="rounded-lg border border-hairline bg-canvas p-lg shadow-card">
      <span className="grid h-9 w-9 place-items-center rounded-md bg-cream text-primary">{icon}</span>
      <h3 className="mt-md font-medium text-ink">{problem}</h3>
      <p className="mt-xs text-sm leading-relaxed text-slate">{fix}</p>
    </div>
  );
}

function Tick({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-xs">
      <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <span>{children}</span>
    </li>
  );
}

function Shot({
  src,
  width,
  height,
  alt,
  phone,
}: {
  src: string;
  width: number;
  height: number;
  alt: string;
  phone?: boolean;
}) {
  return (
    <div
      className={
        "mt-xl overflow-hidden border border-hairline bg-canvas shadow-card " +
        (phone ? "mx-auto max-w-[280px] rounded-xl" : "rounded-lg")
      }
    >
      <Image src={src} width={width} height={height} alt={alt} className="h-auto w-full" />
    </div>
  );
}

function Surface({
  eyebrow,
  title,
  points,
  shot,
  alt,
  reverse,
}: {
  eyebrow: string;
  title: string;
  points: string[];
  shot: { src: string; width: number; height: number; phone?: boolean };
  alt: string;
  reverse?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 items-center gap-xl lg:grid-cols-2">
      <div className={reverse ? "lg:order-2" : undefined}>
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">{eyebrow}</p>
        <h3 className="mt-sm font-display text-2xl text-ink">{title}</h3>
        <ul className="mt-lg flex flex-col gap-sm text-sm text-slate">
          {points.map((p) => (
            <Tick key={p}>{p}</Tick>
          ))}
        </ul>
      </div>
      <div className={reverse ? "lg:order-1" : undefined}>
        <Shot {...shot} alt={alt} />
      </div>
    </div>
  );
}

function Feature({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <span className="grid h-9 w-9 place-items-center rounded-md bg-canvas text-primary [&>svg]:h-5 [&>svg]:w-5">
        {icon}
      </span>
      <h3 className="mt-sm font-medium text-ink">{title}</h3>
      <p className="mt-xxs text-sm leading-relaxed text-slate">{children}</p>
    </div>
  );
}

function Proof({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-md rounded-lg border border-hairline p-lg">
      <span className="mt-0.5 shrink-0 text-primary">{icon}</span>
      <div>
        <h3 className="font-medium text-ink">{title}</h3>
        <p className="mt-xxs text-sm leading-relaxed text-slate">{children}</p>
      </div>
    </div>
  );
}
