// Màn Cài đặt máy in (DESK-06) — thay các câu hỏi PowerShell của CAI-DAT.bat. In thử chạy chính cầu in (`--test`).
const $ = (id) => document.getElementById(id);
const lanDau = new URLSearchParams(location.search).get("lanDau") === "1";

const chon = (ten) => document.querySelector(`input[name="${ten}"]:checked`)?.value;
const dat = (ten, gt) => {
  const o = document.querySelector(`input[name="${ten}"][value="${gt}"]`);
  if (o) o.checked = true;
};

function hien(o, thongDiep, tot) {
  o.textContent = thongDiep;
  o.classList.toggle("an", !thongDiep);
  o.classList.toggle("tot", Boolean(tot));
  o.classList.toggle("loi", !tot);
}

function capNhatHien() {
  $("bep-lan").classList.toggle("an", chon("bep") !== "lan");
  const q = chon("quay");
  $("quay-usb").classList.toggle("an", q !== "usb");
  $("quay-lan").classList.toggle("an", q !== "lan");
  $("quay-thu").classList.toggle("an", q === "khong");
  $("khoi-lien").classList.toggle("an", q === "khong" || laAndroid);
  for (const k of khoiNoi) k.lan.classList.toggle("an", k.chon() !== "lan");
}

// ── Bếp/bar (P37): danh sách từ web; mỗi nơi ngoài Bếp chính một khối chọn máy in ──
let laAndroid = false;
/** [{ id, ten, macDinh }] — Bếp chính đầu tiên. null = không tải được; undefined = app chưa hỗ trợ (Android cũ). */
let dsNoi;
/** Máy riêng đã lưu theo id — giữ nguyên cho nơi không hiện được (mất mạng) khi lưu lại. */
let mayNoiDaLuu = {};
/** Khối giao diện của từng bếp/bar khác. */
const khoiNoi = [];

function veNoi() {
  const nhieu = Array.isArray(dsNoi) && dsNoi.length > 1;
  $("t-bep").textContent = Array.isArray(dsNoi) ? "Máy in bếp / bar" : "Máy in bếp";
  $("noi-goi-y").classList.toggle("an", !Array.isArray(dsNoi));
  $("noi-loi").classList.toggle("an", dsNoi !== null);
  $("ten-bep-chinh").classList.toggle("an", !nhieu);
  if (nhieu) $("ten-bep-chinh").textContent = dsNoi[0].ten;
  khoiNoi.length = 0;
  const vung = $("ds-noi");
  vung.replaceChildren();
  if (!nhieu) return;
  dsNoi.slice(1).forEach((noi, i) => {
    const el = $("mau-noi").content.firstElementChild.cloneNode(true);
    el.dataset.id = noi.id;
    el.querySelector(".ten-noi").textContent = noi.ten;
    for (const r of el.querySelectorAll('input[type="radio"]')) {
      r.name = `noi-${i}`;
      r.addEventListener("change", capNhatHien);
    }
    const ip = el.querySelector(".noi-ip");
    const cong = el.querySelector(".noi-cong");
    const kq = el.querySelector(".thong-bao");
    ip.setAttribute("aria-label", `Địa chỉ IP máy in ${noi.ten}`);
    const may = mayNoiDaLuu[noi.id];
    if (may) {
      ip.value = may.host;
      cong.value = may.port;
    }
    el.querySelector(`input[value="${may ? "lan" : "khong"}"]`).checked = true;
    const k = {
      id: noi.id,
      ten: noi.ten,
      lan: el.querySelector(".noi-lan"),
      chon: () => el.querySelector(`input[name="noi-${i}"]:checked`)?.value,
      may: () => ({ kieu: "lan", host: ip.value.trim(), port: Number(cong.value || 9100) }),
    };
    khoiNoi.push(k);
    el.querySelector(".noi-do").addEventListener("click", (e) => doMayIn(e.currentTarget, ip, kq));
    el.querySelector(".noi-thu").addEventListener("click", (e) => inThuNut(e.currentTarget, { noi: noi.id, ten: noi.ten }, kq));
    vung.append(el);
  });
}

// ── Máy in USB (P33): danh sách từ main.mjs đã ẩn máy in ảo, máy đang kết nối lên đầu ──
let dsUsb = [];
let huongDanCongUsb = null;

