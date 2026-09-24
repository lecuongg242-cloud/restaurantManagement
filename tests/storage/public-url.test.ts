import { describe, it, expect, beforeEach, afterEach } from "vitest";

/**
 * Ảnh lưu ĐƯỜNG DẪN TƯƠNG ĐỐI, ghép host lúc đọc.
 *
 * VÌ SAO: trước đây `menu_items.image_url` lưu URL tuyệt đối có sẵn tên project Supabase trong đó.
 * Khi chuyển database sang Singapore, 9 dòng dữ liệu vẫn trỏ vào project Mỹ đã xóa → toàn bộ ảnh
 * món vỡ, phải sửa tay từng dòng. Lưu đường dẫn tương đối thì lần đổi hạ tầng sau không đụng tới
 * dữ liệu nữa.
 *
 * Helper phải nuốt được CẢ HAI dạng: dữ liệu cũ (URL tuyệt đối, có thể trỏ host đã chết) và dữ
 * liệu mới (đường dẫn tương đối). Nhờ vậy thứ tự triển khai không quan trọng — deploy code trước
 * hay đổi dữ liệu trước đều không có khoảnh khắc nào ảnh vỡ.
 */
const HOST_MOI = "https://moi123.supabase.co";
const goc = process.env.NEXT_PUBLIC_SUPABASE_URL;

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = HOST_MOI;
});
afterEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = goc;
});

const { urlAnh, duongDanAnh } = await import("@/lib/storage/public-url");

const TIEN_TO = `${HOST_MOI}/storage/v1/object/public/menu-images`;

describe("urlAnh", () => {
  it("đường dẫn tương đối → ghép host hiện tại", () => {
    expect(urlAnh("tenant-1/mon-abc.png")).toBe(`${TIEN_TO}/tenant-1/mon-abc.png`);
  });

  it("URL cũ trỏ project ĐÃ XÓA → viết lại sang host hiện tại, ảnh không vỡ", () => {
    const cu = "https://daxoa.supabase.co/storage/v1/object/public/menu-images/tenant-1/mon-abc.png";
    expect(urlAnh(cu)).toBe(`${TIEN_TO}/tenant-1/mon-abc.png`);
  });

  it("URL đã đúng host → giữ nguyên", () => {
    const dung = `${TIEN_TO}/tenant-1/mon-abc.png`;
    expect(urlAnh(dung)).toBe(dung);
  });

  it("không có ảnh → null (component đang dựa vào null để ẩn khung ảnh)", () => {
    expect(urlAnh(null)).toBeNull();
    expect(urlAnh(undefined)).toBeNull();
    expect(urlAnh("")).toBeNull();
    expect(urlAnh("   ")).toBeNull();
  });

  it("URL ngoài Supabase Storage → giữ nguyên, không bẻ thành đường dẫn nội bộ", () => {
    const ngoai = "https://cdn.khac.com/anh.png";
    expect(urlAnh(ngoai)).toBe(ngoai);
  });
});

describe("duongDanAnh — dạng đem đi lưu và đem đi xóa", () => {
  it("bóc host khỏi URL tuyệt đối", () => {
    const cu = "https://bat-ky.supabase.co/storage/v1/object/public/menu-images/tenant-1/a.png";
    expect(duongDanAnh(cu)).toBe("tenant-1/a.png");
  });

  it("vốn đã tương đối thì giữ nguyên", () => {
    expect(duongDanAnh("tenant-1/a.png")).toBe("tenant-1/a.png");
  });

  it("không có ảnh → null", () => {
    expect(duongDanAnh(null)).toBeNull();
    expect(duongDanAnh("")).toBeNull();
  });

  it("URL ngoài bucket → null, không xóa nhầm tệp của người khác", () => {
    expect(duongDanAnh("https://cdn.khac.com/anh.png")).toBeNull();
  });
});

describe("đi vòng tròn", () => {
  it("lưu rồi đọc lại ra đúng URL, qua bất kỳ host nào", () => {
    const cu = "https://daxoa.supabase.co/storage/v1/object/public/menu-images/t/x.png";
    expect(urlAnh(duongDanAnh(cu))).toBe(`${TIEN_TO}/t/x.png`);
  });
});

/**
 * Chốt chặn: nơi ĐỌC cột ảnh từ database phải đi qua helper.
 *
 * Lỗi cũ không phải một dòng code sai mà là dữ liệu và cách hiển thị dính chặt vào nhau. Thêm một
 * chỗ truy vấn `image_url` rồi ném thẳng vào `<Image src>` là đủ để tái lập, và nó sẽ chỉ lộ ra ở
 * lần đổi hạ tầng kế tiếp — quá muộn.
 *
 * Chỉ soi file TỰ TRUY VẤN database. Component nhận prop thì giá trị đã được chuyển đổi ở biên đọc
 * rồi; bắt chúng gọi helper lần nữa là luật sai, và luật sai thì người ta sẽ tắt nó đi.
 *
 * Ngoại lệ hẹp: chỉ hỏi "có ảnh hay không" (`!!tenant?.logo_url`) thì không có URL nào thoát ra
 * ngoài, không cần helper.
 */
describe("biên đọc database đều qua helper", () => {
  it("không truy vấn nào lấy image_url/logo_url/cover_url rồi dùng thẳng", async () => {
    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");

    const tep: string[] = [];
    const quet = (d: string) => {
      for (const ten of readdirSync(d)) {
        const p = join(d, ten);
        if (statSync(p).isDirectory()) quet(p);
        else if (/\.tsx?$/.test(ten)) tep.push(p);
      }
    };
    quet("app");
    quet("components");
    quet("lib");

    const COT = /\b(image_url|logo_url|cover_url)\b/;

    const viPham = tep.filter((p) => {
      if (p.includes(join("lib", "storage"))) return false; // chính là helper
      const src = readFileSync(p, "utf8");
      if (!/\.from\(/.test(src) || !/\.select\(/.test(src)) return false; // không đọc DB
      if (!COT.test(src)) return false;
      if (/\b(urlAnh|duongDanAnh)\b/.test(src)) return false;

      // Bỏ nội dung các chuỗi select("…") rồi xét phần còn lại: chỉ còn dạng `!!x.logo_url` thì
      // đó là phép kiểm tra tồn tại, không phải dùng giá trị.
      const conLai = src.replace(/\.select\((["'`])[\s\S]*?\1/g, ".select(");
      const dungGiaTri = conLai
        .split("\n")
        .filter((d) => COT.test(d))
        .filter((d) => !/!!\s*[A-Za-z_$][\w$?.]*\.(image_url|logo_url|cover_url)/.test(d));
      return dungGiaTri.length > 0;
    });

    expect(viPham, `Dùng urlAnh() khi đọc ra, duongDanAnh() khi lưu vào:\n${viPham.join("\n")}`)
      .toEqual([]);
  });
});
