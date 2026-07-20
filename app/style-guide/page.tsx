const SEMANTIC_COLORS = [
  ["--primary", "Primary — nút chính, thương hiệu"],
  ["--accent", "Accent — nhấn mạnh, giá tiền"],
  ["--background", "Background — nền trang"],
  ["--surface", "Surface — thẻ, panel"],
  ["--foreground", "Foreground — chữ chính"],
  ["--muted", "Muted — chữ phụ"],
  ["--border", "Border — viền"],
  ["--success", "Success — món xong, thành công"],
  ["--warning", "Warning — chờ lâu, cảnh báo"],
  ["--destructive", "Destructive — hủy, lỗi"],
] as const;

function Swatch({ token, label }: { token: string; label: string }) {
  return (
    <li className="flex items-center gap-3">
      <span
        className="h-10 w-10 shrink-0 rounded-lg border border-border"
        style={{ background: `var(${token})` }}
      />
      <div className="min-w-0">
        <code className="text-xs">{token}</code>
        <p className="truncate text-sm text-muted">{label}</p>
      </div>
    </li>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <h2 className="mb-4 text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export default function StyleGuidePage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-6">
      <header>
        <h1 className="text-3xl font-bold">Design system — Style guide</h1>
        <p className="text-muted">
          Nguồn chuẩn đối chiếu UI (QD-002). Token 3 lớp, mobile-first, điểm
          chạm ≥ 44px.
        </p>
      </header>

      <Section title="Chữ (Be Vietnam Pro + Inter + JetBrains Mono)">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold">Phở bò đặc biệt — Heading 1</h1>
          <h2 className="text-2xl font-semibold">Bánh cuốn Thanh Trì — Heading 2</h2>
          <h3 className="text-xl font-semibold">Quầy thu ngân — Heading 3</h3>
          <p className="text-base">
            Body 16px: Ẩm thực đường phố Việt Nam đầy đủ dấu — ă â đ ê ô ơ ư,
            sắc huyền hỏi ngã nặng.
          </p>
          <p className="text-sm text-muted">Chữ phụ 14px — ghi chú, mô tả món.</p>
          <p className="font-mono text-base">
            125.000 ₫ — Bàn A5 — #ORD-0042 (JetBrains Mono)
          </p>
        </div>
      </Section>

      <Section title="Màu semantic">
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {SEMANTIC_COLORS.map(([token, label]) => (
            <Swatch key={token} token={token} label={label} />
          ))}
        </ul>
      </Section>

      <Section title="Nút (min-height 44px)">
        <div className="flex flex-wrap items-center gap-3">
          <button className="min-h-11 cursor-pointer rounded-lg bg-primary px-5 font-medium text-on-primary transition-opacity duration-200 hover:opacity-90">
            Gọi món
          </button>
          <button className="min-h-11 cursor-pointer rounded-lg border border-border bg-surface px-5 font-medium transition-colors duration-200 hover:border-foreground/40">
            Xem bill
          </button>
          <button className="min-h-11 cursor-pointer rounded-lg bg-accent px-5 font-medium text-white transition-opacity duration-200 hover:opacity-90">
            Thanh toán
          </button>
          <button className="min-h-11 cursor-pointer rounded-lg border border-destructive/40 px-5 font-medium text-destructive transition-colors duration-200 hover:bg-destructive/10">
            Hủy món
          </button>
          <button disabled className="min-h-11 rounded-lg bg-primary px-5 font-medium text-on-primary opacity-50">
            Hết món
          </button>
        </div>
      </Section>

      <Section title="Form">
        <div className="flex max-w-sm flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Ghi chú món
            <input
              placeholder="VD: không hành, ít cay"
              className="min-h-11 rounded-lg border border-border bg-surface px-3 text-base outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
            />
          </label>
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            Lỗi hiển thị ngay cạnh trường nhập.
          </p>
        </div>
      </Section>

      <Section title="Trạng thái món (badge)">
        <div className="flex flex-wrap gap-2 text-sm font-medium">
          <span className="rounded-full bg-muted/15 px-3 py-1.5">Chờ xác nhận</span>
          <span className="rounded-full bg-warning/15 px-3 py-1.5 text-amber-700">Đang làm</span>
          <span className="rounded-full bg-success/15 px-3 py-1.5 text-success">Xong</span>
          <span className="rounded-full bg-destructive/15 px-3 py-1.5 text-destructive">Đã hủy</span>
        </div>
      </Section>

      <div data-surface="staff">
        <Section title='Khu staff — data-surface="staff" (nền trung tính)'>
          <div className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3">
            <div>
              <p className="font-semibold">Bàn A5 · 3 món</p>
              <p className="text-sm text-muted">12:45 — chờ 5 phút</p>
            </div>
            <button className="min-h-11 cursor-pointer rounded-lg bg-primary px-4 font-medium text-on-primary">
              Đóng bill
            </button>
          </div>
        </Section>
      </div>

      <div data-surface="kds">
        <Section title='KDS — data-surface="kds" (dark mặc định cho bếp)'>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between rounded-lg border border-border bg-black/40 px-4 py-3">
              <div>
                <p className="font-semibold">Bàn A5 — Phở bò tái ×2</p>
                <p className="text-sm text-muted">Ghi chú: không hành</p>
              </div>
              <button className="min-h-11 cursor-pointer rounded-lg bg-success px-4 font-medium text-white">
                Xong
              </button>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-destructive/60 bg-destructive/15 px-4 py-3">
              <div>
                <p className="font-semibold">Bàn B2 — Bún chả ×1</p>
                <p className="text-sm text-destructive">Quá 15 phút!</p>
              </div>
              <button className="min-h-11 cursor-pointer rounded-lg bg-success px-4 font-medium text-white">
                Xong
              </button>
            </div>
          </div>
        </Section>
      </div>
    </main>
  );
}
