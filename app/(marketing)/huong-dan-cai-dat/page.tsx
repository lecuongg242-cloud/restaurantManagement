import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { BadgeCheck, Headset, Monitor, Printer, Settings2, UtensilsCrossed, Users } from "lucide-react";
import { LeadForm } from "../LeadForm";
import { platformConfig } from "@/lib/platform/config";

export const metadata: Metadata = {
  title: "Hướng dẫn cài đặt POSMenu — quán cần chuẩn bị gì, POSMenu hỗ trợ gì",
  description:
    "Thiết bị quán cần chuẩn bị: máy tính ở quầy (laptop hoặc máy tính để bàn), máy in hóa đơn Sapo SPR02 hoặc tương đương, wifi. Cài đặt, nhập thực đơn, hướng dẫn nhân viên miễn phí, hỗ trợ 24/7.",
};

/** Số hỗ trợ đọc từ /super → Cài đặt nền tảng; làm mới mỗi 10 phút. */
export const revalidate = 600;

/**
 * Hướng dẫn cài đặt (MKT-04) — trang công khai cho chủ quán xem TRƯỚC khi mua. Người đọc: chủ quán trung tuổi, không rành
 * công nghệ ⇒ chữ to, mỗi mục một câu công dụng, ảnh thật.
 *
 * Làm theo đối thủ (tra 29/09/2026): danh sách đánh số, mỗi thiết bị một ảnh + một câu công dụng (iPOS "Sản phẩm thiết
 * bị nhà hàng"); ghi đúng mã máy (POS365 "Máy in hóa đơn Xprinter Q806K"); cấu hình máy tính Tối thiểu / Khuyến nghị
 * (CUKCUK "Cài đặt trên máy tính"). Mục "POSMenu hỗ trợ gì" theo POS365 ("giá gói đã bao gồm hỗ trợ thiết lập ban đầu,
 * chuyển giao thao tác cơ bản… hỗ trợ kỹ thuật 24/7"; tận nơi báo giá riêng).
 * Chủ dự án chốt: không mục "không cần mua", không mục mất mạng, không sơ đồ nối; mỗi thiết bị ghi chi phí dự kiến
 * (29/09/2026, đổi ý so với "không ghi giá" lúc đầu); hỗ trợ từ xa miễn phí, tận nơi báo phí, 24/7. Nội dung khớp `docs/60-BanGiao/02-ThietBiChuan.md`. Ảnh kho miễn phí — nguồn ở
 * `public/marketing/thiet-bi/NGUON-ANH.md`.
 */
