import type { Metadata } from "next";
import { Swatch } from "@/components/design/swatch";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "Style Guide — Design System Mistral",
};

/** Bằng chứng OPS-03/OPS-05: design system Mistral + 4 profile bề mặt. */

const brandColors = [
  { name: "Primary", value: "#fa520f", varName: "--color-primary" },
  { name: "Primary deep", value: "#cc3a05", varName: "--color-primary-deep" },
  { name: "Cream", value: "#fff8e0", varName: "--color-cream", textDark: true },
  { name: "Cream deeper", value: "#fff0c2", varName: "--color-cream-deeper", textDark: true },
  { name: "Ink", value: "#1f1f1f", varName: "--color-ink" },
  { name: "Slate", value: "#4a4a4a", varName: "--color-slate" },
  { name: "Steel", value: "#6a6a6a", varName: "--color-steel" },
  { name: "Muted", value: "#a8a8a8", varName: "--color-muted" },
  { name: "Hairline", value: "#e5e5e5", varName: "--color-hairline", textDark: true },
  { name: "Beige deep", value: "#e6d5a8", varName: "--color-beige-deep", textDark: true },
];

const statusColors = [
  { name: "status-new", value: "#fff0c2", varName: "--status-new", textDark: true },
  { name: "status-active", value: "#fa520f", varName: "--status-active" },
  { name: "status-ready", value: "#1a7f4b", varName: "--status-ready" },
  { name: "status-late", value: "#c0341d", varName: "--status-late" },
  { name: "status-done", value: "#6a6a6a", varName: "--status-done" },
];

const spacingScale = [
  ["xxs", 4], ["xs", 8], ["sm", 12], ["md", 16], ["lg", 20],
  ["xl", 24], ["xxl", 32], ["xxxl", 40],
] as const;

const radiusScale = [
  ["xs", 4], ["sm", 6], ["md", 8], ["lg", 12], ["xl", 16], ["xxl", 20],
] as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-hairline-soft py-xxl">
      <h2 className="mb-lg text-xl font-medium text-ink">{title}</h2>
      {children}
    </section>
  );
}

