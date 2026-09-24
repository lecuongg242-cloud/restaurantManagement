/**
 * Ghép/bóc host cho ảnh trong bucket Storage. Thuần hàm, dùng được ở cả server lẫn client.
 *
 * QUY ƯỚC: database lưu **đường dẫn tương đối trong bucket** (`<tenantId>/<tệp>.png`), host được
 * ghép lúc đọc từ `NEXT_PUBLIC_SUPABASE_URL`.
 *
 * VÌ SAO: trước đây lưu URL tuyệt đối, tức là nhúng tên project Supabase vào dữ liệu. Khi chuyển
 * database sang Singapore (24/09/2026), 9 dòng vẫn trỏ project Mỹ đã xóa và toàn bộ ảnh món vỡ —
 * phải vá tay bằng một lệnh UPDATE trên quán đang bán hàng. Với đường dẫn tương đối thì đổi hạ
 * tầng không còn đụng tới dữ liệu.
 *
 * Cả hai hàm đều nuốt được dữ liệu CŨ lẫn MỚI, nên không có khoảnh khắc nào ảnh vỡ dù deploy code
 * trước hay chuyển dữ liệu trước.
 */

/** Bucket dung chung cho anh mon + logo quan. Dinh nghia o day vi tep nay khong phu thuoc gi —
 * client component nhap vao cung khong keo theo ma server. */
export const MENU_BUCKET = "menu-images";

const MOC = `/storage/v1/object/public/${MENU_BUCKET}/`;

function goc(): string {
  return (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
}

/**
 * Giá trị trong DB → URL hiển thị được. URL cũ trỏ project đã xóa cũng được **viết lại** sang host
 * hiện tại: dữ liệu chưa chuyển xong vẫn hiện ảnh bình thường.
 *
 * URL ngoài bucket (CDN khác) giữ nguyên — không phải thứ ta quản, đừng bẻ.
 */
export function urlAnh(giaTri: string | null | undefined): string | null {
  const v = giaTri?.trim();
  if (!v) return null;

  if (/^https?:\/\//i.test(v)) {
    const i = v.indexOf(MOC);
    if (i === -1) return v;
    return `${goc()}${MOC}${v.slice(i + MOC.length)}`;
  }
  return `${goc()}${MOC}${v.replace(/^\/+/, "")}`;
}

/**
 * Giá trị bất kỳ → đường dẫn tương đối để LƯU vào DB và để XÓA tệp trong Storage.
 *
 * URL ngoài bucket trả null: nó không phải tệp của ta, xóa theo là xóa nhầm.
 */
export function duongDanAnh(giaTri: string | null | undefined): string | null {
  const v = giaTri?.trim();
  if (!v) return null;

  if (/^https?:\/\//i.test(v)) {
    const i = v.indexOf(MOC);
    return i === -1 ? null : v.slice(i + MOC.length);
  }
  return v.replace(/^\/+/, "");
}
