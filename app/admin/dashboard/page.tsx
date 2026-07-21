'use client';

import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Container, SectionBand, Grid, Stack } from '@/components/Layout';
import { H1, H2, H3, Paragraph, Caption } from '@/components/Typography';

export default function AdminDashboard() {
  return (
    <>
      {/* Header band */}
      <SectionBand className="bg-surface-dark text-canvas border-0">
        <Container>
          <Stack direction="horizontal" className="justify-between items-center">
            <div>
              <H1 className="text-canvas">Dashboard</H1>
              <Paragraph className="text-canvas opacity-75 mt-md">
                Tổng quan quản lý nhà hàng
              </Paragraph>
            </div>
            <Button>+ Thêm</Button>
          </Stack>
        </Container>
      </SectionBand>

      {/* Main content */}
      <Container>
        {/* Key metrics */}
        <SectionBand>
          <H2 className="mb-xl">Các chỉ số chính</H2>
          <Grid columns="dashboard-wide" className="mb-2xl">
            {[
              { label: 'Đơn hôm nay', value: '42', change: '+12%' },
              { label: 'Doanh thu', value: '12.5M', change: '+8%' },
              { label: 'Bàn được dùng', value: '18/24', change: '75%' },
              { label: 'Nhân viên online', value: '8/12', change: '' },
            ].map((metric, i) => (
              <Card key={i} variant="flat">
                <p className="text-caption mb-sm">{metric.label}</p>
                <p className="text-display-lg font-medium mb-md">{metric.value}</p>
                {metric.change && (
                  <p className="text-caption text-success">{metric.change}</p>
                )}
              </Card>
            ))}
          </Grid>
        </SectionBand>

        {/* Tables section */}
        <SectionBand>
          <H2 className="mb-xl">Đơn hàng gần đây</H2>
          <Card variant="default">
            <table className="w-full text-body-md">
              <thead className="border-b border-hairline">
                <tr>
                  <th className="text-left py-md px-md font-medium text-primary">ID</th>
                  <th className="text-left py-md px-md font-medium text-primary">Bàn</th>
                  <th className="text-left py-md px-md font-medium text-primary">Tổng</th>
                  <th className="text-left py-md px-md font-medium text-primary">Trạng thái</th>
                  <th className="text-left py-md px-md font-medium text-primary">Hành động</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { id: '001', table: 'Bàn 5', total: '250K', status: 'Đang phục vụ' },
                  { id: '002', table: 'Bàn 12', total: '180K', status: 'Chờ thanh toán' },
                  { id: '003', table: 'Bàn 3', total: '120K', status: 'Hoàn thành' },
                ].map((order) => (
                  <tr key={order.id} className="border-b border-hairline hover:bg-surface-soft">
                    <td className="py-md px-md">{order.id}</td>
                    <td className="py-md px-md">{order.table}</td>
                    <td className="py-md px-md font-medium">{order.total}</td>
                    <td className="py-md px-md">
                      <span className={`px-md py-sm rounded-sm text-caption font-medium ${
                        order.status === 'Đang phục vụ' ? 'bg-signature-cream text-signature-coral' :
                        order.status === 'Chờ thanh toán' ? 'bg-signature-peach text-primary' :
                        'bg-success text-canvas'
                      }`}>
                        {order.status}
                      </span>
                    </td>
                    <td className="py-md px-md">
                      <Button variant="ghost" size="sm">Xem chi tiết</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </SectionBand>

        {/* Feature callouts */}
        <SectionBand>
          <H2 className="mb-xl">Các tính năng nổi bật</H2>
          <Grid columns="dashboard" className="mb-2xl">
            <Card variant="coral" className="p-xl">
              <H3 className="text-canvas mb-md">Quản lý menu</H3>
              <Paragraph className="text-canvas opacity-90 mb-lg">
                Cập nhật các món ăn, giá cả và mô tả một cách nhanh chóng.
              </Paragraph>
              <Button size="sm" className="bg-canvas text-signature-coral hover:bg-canvas hover:opacity-90">
                Quản lý →
              </Button>
            </Card>

            <Card variant="forest" className="p-xl">
              <H3 className="text-canvas mb-md">Báo cáo doanh thu</H3>
              <Paragraph className="text-canvas opacity-90 mb-lg">
                Xem chi tiết doanh thu, khách hàng và hiệu suất nhân viên.
              </Paragraph>
              <Button size="sm" className="bg-canvas text-signature-forest hover:bg-canvas hover:opacity-90">
                Xem báo cáo →
              </Button>
            </Card>

            <Card variant="default">
              <H3 className="mb-md">Đặt bàn</H3>
              <Paragraph className="text-body mb-lg">
                Quản lý đặt bàn, khách VIP và các sự kiện đặc biệt.
              </Paragraph>
              <Button variant="secondary" size="sm">
                Quản lý đặt bàn
              </Button>
            </Card>
          </Grid>
        </SectionBand>

        {/* Style guide link */}
        <SectionBand>
          <H2 className="mb-xl">Hỏi đáp về Design System</H2>
          <Card variant="flat">
            <p className="text-body-md mb-lg">
              Xem chi tiết các tokens, components và cách sử dụng:
            </p>
            <a href="/" className="text-link hover:underline">
              → Quay lại trang chủ (Style guide)
            </a>
          </Card>
        </SectionBand>
      </Container>
    </>
  );
}
