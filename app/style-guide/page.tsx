const SEMANTIC_COLORS = [
  ["--primary", "Primary — nút pill đen, CTA chủ đạo"],
  ["--background", "Canvas — nền trắng editorial"],
  ["--surface", "Surface — panel xám nhạt"],
  ["--foreground", "Ink — chữ chính (gần đen)"],
  ["--muted", "Steel — chữ phụ"],
  ["--border", "Hairline — viền 1px"],
  ["--success", "Success — xác nhận"],
  ["--destructive", "Error — lỗi, hủy"],
  ["--id-customer", "Coral — định danh app khách/QR"],
  ["--id-pos", "Blue — định danh POS"],
  ["--id-admin", "Purple — định danh quản trị"],
  ["--id-online", "Magenta — định danh đặt bàn/online"],
] as const;

function Swatch({ token, label }: { token: string; label: string }) {
  return (
    <li className="flex items-center gap-3">
      <span
        className="h-10 w-10 shrink-0 rounded-lg border border-border"
        style={{ background: `var(${token})` }}
      />
      <div className="min-w-0">
        <code className="font-mono text-xs">{token}</code>
        <p className="truncate text-sm text-muted">{label}</p>
      </div>
    </li>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-background p-6">
      <h2 className="mb-4 text-2xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export default function StyleGuidePage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-6">
      <header className="py-6">
        <h1 className="text-4xl font-semibold sm:text-5xl">
          Hệ thống nhà hàng
        </h1>
        <p className="mt-3 max-w-lg text-lg text-muted">
          Style guide — ngôn ngữ MiniMax chuyển thể (QD-003). Canvas trắng, pill
          đen, hairline, một typeface: Be Vietnam Pro.
        </p>
        <div className="mt-5 flex gap-3">
          <button className="min-h-11 cursor-pointer rounded-full bg-primary px-6 text-sm font-semibold text-on-primary transition-opacity duration-200 hover:opacity-85">
            Gọi món ngay
          </button>
          <button className="min-h-11 cursor-pointer rounded-full border border-foreground px-6 text-sm font-semibold transition-colors duration-200 hover:bg-surface">
            Xem menu
          </button>
        </div>
      </header>

      <Section title="Chữ — Be Vietnam Pro (đủ dấu tiếng Việt)">
        <div className="flex flex-col gap-3">
          <p className="text-4xl font-semibold tracking-tight">
            Phở bò đặc biệt — heading-lg 40
          </p>
          <p className="text-3xl font-semibold tracking-tight">
            Bánh cuốn Thanh Trì — heading-md 32
          </p>
          <p className="text-2xl font-semibold">Quầy thu ngân — heading-sm 24</p>
          <p className="text-xl font-semibold">Card title 20</p>
          <p className="text-lg font-medium text-muted">
            Subtitle 18 — ăn uống, đặc sản, sắc huyền hỏi ngã nặng
          </p>
          <p className="text-base">
            Body 16 — Ẩm thực đường phố Việt Nam đầy đủ dấu: ă â đ ê ô ơ ư.
          </p>
          <p className="text-sm text-muted">Body-sm 14 — ghi chú, metadata.</p>
          <p className="font-mono text-base">
            125.000 ₫ · Bàn A5 · #ORD-0042 (JetBrains Mono)
          </p>
        </div>
      </Section>

      <Section title="Màu semantic + định danh khu vực">
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {SEMANTIC_COLORS.map(([token, label]) => (
            <Swatch key={token} token={token} label={label} />
          ))}
        </ul>
      </Section>

      <Section title="Nút pill (rounded-full, min 44px)">
        <div className="flex flex-wrap items-center gap-3">
          <button className="min-h-11 cursor-pointer rounded-full bg-primary px-6 text-sm font-semibold text-on-primary transition-opacity duration-200 hover:opacity-85">
            Primary — Gọi món
          </button>
          <button className="min-h-11 cursor-pointer rounded-full border border-foreground px-6 text-sm font-semibold transition-colors duration-200 hover:bg-surface">
            Secondary — Xem bill
          </button>
          <button className="min-h-11 cursor-pointer rounded-full border border-border bg-background px-6 text-sm font-semibold transition-colors duration-200 hover:border-foreground">
            Tertiary — Chi tiết
          </button>
          <button className="min-h-11 cursor-pointer rounded-full border border-destructive/40 px-6 text-sm font-semibold text-destructive transition-colors duration-200 hover:bg-destructive/10">
            Hủy món
          </button>
          <button disabled className="min-h-11 rounded-full bg-border px-6 text-sm font-semibold text-muted">
            Hết món
          </button>
        </div>
      </Section>

      <Section title="Badge & trạng thái món">
        <div className="flex flex-wrap items-center gap-2 text-[13px] font-semibold">
          <span className="rounded-full bg-surface px-3 py-1.5 text-muted">Chờ xác nhận</span>
          <span className="rounded-full bg-warning/15 px-3 py-1.5 text-amber-700">Đang làm</span>
          <span className="rounded-full bg-success-bg px-3 py-1.5 text-success">Xong</span>
          <span className="rounded-full bg-destructive/10 px-3 py-1.5 text-destructive">Đã hủy</span>
          <span className="rounded-full bg-id-customer px-3 py-1.5 text-white">MỚI</span>
        </div>
      </Section>

      <Section title="Form (input 8px, focus ring xanh)">
        <div className="flex max-w-sm flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Ghi chú món
            <input
              placeholder="VD: không hành, ít cay"
              className="min-h-11 rounded-lg border border-border bg-background px-3 text-base outline-none focus:border-ring focus:ring-2 focus:ring-ring/25"
            />
          </label>
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            Lỗi hiển thị ngay cạnh trường nhập.
          </p>
        </div>
      </Section>

      <Section title="Thẻ định danh khu vực (rounded 32px — chỉ cho identity)">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {[
            ["Gọi món QR", "App khách — quét là gọi", "var(--id-customer)"],
            ["POS", "Sơ đồ bàn & thanh toán", "var(--id-pos)"],
            ["Quản trị", "Menu, nhân viên, báo cáo", "var(--id-admin)"],
            ["Đặt bàn online", "Giữ chỗ trước khi đến", "var(--id-online)"],
          ].map(([title, desc, color]) => (
            <div
              key={title}
              className="flex min-h-36 flex-col justify-end p-7 text-white"
              style={{ background: color, borderRadius: "var(--radius-feature)" }}
            >
              <p className="text-2xl font-semibold tracking-tight">{title}</p>
              <p className="text-sm opacity-80">{desc}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Bảng dữ liệu (flat + hairline)">
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface text-left text-[13px] font-semibold text-muted">
                <th className="px-4 py-3">Món</th>
                <th className="px-4 py-3">SL</th>
                <th className="px-4 py-3 text-right">Giá</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Phở bò tái", "2", "130.000 ₫"],
                ["Bún chả", "1", "55.000 ₫"],
                ["Trà đá", "3", "9.000 ₫"],
              ].map(([mon, sl, gia]) => (
                <tr key={mon} className="border-t border-border-soft">
                  <td className="px-4 py-3">{mon}</td>
                  <td className="px-4 py-3">{sl}</td>
                  <td className="px-4 py-3 text-right font-mono">{gia}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <div data-surface="kds">
        <Section title='KDS — data-surface="kds" (dark cho bếp)'>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between rounded-2xl border border-border bg-surface px-4 py-3">
              <div>
                <p className="font-semibold">Bàn A5 — Phở bò tái ×2</p>
                <p className="text-sm text-muted">Ghi chú: không hành</p>
              </div>
              <button className="min-h-11 cursor-pointer rounded-full bg-success px-5 text-sm font-semibold text-white">
                Xong
              </button>
            </div>
            <div className="flex items-center justify-between rounded-2xl border border-destructive/60 bg-destructive/15 px-4 py-3">
              <div>
                <p className="font-semibold">Bàn B2 — Bún chả ×1</p>
                <p className="text-sm text-destructive">Quá 15 phút!</p>
              </div>
              <button className="min-h-11 cursor-pointer rounded-full bg-success px-5 text-sm font-semibold text-white">
                Xong
              </button>
            </div>
          </div>
        </Section>
      </div>
    </main>
  );
}