export default function StyleGuidePage() {
  return (
    <div className="min-h-screen bg-canvas">
      <div className="mx-auto max-w-6xl px-lg py-xxl">
        <header className="pb-lg">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            Design System
          </p>
          <h1 className="mt-xs font-display text-4xl leading-tight text-ink">
            Style Guide — Mistral
          </h1>
          <p className="mt-sm max-w-2xl text-slate">
            Token màu / chữ / spacing / radius và 4 profile bề mặt (Customer · POS · KDS ·
            Admin) trên cùng một design system. Bằng chứng OPS-03 &amp; OPS-05.
          </p>
        </header>

        {/* 1. Token màu */}
        <Section title="1. Màu — thương hiệu & bề mặt">
          <div className="grid grid-cols-2 gap-sm sm:grid-cols-4 lg:grid-cols-5">
            {brandColors.map((c) => (
              <Swatch key={c.varName} {...c} />
            ))}
          </div>
          <h3 className="mb-sm mt-xl text-sm font-medium text-steel">
            Màu trạng thái (mở rộng — QD-006 F5)
          </h3>
          <div className="grid grid-cols-2 gap-sm sm:grid-cols-5">
            {statusColors.map((c) => (
              <Swatch key={c.varName} {...c} />
            ))}
          </div>
        </Section>

        {/* 2. Typography */}
        <Section title="2. Chữ — Fraunces · Inter · JetBrains Mono">
          <div className="space-y-md">
            <p className="font-display text-5xl leading-tight text-ink">
              Fraunces hero — Nhà hàng ngon
            </p>
            <p className="font-display text-3xl text-ink">Fraunces heading — Thực đơn hôm nay</p>
            <p className="font-sans text-2xl font-medium text-ink">
              Inter heading — Quản lý đơn hàng
            </p>
            <p className="font-sans text-base text-slate">
              Inter body 16px — Gọi món, thanh toán, in hóa đơn. Nhãn tiếng Việt đầy đủ dấu:
              phở, bún chả, gỏi cuốn, cà phê sữa đá.
            </p>
            <p className="font-mono text-sm text-charcoal">
              JetBrains Mono — receipt: 2× Phở bò = 130.000₫
            </p>
          </div>
        </Section>

        {/* 3. Spacing & Radius */}
        <Section title="3. Spacing & Radius">
          <div className="grid gap-xl md:grid-cols-2">
            <div>
              <h3 className="mb-sm text-sm font-medium text-steel">Spacing (base 4px)</h3>
              <div className="space-y-xs">
                {spacingScale.map(([name, px]) => (
                  <div key={name} className="flex items-center gap-sm">
                    <span className="w-16 font-mono text-xs text-steel">{name}</span>
                    <div className="h-4 bg-primary" style={{ width: px }} />
                    <span className="text-xs text-muted">{px}px</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="mb-sm text-sm font-medium text-steel">Radius</h3>
              <div className="flex flex-wrap gap-md">
                {radiusScale.map(([name, px]) => (
                  <div key={name} className="text-center">
                    <div
                      className="h-16 w-16 border border-beige-deep bg-cream"
                      style={{ borderRadius: px }}
                    />
                    <div className="mt-xxs font-mono text-[11px] text-steel">
                      {name} · {px}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Section>

        {/* 4. Components */}
        <Section title="4. Component (shadcn map token)">
          <div className="space-y-lg">
            <div className="flex flex-wrap items-center gap-sm">
              <Button variant="primary">Primary</Button>
              <Button variant="dark">Dark</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="cream">Cream</Button>
              <Button variant="link">Link</Button>
              <Button variant="primary" disabled>
                Disabled
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-sm">
              <Badge variant="orange">orange</Badge>
              <Badge variant="cream">cream</Badge>
              <Badge variant="dark">dark</Badge>
              <Badge variant="new">chờ duyệt</Badge>
              <Badge variant="active">đang làm</Badge>
              <Badge variant="ready">sẵn sàng</Badge>
              <Badge variant="late">quá hạn</Badge>
              <Badge variant="done">xong</Badge>
            </div>
            <div className="grid gap-md md:grid-cols-3">
              <Card variant="base">
                <CardHeader>
                  <CardTitle>card-base</CardTitle>
                </CardHeader>
                <CardContent>Thẻ nội dung chuẩn, viền hairline.</CardContent>
              </Card>
              <Card variant="feature">
                <CardHeader>
                  <CardTitle>card-feature</CardTitle>
                </CardHeader>
                <CardContent>Thẻ nổi bật, đổ bóng nhẹ.</CardContent>
              </Card>
              <Card variant="cream">
                <CardHeader>
                  <CardTitle>card-cream</CardTitle>
                </CardHeader>
                <CardContent>Thẻ nền kem, viền beige.</CardContent>
              </Card>
            </div>
            <div className="max-w-sm space-y-xs">
              <Input placeholder="text-input — nhập tên món…" />
            </div>
            <div className="flex flex-wrap gap-xs">
              <span className="rounded-full border border-hairline bg-canvas px-md py-xs text-sm font-medium text-steel">
                pill-tab
              </span>
              <span className="rounded-full border border-ink bg-ink px-md py-xs text-sm font-medium text-on-dark">
                pill-tab-active
              </span>
            </div>
          </div>
        </Section>

        {/* 5. Bốn profile bề mặt */}
        <Section title="5. Bốn profile bề mặt">
          <div className="grid gap-lg lg:grid-cols-2">
            {/* Customer */}
            <div className="rounded-lg border border-hairline-soft p-lg">
              <Badge variant="cream">Customer</Badge>
              <h3 className="mt-sm font-display text-3xl leading-tight text-ink">
                Frontier vị ngon
              </h3>
              <p className="mt-xs text-sm text-slate">
                Editorial ấm: Fraunces hero, thẻ kem, dải sunset.
              </p>
              <div className="mt-md rounded-lg border border-beige-deep bg-cream p-md">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-ink">Phở bò tái</span>
                  <span className="text-ink">65.000₫</span>
                </div>
                <Button className="mt-sm w-full" variant="primary">
                  Thêm vào giỏ
                </Button>
              </div>
              <div className="mt-md h-3 w-full rounded-full bg-sunset" />
            </div>

            {/* POS */}
            <div className="rounded-lg border border-hairline-soft p-lg">
              <Badge variant="dark">POS</Badge>
              <h3 className="mt-sm text-xl font-medium text-ink">Sơ đồ bàn</h3>
              <p className="mt-xs text-sm text-slate">
                Dày đặc, Inter, nút to ≥44px, tương phản mạnh.
              </p>
              <div className="mt-md grid grid-cols-3 gap-xs">
                <div className="grid h-14 place-items-center rounded-md border border-hairline bg-canvas text-sm">
                  B1
                </div>
                <div className="grid h-14 place-items-center rounded-md border border-beige-deep bg-cream text-sm font-medium">
                  B2 ·khách
                </div>
                <div className="grid h-14 place-items-center rounded-md border border-primary text-sm">
                  B3 ·đặt
                </div>
              </div>
              <div className="mt-md flex gap-xs">
                <Button size="lg" variant="primary" className="flex-1">
                  Gửi bếp
                </Button>
                <Button size="lg" variant="secondary" className="flex-1">
                  Thanh toán
                </Button>
              </div>
            </div>

            {/* KDS */}
            <div className="rounded-lg border border-hairline-soft bg-ink p-lg">
              <Badge variant="active">KDS</Badge>
              <h3 className="mt-sm text-xl font-medium text-on-dark">Vé bếp</h3>
              <p className="mt-xs text-sm text-on-dark-muted">
                Chữ lớn đọc xa, màu status mạnh, không trang trí.
              </p>
              <div className="mt-md rounded-md bg-canvas p-md">
                <div className="flex items-center justify-between">
                  <span className="text-lg font-semibold text-ink">Bàn 5</span>
                  <Badge variant="late">08:12 quá hạn</Badge>
                </div>
                <ul className="mt-xs text-lg text-ink">
                  <li>2× Phở bò tái</li>
                  <li>1× Gỏi cuốn</li>
                </ul>
                <Button size="lg" variant="primary" className="mt-sm w-full">
                  Xong
                </Button>
              </div>
            </div>

            {/* Admin */}
            <div className="rounded-lg border border-hairline-soft p-lg">
              <Badge variant="orange">Admin</Badge>
              <h3 className="mt-sm font-display text-2xl text-ink">Doanh thu</h3>
              <p className="mt-xs text-sm text-slate">Product theme: bảng + form + dashboard.</p>
              <div className="mt-md overflow-hidden rounded-md border border-hairline-soft">
                <table className="w-full text-left text-sm">
                  <thead className="bg-surface text-steel">
                    <tr>
                      <th className="px-sm py-xs font-medium">Món</th>
                      <th className="px-sm py-xs text-right font-medium">Đã bán</th>
                    </tr>
                  </thead>
                  <tbody className="text-ink">
                    <tr className="border-t border-hairline-soft">
                      <td className="px-sm py-xs">Phở bò</td>
                      <td className="px-sm py-xs text-right">128</td>
                    </tr>
                    <tr className="border-t border-hairline-soft">
                      <td className="px-sm py-xs">Bún chả</td>
                      <td className="px-sm py-xs text-right">96</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="mt-md flex gap-xs">
                <Input placeholder="Tìm món…" />
                <Button variant="dark">Lọc</Button>
              </div>
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}
