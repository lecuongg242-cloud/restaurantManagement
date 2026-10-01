// Cầu nối trang của app ↔ Android (P24, QD-030). CÙNG API `window.techmenu` với desktop/preload.cjs của app Windows để
// dùng lại nguyên các trang trong desktop/trang/. Kênh `TechMenuAndroid` chỉ được Android gắn cho nguồn trang của app
// (addWebMessageListener lọc theo nguồn) — trang POS trên web không bao giờ có nó.
(() => {
  const kenh = window.TechMenuAndroid;
  if (!kenh) return;
  let dem = 0;
  const cho = new Map();
  kenh.onmessage = (e) => {
    let m;
    try {
      m = JSON.parse(e.data);
    } catch {
      return;
    }
    const c = cho.get(m.id);
    if (!c) return;
    cho.delete(m.id);
    if (m.loi) c.reject(new Error(m.loi));
    else c.resolve(m.ketQua);
  };
  const goi = (lenh, ...thamSo) =>
    new Promise((resolve, reject) => {
      const id = ++dem;
      cho.set(id, { resolve, reject });
      kenh.postMessage(JSON.stringify({ id, lenh, thamSo }));
    });
  window.techmenu = Object.freeze({
    kichHoat: (vao) => goi("kichHoat", vao),
    docMayIn: () => goi("docMayIn"),
    doMayInLan: () => goi("doMayInLan"),
    inThu: (nhap, vai) => goi("inThu", nhap, vai),
    luuMayIn: (nhap) => goi("luuMayIn", nhap),
    moManHinh: () => goi("moManHinh"),
    thuLai: (dich) => goi("thuLai", dich),
  });
})();
