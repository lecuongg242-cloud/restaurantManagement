export default function HomePage() {
  return (
    <main className="min-h-screen bg-canvas">
      <div className="container-admin">
        <div className="py-3xl">
          <h1 className="text-display-lg text-primary mb-lg">
            Hệ thống quản lý nhà hàng
          </h1>
          <p className="text-body-md text-body max-w-2xl">
            Đây là bản thiết kế Airtable design system cho admin dashboard.
            Hệ thống này sử dụng các tokens màu sắc, kiểu chữ và khoảng cách được định nghĩa trong globals.css.
          </p>
        </div>

        {/* Color tokens showcase */}
        <section className="mb-section py-section border-b border-hairline">
          <h2 className="text-title-lg mb-xl">Tokens & Các thành phần</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-lg mb-2xl">
            {/* Primary button */}
            <div className="card">
              <h3 className="text-title-sm mb-md">Primary Button</h3>
              <button className="btn-primary w-full mb-md">Làm điều gì đó</button>
              <code className="text-caption text-muted block">
                .btn-primary
              </code>
            </div>

            {/* Secondary button */}
            <div className="card">
              <h3 className="text-title-sm mb-md">Secondary Button</h3>
              <button className="btn-secondary w-full mb-md">Hủy bỏ</button>
              <code className="text-caption text-muted block">
                .btn-secondary
              </code>
            </div>

            {/* Ghost button */}
            <div className="card">
              <h3 className="text-title-sm mb-md">Ghost Button</h3>
              <button className="btn-ghost w-full mb-md">Thêm</button>
              <code className="text-caption text-muted block">
                .btn-ghost
              </code>
            </div>
          </div>

          {/* Color palette */}
          <h3 className="text-title-md mb-lg mt-2xl">Palette & Signature Colors</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-md">
            {[
              { name: 'Primary', hex: '#181d26', class: 'bg-primary' },
              { name: 'Ink', hex: '#181d26', class: 'bg-ink' },
              { name: 'Body', hex: '#333840', class: 'bg-body' },
              { name: 'Surface Soft', hex: '#f8fafc', class: 'bg-surface-soft border border-hairline' },
              { name: 'Surface Strong', hex: '#e0e2e6', class: 'bg-surface-strong' },
              { name: 'Coral', hex: '#aa2d00', class: 'bg-signature-coral' },
              { name: 'Forest', hex: '#0a2e0e', class: 'bg-signature-forest' },
              { name: 'Cream', hex: '#f5e9d4', class: 'bg-signature-cream border border-hairline' },
              { name: 'Peach', hex: '#fcab79', class: 'bg-signature-peach' },
              { name: 'Mint', hex: '#a8d8c4', class: 'bg-signature-mint' },
            ].map(color => (
              <div key={color.name} className="flex flex-col">
                <div className={`${color.class} rounded-md h-16 mb-sm`} />
                <span className="text-caption font-sans font-medium text-primary">{color.name}</span>
                <code className="text-xs text-muted">{color.hex}</code>
              </div>
            ))}
          </div>
        </section>

        {/* Signature cards */}
        <section className="mb-section py-section border-b border-hairline">
          <h2 className="text-title-lg mb-xl">Signature Cards</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
            <div className="card-signature-coral">
              <h3 className="text-title-lg mb-md font-sans">Coral Callout</h3>
              <p className="text-body-md opacity-90">
                Dùng cho các thông báo quan trọng hoặc tính năng nổi bật.
              </p>
            </div>
            <div className="card-signature-forest">
              <h3 className="text-title-lg mb-md font-sans">Forest Callout</h3>
              <p className="text-body-md opacity-90">
                Dùng cho các callout thứ cấp hoặc demo grids.
              </p>
            </div>
          </div>
        </section>

        {/* Typography showcase */}
        <section className="py-section">
          <h2 className="text-title-lg mb-xl">Thang Typography</h2>
          
          <div className="space-y-3xl">
            <div>
              <p className="text-display-xl">Display XL (48px / 500)</p>
              <code className="text-caption text-muted">Article h2</code>
            </div>

            <div>
              <p className="text-display-lg">Display LG (40px / 400)</p>
              <code className="text-caption text-muted">Dashboard h1</code>
            </div>

            <div>
              <p className="text-display-md">Display MD (32px / 400)</p>
              <code className="text-caption text-muted">Section h2</code>
            </div>

            <div>
              <p className="text-title-lg">Title LG (24px / 400)</p>
              <code className="text-caption text-muted">Section headers</code>
            </div>

            <div>
              <p className="text-title-md">Title MD (20px / 400)</p>
              <code className="text-caption text-muted">Subsection</code>
            </div>

            <div>
              <p className="text-body-md">Body MD (14px / 400)</p>
              <code className="text-caption text-muted">Body copy — dùng cho nội dung chính trong bảng, list, form</code>
            </div>

            <div>
              <p className="text-caption">Caption (14px / 500)</p>
              <code className="text-caption text-muted">Captions & metadata</code>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
