/**
 * Menu mẫu tiếng Việt cho onboarding (TENANT-03): owner mới bấm "Dùng menu mẫu"
 * để có sẵn ~10 món chia 3 danh mục, rồi sửa nhanh thay vì gõ từ đầu.
 * Không kèm ảnh (owner thêm sau). Giá integer VND.
 */

export type SampleItem = { name: string; description: string; base_price: number };
export type SampleCategory = { name: string; items: SampleItem[] };

export const SAMPLE_MENU: SampleCategory[] = [
  {
    name: "Món chính",
    items: [
      { name: "Phở bò", description: "Phở bò tái, nước dùng đậm đà", base_price: 45000 },
      { name: "Cơm gà", description: "Cơm gà xé, gỏi kèm", base_price: 40000 },
      { name: "Bún chả", description: "Bún chả nướng than", base_price: 50000 },
      { name: "Bún bò Huế", description: "Cay nhẹ, giò heo", base_price: 48000 },
    ],
  },
  {
    name: "Đồ uống",
    items: [
      { name: "Trà đá", description: "Trà đá mát lạnh", base_price: 5000 },
      { name: "Cà phê sữa", description: "Cà phê phin truyền thống", base_price: 25000 },
      { name: "Nước cam", description: "Cam vắt tươi", base_price: 30000 },
      { name: "Nước suối", description: "Chai 500ml", base_price: 10000 },
    ],
  },
  {
    name: "Tráng miệng",
    items: [
      { name: "Chè đậu xanh", description: "Chè đậu xanh nước cốt dừa", base_price: 20000 },
      { name: "Sữa chua", description: "Sữa chua nhà làm", base_price: 15000 },
    ],
  },
];

/** Tổng số món mẫu (dùng để hiển thị/tóm tắt). */
export const SAMPLE_ITEM_COUNT = SAMPLE_MENU.reduce((n, c) => n + c.items.length, 0);