export default async function HuongDanCaiDat() {
  const { supportPhone } = await platformConfig();
  return (
    <main className="min-h-screen bg-canvas">
      <header className="mx-auto max-w-4xl px-lg pt-xl">
        <Link href="/" className="text-sm text-primary underline-offset-4 hover:underline">
          ← Trang chủ
        </Link>
      </header>

      {/* ---- Đầu trang: câu trả lời ngay ---- */}
      <section className="mx-auto max-w-4xl px-lg pb-xl pt-lg">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">Trước khi bắt đầu</p>
        <h1 className="mt-md font-display text-4xl leading-tight text-ink sm:text-5xl">Quán cần chuẩn bị gì?</h1>
        <p className="mt-lg text-lg leading-relaxed text-slate">Để dùng POSMenu, quán cần có đủ ba thứ:</p>
        <ol className="mt-md flex flex-col gap-sm text-lg text-ink" data-bat-buoc>
          <DongBatBuoc so={1}>
            <strong>Một máy tính ở quầy</strong> — máy tính xách tay (laptop) hoặc máy tính để bàn
          </DongBatBuoc>
          <DongBatBuoc so={2}>
            <strong>Một máy in hóa đơn</strong> — Sapo SPR02 hoặc máy tương đương
          </DongBatBuoc>
          <DongBatBuoc so={3}>
            <strong>Wifi của quán</strong> — dùng luôn cục wifi quán đang có
          </DongBatBuoc>
        </ol>
        <p className="mt-lg text-lg leading-relaxed text-slate">
          Nhân viên gọi món, tính tiền bằng <strong className="text-ink">điện thoại của mình</strong> — không phải mua thêm.
          Cài đặt và nhập thực đơn <a href="#ho-tro" className="font-medium text-primary underline-offset-4 hover:underline">POSMenu làm cùng anh/chị</a>.
        </p>
      </section>

      <div className="h-6 w-full bg-sunset" />

      {/* ---- Danh sách thiết bị ---- */}
      <section className="mx-auto max-w-4xl px-lg py-section-sm">
        <h2 className="font-display text-3xl text-ink">Danh sách thiết bị</h2>
        <div className="mt-xl flex flex-col gap-lg" data-danh-sach-thiet-bi>
          <ThietBi
            so={1}
            ten="Máy tính ở quầy thu ngân"
            batBuoc
            hinh={[
              ["laptop", "Máy tính xách tay đặt ở quầy"],
              ["pc", "Máy tính để bàn: thùng máy và màn hình"],
            ]}
            chiPhi="Dùng máy sẵn có: 0đ · Mua laptop cũ (Core i3/i5, RAM 8GB, SSD): khoảng 4–5 triệu"
            congDung="Màn hình thu ngân để tính tiền, xem bàn, xem đơn — và là máy nối với máy in để phiếu tự ra ở bếp."
          >
            <p>Dùng được <strong>máy tính xách tay (laptop)</strong> hoặc <strong>máy tính để bàn (PC)</strong>, máy cũ cũng được.</p>
            <table className="mt-sm w-full text-left text-base">
              <thead className="text-sm text-steel">
                <tr>
                  <th className="py-xxs pr-md font-medium" />
                  <th className="py-xxs pr-md font-medium">Tối thiểu</th>
                  <th className="py-xxs font-medium">Nên có</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline-soft">
                <tr>
                  <td className="py-xs pr-md text-steel">Hệ điều hành</td>
                  <td className="py-xs pr-md">Windows 10</td>
                  <td className="py-xs">Windows 10 hoặc 11</td>
                </tr>
                <tr>
                  <td className="py-xs pr-md text-steel">Bộ nhớ (RAM)</td>
                  <td className="py-xs pr-md">4 GB</td>
                  <td className="py-xs">8 GB</td>
                </tr>
                <tr>
                  <td className="py-xs pr-md text-steel">Ổ cứng</td>
                  <td className="py-xs pr-md">SSD</td>
                  <td className="py-xs">SSD</td>
                </tr>
                <tr>
                  <td className="py-xs pr-md text-steel">Chip</td>
                  <td className="py-xs pr-md">Core i3</td>
                  <td className="py-xs">Core i5</td>
                </tr>
              </tbody>
            </table>
            <p className="mt-sm">Có trình duyệt <strong>Google Chrome</strong> (tải miễn phí).</p>
            <Luu>
              Máy này phải <strong>bật suốt giờ bán</strong> (laptop thì cắm sạc). Máy tắt thì bếp không ra phiếu, điện thoại
              không in được hóa đơn.
            </Luu>
          </ThietBi>

          <ThietBi
            so={2}
            ten="Máy in hóa đơn"
            batBuoc
            hinh={[["may-in", "Máy in hóa đơn để bàn đang in hóa đơn khổ 80mm"]]}
            chiPhi="Khoảng 1.190.000đ (Sapo SPR02, giá niêm yết, bảo hành 12 tháng)"
            congDung="In hóa đơn cho khách và in phiếu gọi món cho bếp. Quán nhỏ dùng chung một máy cho cả hai."
          >
            <p>
              Máy chuẩn: <strong>Máy in hóa đơn Sapo SPR02</strong>.
            </p>
            <p className="mt-xs">Hoặc máy tương đương, cần đủ hai điều:</p>
            <ul className="mt-xs flex flex-col gap-xxs">
              <Tick>
                In giấy <strong>khổ 80mm</strong>
              </Tick>
              <Tick>
                Có <strong>cổng mạng LAN</strong> (lỗ cắm dây mạng, giống lỗ trên cục wifi)
              </Tick>
            </ul>
            <p className="mt-xs text-slate">Quán đang có sẵn máy in? Để lại số, POSMenu xem giúp máy đó dùng được không.</p>
          </ThietBi>

          <ThietBi
            so={3}
            ten="Wifi và dây mạng"
            batBuoc
            hinh={[
              ["router", "Cục wifi (router) có ăng-ten"],
              ["day-lan", "Đầu dây mạng LAN"],
            ]}
            chiPhi="Cục wifi: dùng cái sẵn có · Dây mạng LAN: khoảng 50–100 nghìn"
            congDung="Cục wifi (router) quán đang có. Máy in nối vào cục wifi bằng một sợi dây mạng LAN."
          >
            <p>
              Mua thêm <strong>dây mạng LAN</strong> đủ dài từ chỗ đặt máy in tới cục wifi.
            </p>
            <Luu>Máy in cắm dây, không bắt wifi — để máy in luôn chạy ổn định.</Luu>
          </ThietBi>

          <ThietBi
            so={4}
            ten="Điện thoại hoặc máy tính bảng của nhân viên"
            hinh={[["dien-thoai", "Nhân viên gọi món bằng điện thoại tại bàn"]]}
            chiPhi="0đ — dùng điện thoại sẵn có"
            congDung="Nhân viên đi bàn gọi món, tính tiền, in hóa đơn ngay trên điện thoại."
            nhan="Dùng máy sẵn có"
          >
            <p>Điện thoại Android hoặc iPhone, máy tính bảng, iPad đều được. Không phải cài ứng dụng — mở bằng trình duyệt.</p>
          </ThietBi>

          <ThietBi
            so={5}
            ten="Giấy in hóa đơn"
            hinh={[["giay-in", "Cuộn giấy in nhiệt"]]}
            chiPhi="Khoảng 6–9 nghìn/cuộn (thùng 50 cuộn khoảng 300–450 nghìn)"
            congDung="Giấy cuộn cho máy in hóa đơn."
            nhan="Mua thường xuyên"
          >
            <p>
              Giấy in nhiệt <strong>khổ K80 (80mm)</strong>. Mua theo thùng ở cửa hàng văn phòng phẩm hoặc thiết bị bán hàng.
            </p>
          </ThietBi>

          <ThietBi
            so={6}
            ten="Máy in thứ hai đặt ở bếp"
            hinh={[["may-in", "Máy in hóa đơn đặt ở bếp"]]}
            chiPhi="Thêm khoảng 1.190.000đ"
            congDung="Khi bếp ở xa quầy: phiếu gọi món tự ra ngay trong bếp, không ai phải mang vào."
            nhan="Tùy chọn"
          >
            <p>Cùng loại với máy in ở quầy (Sapo SPR02 hoặc tương đương), cắm dây mạng về cục wifi.</p>
          </ThietBi>

          <ThietBi
            so={7}
            ten="Màn hình cho bếp"
            hinh={[["man-bep", "Đầu bếp xem món trên máy tính bảng treo trong bếp"]]}
            chiPhi="Dùng máy tính bảng sẵn có: 0đ"
            congDung="Máy tính bảng treo trong bếp để xem món cần làm."
            nhan="Tùy chọn"
          >
            <p>Không có cũng được nếu bếp đã có máy in.</p>
          </ThietBi>
        </div>

        <div className="mt-xl rounded-lg border border-primary/40 bg-cream-soft p-lg" data-tong-chi-phi>
          <h3 className="font-display text-2xl text-ink">Chi phí thiết bị dự kiến ban đầu</h3>
          <table className="mt-md w-full text-left text-base">
            <tbody className="divide-y divide-hairline-soft">
              <tr>
                <td className="py-sm pr-md text-ink">Quán <strong>đã có máy tính</strong></td>
                <td className="py-sm text-right text-lg font-semibold text-ink">khoảng 1,5 – 1,8 triệu</td>
              </tr>
              <tr>
                <td className="py-sm pr-md text-ink">Quán <strong>chưa có máy tính</strong> (mua laptop cũ)</td>
                <td className="py-sm text-right text-lg font-semibold text-ink">khoảng 5,5 – 6,8 triệu</td>
              </tr>
              <tr>
                <td className="py-sm pr-md text-slate">Thêm máy in riêng cho bếp</td>
                <td className="py-sm text-right text-slate">+ khoảng 1,2 triệu</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-sm text-sm text-steel">
            Gồm máy in, dây mạng, một thùng giấy in. Giá tham khảo, thay đổi theo nơi bán. Chưa gồm phí dùng POSMenu.
          </p>
        </div>
      </section>

      {/* ---- POSMenu hỗ trợ gì ---- */}
      <section id="ho-tro" className="mx-auto max-w-4xl scroll-mt-lg px-lg py-section-sm" data-ho-tro>
        <h2 className="font-display text-3xl text-ink">POSMenu hỗ trợ gì</h2>
        <p className="mt-md text-lg text-slate">
          Quán chỉ cần chuẩn bị thiết bị. Phần cài đặt và nhập liệu POSMenu làm cùng anh/chị —{" "}
          <strong className="text-ink">miễn phí</strong>, qua Zalo và điều khiển máy từ xa.
        </p>
        <div className="mt-xl grid grid-cols-1 gap-md sm:grid-cols-2">
          <HoTro icon={<Printer />} ten="Cài máy in và POSMenu">
            Cài lên máy tính ở quầy, nối máy in, in thử phiếu bếp và hóa đơn tới khi ra giấy đúng.
          </HoTro>
          <HoTro icon={<UtensilsCrossed />} ten="Nhập thực đơn">
            Anh/chị chụp ảnh thực đơn gửi qua Zalo — POSMenu nhập món, giá, nhóm món.
          </HoTro>
          <HoTro icon={<Settings2 />} ten="Thiết lập quán">
            Bàn và khu vực, mã QR từng bàn, tài khoản cho nhân viên, tên và địa chỉ in trên hóa đơn, tài khoản nhận chuyển
            khoản.
          </HoTro>
          <HoTro icon={<Users />} ten="Hướng dẫn chủ quán và nhân viên">
            Chỉ từng bước: gọi món, gửi bếp, tính tiền, in hóa đơn, xem doanh thu — tới khi quán dùng quen.
          </HoTro>
          <HoTro icon={<Headset />} ten="Hỗ trợ 24/7 trong lúc dùng">
            Gọi điện hoặc nhắn Zalo bất cứ lúc nào
            {supportPhone ? (
              <>
                {" — "}
                <a
                  href={`tel:${supportPhone.replace(/\s/g, "")}`}
                  className="font-medium text-primary underline-offset-4 hover:underline"
                  data-so-ho-tro
                >
                  {supportPhone}
                </a>
              </>
            ) : null}
            .
          </HoTro>
          <HoTro icon={<Monitor />} ten="Cần người tới tận quán?">
            POSMenu tới cài đặt và hướng dẫn tại quán — báo phí trước khi đi.
          </HoTro>
        </div>
      </section>

      {/* ---- Các bước bắt đầu ---- */}
      <section className="bg-cream-soft py-section-sm">
        <div className="mx-auto max-w-4xl px-lg">
          <h2 className="font-display text-3xl text-ink">Bắt đầu thế nào</h2>
          <ol className="mt-xl grid grid-cols-1 gap-lg sm:grid-cols-3">
            <Buoc so={1} ten="Để lại số điện thoại">
              POSMenu gọi lại, hỏi quán đang có những gì và tư vấn cần mua thêm gì.
            </Buoc>
            <Buoc so={2} ten="Chuẩn bị thiết bị">
              Máy tính ở quầy, máy in hóa đơn, dây mạng — theo danh sách phía trên.
            </Buoc>
            <Buoc so={3} ten="Cài đặt và bán">
              POSMenu cài máy in, nhập thực đơn, thiết lập quán và hướng dẫn nhân viên. Xong là bán được.
            </Buoc>
          </ol>
        </div>
      </section>

      {/* ---- Câu hỏi thường gặp ---- */}
      <section className="mx-auto max-w-4xl px-lg py-section-sm">
        <h2 className="font-display text-3xl text-ink">Câu hỏi thường gặp</h2>
        <div className="mt-xl flex flex-col gap-md">
          <Hoi hoi="Tôi không rành máy tính, có dùng được không?">
            Được. Thu ngân chỉ bấm chọn món và bấm thu tiền, giống bấm trên điện thoại. POSMenu cài sẵn, nhập sẵn thực đơn và
            hướng dẫn tới khi quán dùng quen.
          </Hoi>
          <Hoi hoi="Cài đặt có mất phí không?">
            Không — cài máy in, nhập thực đơn, thiết lập quán và hướng dẫn qua Zalo, điều khiển máy từ xa đều miễn phí. Chỉ khi
            cần người tới tận quán thì POSMenu báo phí trước.
          </Hoi>
          <Hoi hoi="Có phải cài phần mềm lên điện thoại không?">Không. Mở bằng trình duyệt trên điện thoại là dùng được.</Hoi>
          <Hoi hoi="Dùng iPhone được không?">Được — cả iPhone, điện thoại Android và iPad.</Hoi>
          <Hoi hoi="Quán đã có máy in rồi, có phải mua máy mới không?">
            Không nhất thiết. Máy in khổ 80mm và có cổng mạng LAN thường dùng được — để lại số, POSMenu kiểm tra giúp.
          </Hoi>
          <Hoi hoi="Máy tính ở quầy có phải bật cả ngày không?">
            Bật trong giờ bán. Máy tắt thì bếp không tự ra phiếu và điện thoại không in được hóa đơn.
          </Hoi>
        </div>
      </section>

      {/* ---- Để lại số ---- */}
      <section className="border-t border-hairline bg-cream py-section-sm">
        <div className="mx-auto max-w-4xl px-lg">
          <h2 className="font-display text-3xl text-ink">Chưa chắc quán cần gì? Để lại số</h2>
          <p className="mt-md text-lg text-slate">POSMenu gọi lại, xem quán đang có gì và tư vấn phần còn thiếu.</p>
          <div className="mt-xl">
            <LeadForm variant="full" id="lien-he" />
          </div>
        </div>
      </section>
    </main>
  );
}

