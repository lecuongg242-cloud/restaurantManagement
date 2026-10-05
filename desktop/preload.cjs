// desktop/preload.cjs — cầu nối trang ↔ app (chạy trong sandbox, contextIsolation).
//
// Trang web (POS / Màn bếp trên tên miền app): chỉ nhận DỮ LIỆU `window.techmenuDesktop = { phienBan, coCauIn }` để
// lib/print/adapter.ts biết đang chạy trong app có cầu in (DESK-07). Không có hàm hệ thống nào.
// Trang cục bộ của app (file://…/trang/): thêm `window.techmenu` gọi lệnh có quyền; main.mjs vẫn kiểm lại nguồn
// từng lệnh — preload không phải hàng rào duy nhất.
const { contextBridge, ipcRenderer } = require("electron");

const thongTin = ipcRenderer.sendSync("thong-tin-app");
contextBridge.exposeInMainWorld("techmenuDesktop", Object.freeze({ phienBan: thongTin.phienBan, coCauIn: thongTin.coCauIn }));

if (location.protocol === "file:") {
  contextBridge.exposeInMainWorld("techmenu", {
    kichHoat: (vao) => ipcRenderer.invoke("kich-hoat", vao),
    docMayIn: () => ipcRenderer.invoke("may-in:doc"),
    doMayInLan: () => ipcRenderer.invoke("may-in:do-lan"),
    dsMayInUsb: () => ipcRenderer.invoke("may-in:ds-usb"),
    inThu: (nhap, vai) => ipcRenderer.invoke("may-in:in-thu", nhap, vai),
    luuMayIn: (nhap) => ipcRenderer.invoke("may-in:luu", nhap),
    moManHinh: () => ipcRenderer.invoke("mo-man-hinh"),
    thuLai: (dich) => ipcRenderer.invoke("thu-lai", dich),
  });
}
