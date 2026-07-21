import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Restaurant SaaS — Quản lý nhà hàng',
  description: 'Hệ thống quản lý nhà hàng multi-tenant: gọi món QR, POS, KDS, đặt bàn, báo cáo.',
  keywords: ['nhà hàng', 'quản lý', 'POS', 'KDS', 'đặt bàn'],
  viewport: 'width=device-width, initial-scale=1',
};

export const viewport: Viewport = {
  themeColor: '#181d26',
  colorScheme: 'light',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body className="bg-canvas text-primary font-sans">
        {children}
      </body>
    </html>
  );
}