// ---- Mảnh ghép ------------------------------------------------------------

function DongBatBuoc({ so, children }: { so: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-sm">
      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-base font-semibold text-canvas">
        {so}
      </span>
      <span>{children}</span>
    </li>
  );
}

/** Ảnh thiết bị trong `public/marketing/thiet-bi/{tep}.jpg` (800×600, 4:3). */
function Anh({ tep, moTa }: { tep: string; moTa: string }) {
  return (
    <Image
      src={`/marketing/thiet-bi/${tep}.jpg`}
      alt={moTa}
      width={800}
      height={600}
      sizes="(min-width: 640px) 224px, 50vw"
      className="aspect-[4/3] w-full rounded-md border border-hairline object-cover"
    />
  );
}

function ThietBi({
  so,
  ten,
  batBuoc,
  nhan,
  hinh,
  congDung,
  chiPhi,
  children,
}: {
  so: number;
  ten: string;
  batBuoc?: boolean;
  nhan?: string;
  /** [tệp ảnh (không đuôi), mô tả ảnh] */
  hinh: [string, string][];
  congDung: string;
  /** Chi phí dự kiến — theo `docs/60-BanGiao/02-ThietBiChuan.md`. */
  chiPhi: string;
  children: React.ReactNode;
}) {
  return (
    <article className="rounded-lg border border-hairline bg-canvas p-lg shadow-card" data-thiet-bi={so}>
      <div className="flex flex-col gap-lg sm:flex-row">
        <div className={"grid shrink-0 gap-xs sm:w-56 " + (hinh.length > 1 ? "grid-cols-2 sm:grid-cols-1" : "grid-cols-1")}>
          {hinh.map(([tep, moTa]) => (
            <Anh key={tep} tep={tep} moTa={moTa} />
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-sm">
            <h3 className="font-display text-2xl text-ink">
              {so}. {ten}
            </h3>
            <span
              className={
                "rounded-full px-sm py-[2px] text-sm font-medium " +
                (batBuoc ? "bg-primary text-canvas" : "border border-hairline-strong text-slate")
              }
            >
              {batBuoc ? "Bắt buộc" : nhan}
            </span>
          </div>
          <p className="mt-xs text-lg text-ink">{congDung}</p>
          <p className="mt-xs text-base text-ink" data-chi-phi>
            <span className="font-medium text-primary">Chi phí dự kiến:</span> {chiPhi}
          </p>
          <div className="mt-sm text-base leading-relaxed text-slate">{children}</div>
        </div>
      </div>
    </article>
  );
}

function HoTro({ icon, ten, children }: { icon: React.ReactNode; ten: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-md rounded-lg border border-hairline p-lg">
      <span className="mt-0.5 shrink-0 text-primary [&>svg]:h-6 [&>svg]:w-6">{icon}</span>
      <div>
        <h3 className="text-lg font-medium text-ink">{ten}</h3>
        <p className="mt-xxs text-base leading-relaxed text-slate">{children}</p>
      </div>
    </div>
  );
}

function Luu({ children }: { children: React.ReactNode }) {
  return <p className="mt-sm rounded-md bg-cream px-md py-sm text-base text-ink">⚠ {children}</p>;
}

function Tick({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-xs">
      <BadgeCheck className="mt-1 h-4 w-4 shrink-0 text-primary" />
      <span>{children}</span>
    </li>
  );
}

function Buoc({ so, ten, children }: { so: number; ten: string; children: React.ReactNode }) {
  return (
    <li className="rounded-lg border border-hairline bg-canvas p-lg">
      <span className="grid h-9 w-9 place-items-center rounded-full bg-cream font-semibold text-primary">{so}</span>
      <h3 className="mt-sm text-lg font-medium text-ink">{ten}</h3>
      <p className="mt-xxs text-base leading-relaxed text-slate">{children}</p>
    </li>
  );
}

function Hoi({ hoi, children }: { hoi: string; children: React.ReactNode }) {
  return (
    <details className="rounded-lg border border-hairline bg-canvas p-lg">
      <summary className="cursor-pointer text-lg font-medium text-ink">{hoi}</summary>
      <p className="mt-sm text-base leading-relaxed text-slate">{children}</p>
    </details>
  );
}
