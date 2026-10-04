/** Định dạng giờ VN cho app Quản lý (máy chủ chạy UTC — luôn ghi rõ múi giờ). Ngày dạng "03/10 23:42". */
const PHAN = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Ho_Chi_Minh",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function phan(iso: string) {
  const p = Object.fromEntries(PHAN.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return { ngay: `${p.day}/${p.month}`, gio: `${p.hour}:${p.minute}` };
}

export const gioVn = (iso: string | null) => (iso ? phan(iso).gio : "—");
export const ngayGioVn = (iso: string | null) => {
  if (!iso) return "—";
  const p = phan(iso);
  return `${p.ngay} ${p.gio}`;
};