/** Một máy USB đang kết nối duy nhất → chọn sẵn (khi chưa lưu máy USB nào). */
const motMayKetNoi = () => {
  const co = dsUsb.filter((d) => d.ketNoi === true);
  return co.length === 1 ? co[0].ten : null;
};

function veDsUsb(ds, chonTen) {
  dsUsb = ds.map((d) => (typeof d === "string" ? { ten: d, nhan: d, ketNoi: null } : d));
  const sel = $("quay-ten");
  const tuy = (value, chu) => Object.assign(document.createElement("option"), { value, textContent: chu });
  sel.replaceChildren(...(dsUsb.length ? dsUsb.map((d) => tuy(d.ten, d.nhan)) : [tuy("", "(Không thấy máy in USB)")]));
  if (chonTen && dsUsb.some((d) => d.ten === chonTen)) sel.value = chonTen;
  capNhatCanhUsb();
}

function capNhatCanhUsb() {
  const o = $("usb-canh");
  const d = dsUsb.find((x) => x.ten === $("quay-ten").value);
  const phan = !dsUsb.length
    ? ["Cắm dây USB và bật nguồn máy in rồi bấm Tải lại. Vẫn không thấy thì cần cài driver máy in (Xprinter, Epson…) cho Windows."]
    : d?.ketNoi === false
      ? ["Máy in này đang chưa kết nối — kiểm tra dây USB và nguồn máy in."]
      : [];
  if (phan.length && huongDanCongUsb) {
    const a = Object.assign(document.createElement("a"), { href: huongDanCongUsb, target: "_blank", rel: "noopener" });
    a.textContent = "Đã cắm mà vẫn không in được? Xem hướng dẫn";
    phan.push(" ", a);
  }
  o.replaceChildren(...phan);
  o.classList.toggle("an", !phan.length);
}

$("quay-ten").addEventListener("change", capNhatCanhUsb);

$("tai-lai-usb").addEventListener("click", async () => {
  const b = $("tai-lai-usb");
  const dangChon = $("quay-ten").value;
  b.disabled = true;
  b.textContent = "Đang tải…";
  try {
    veDsUsb(await window.techmenu.dsMayInUsb(), dangChon);
    if (!dangChon) {
      const mot = motMayKetNoi();
      if (mot) veDsUsb(dsUsb, mot);
    }
  } finally {
    b.disabled = false;
    b.textContent = "Tải lại";
  }
});

/** Cấu hình nháp trên màn — main.mjs kiểm lại từng trường trước khi dùng. */
function nhap() {
  const bep = chon("bep") === "lan" ? { kieu: "lan", host: $("bep-ip").value.trim(), port: Number($("bep-cong").value || 9100) } : null;
  const q = chon("quay");
  const quay =
    q === "usb" && $("quay-ten").value
      ? { kieu: "usb", ten: $("quay-ten").value }
      : q === "lan"
        ? { kieu: "lan", host: $("quay-ip").value.trim(), port: Number($("quay-cong").value || 9100) }
        : null;
  // Bếp/bar không hiện được (mất mạng) giữ máy đã lưu; nơi đang hiện lấy theo màn.
  const noi = Array.isArray(dsNoi) ? {} : { ...mayNoiDaLuu };
  for (const k of khoiNoi) if (k.chon() === "lan") noi[k.id] = k.may();
  return {
    bep,
    quay,
    kho: chon("kho") === "58" ? "58" : "80",
    giuSang: $("giu-sang").checked,
    noi,
    lienHoaDon: Number($("lien-hoa-don").value) || 1,
  };
}

