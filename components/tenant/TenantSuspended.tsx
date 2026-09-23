/**
 * Màn hiện thay cho MỌI bề mặt của một nhà hàng đang tạm ngưng (TENANT-06, QD-012 §2).
 *
 * Cố ý KHÔNG nói vì sao ngưng: lý do là chuyện giữa chủ quán và chúng ta, không phải thứ để khách
 * đang cầm điện thoại trước cửa quán đọc được. Cũng cố ý không có nút nào — mọi lối vào đều dẫn về
 * đây, nên một nút "thử lại" chỉ tạo cảm giác sai rằng còn cách nào đó vào được.
 */
export function TenantSuspended() {
  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-lg">
      <div className="max-w-md text-center">
        <h1 className="font-display text-2xl text-ink">Nhà hàng đang tạm ngưng</h1>
        <p className="mt-sm text-sm text-slate">
          Hệ thống của nhà hàng này hiện không hoạt động. Vui lòng liên hệ trực tiếp nhà hàng để
          được hỗ trợ.
        </p>
      </div>
    </main>
  );
}