async function napLai() {
  const d = await window.techmenu.docMayIn();
  if (!d) {
    await window.techmenu.moManHinh();
    return;
  }
  $("quan").textContent = `Quán: ${d.tenantName}${lanDau ? " — cài máy in rồi bấm Lưu. Làm lại được bất cứ lúc nào ở ☰ Menu → Cài đặt máy in." : ""}`;
  const { bep, quay, kho } = d.mayIn;
  huongDanCongUsb = d.huongDanCongUsb ?? null;
  veDsUsb(d.usb, null);
  veDsUsb(dsUsb, quay?.kieu === "usb" ? quay.ten : motMayKetNoi());
  // App Android (P24): không có máy in USB của Windows; có ô "Giữ màn hình sáng". App Windows không gửi `nenTang`.
  const android = d.nenTang === "android";
  laAndroid = android;
  dsNoi = d.noi;
  mayNoiDaLuu = d.mayIn.noi ?? {};
  $("lien-hoa-don").value = String(d.mayIn.lienHoaDon ?? 1);
  veNoi();
  $("chon-usb").classList.toggle("an", android);
  $("khoi-giu-sang").classList.toggle("an", !android);
  $("giu-sang").checked = Boolean(d.mayIn.giuSang);
  dat("bep", bep ? "lan" : lanDau ? "lan" : "khong");
  if (bep) {
    $("bep-ip").value = bep.host;
    $("bep-cong").value = bep.port;
  }
  dat("quay", quay ? quay.kieu : lanDau ? (android ? "lan" : "usb") : "khong");
  if (quay?.kieu === "lan") {
    $("quay-ip").value = quay.host;
    $("quay-cong").value = quay.port;
  }
  dat("kho", kho);
  capNhatHien();
}

for (const o of document.querySelectorAll('input[type="radio"]')) o.addEventListener("change", capNhatHien);

/** "Dò máy in": quét LAN, gợi ý IP vào mọi ô IP; tìm thấy đúng một máy thì điền luôn vào ô của nút vừa bấm. */
async function doMayIn(b, oIp, vung) {
  const chu = b.textContent;
  b.disabled = true;
  b.textContent = "Đang dò… (tới 1 phút)";
  try {
    const ds = await window.techmenu.doMayInLan();
    $("ds-ip").replaceChildren(...ds.map((ip) => Object.assign(document.createElement("option"), { value: ip })));
    if (ds.length === 1) oIp.value = ds[0];
    hien(
      vung,
      ds.length ? `Tìm thấy: ${ds.join(", ")}` : "Không tìm thấy máy in mạng nào. Kiểm tra máy in đã cắm dây vào cùng router và bật nguồn.",
      ds.length > 0
    );
  } finally {
    b.disabled = false;
    b.textContent = chu;
  }
}

async function inThuNut(b, vai, vung) {
  b.disabled = true;
  hien(vung, "Đang gửi tờ in thử…", true);
  try {
    const kq = await window.techmenu.inThu(nhap(), vai);
    hien(vung, kq.ok ? "Đã gửi — kiểm tra giấy ra ở máy in." : `In thử không được: ${kq.thongDiep || "lỗi không rõ"}`, kq.ok);
  } finally {
    b.disabled = false;
  }
}

for (const b of document.querySelectorAll("[data-do]")) {
  b.addEventListener("click", () =>
    doMayIn(b, $(b.dataset.do), b.dataset.do.startsWith("bep") ? $("kq-bep") : $("kq-quay"))
  );
}

for (const b of document.querySelectorAll("[data-in-thu]")) {
  b.addEventListener("click", () => {
    const vai = b.dataset.inThu;
    // Quán nhiều bếp/bar: tờ in thử của Bếp chính ghi tên để phân biệt với máy các nơi khác.
    const v = vai === "bep" && Array.isArray(dsNoi) && dsNoi.length > 1 ? { noi: "", ten: dsNoi[0].ten } : vai;
    return inThuNut(b, v, vai === "bep" ? $("kq-bep") : $("kq-quay"));
  });
}

$("luu").addEventListener("click", async () => {
  const n = nhap();
  if (chon("bep") === "lan" && !n.bep?.host) return hien($("kq-luu"), "Nhập địa chỉ IP máy in bếp (hoặc chọn Không có).", false);
  if (chon("quay") === "lan" && !n.quay?.host) return hien($("kq-luu"), "Nhập địa chỉ IP máy in quầy.", false);
  if (chon("quay") === "usb" && !n.quay) return hien($("kq-luu"), "Chọn máy in quầy trong danh sách.", false);
  const thieu = khoiNoi.find((k) => k.chon() === "lan" && !k.may().host);
  if (thieu) return hien($("kq-luu"), `Nhập địa chỉ IP máy in ${thieu.ten} (hoặc chọn Không có).`, false);
  $("luu").disabled = true;
  try {
    const kq = await window.techmenu.luuMayIn(n);
    if (!kq.ok) return hien($("kq-luu"), "Không lưu được — thử lại.", false);
    await window.techmenu.moManHinh();
  } finally {
    $("luu").disabled = false;
  }
});

$("bo-qua").addEventListener("click", () => window.techmenu.moManHinh());

napLai();
