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
}

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
  return { bep, quay, kho: chon("kho") === "58" ? "58" : "80", giuSang: $("giu-sang").checked };
}

async function napLai() {
  const d = await window.techmenu.docMayIn();
  if (!d) {
    await window.techmenu.moManHinh();
    return;
  }
  $("quan").textContent = `Quán: ${d.tenantName}${lanDau ? " — cài máy in rồi bấm Lưu. Làm lại được bất cứ lúc nào ở ☰ Menu → Cài đặt máy in." : ""}`;
  const sel = $("quay-ten");
  sel.replaceChildren(
    ...(d.usb.length ? d.usb : ["(Không thấy máy in nào trên Windows)"]).map((ten) => {
      const o = document.createElement("option");
      o.value = d.usb.length ? ten : "";
      o.textContent = ten;
      return o;
    })
  );
  const { bep, quay, kho } = d.mayIn;
  // App Android (P24): không có máy in USB của Windows; có ô "Giữ màn hình sáng". App Windows không gửi `nenTang`.
  const android = d.nenTang === "android";
  $("chon-usb").classList.toggle("an", android);
  $("khoi-giu-sang").classList.toggle("an", !android);
  $("giu-sang").checked = Boolean(d.mayIn.giuSang);
  dat("bep", bep ? "lan" : lanDau ? "lan" : "khong");
  if (bep) {
    $("bep-ip").value = bep.host;
    $("bep-cong").value = bep.port;
  }
  dat("quay", quay ? quay.kieu : lanDau ? (android ? "lan" : "usb") : "khong");
  if (quay?.kieu === "usb") sel.value = quay.ten;
  if (quay?.kieu === "lan") {
    $("quay-ip").value = quay.host;
    $("quay-cong").value = quay.port;
  }
  dat("kho", kho);
  capNhatHien();
}

for (const o of document.querySelectorAll('input[type="radio"]')) o.addEventListener("change", capNhatHien);

for (const b of document.querySelectorAll("[data-do]")) {
  b.addEventListener("click", async () => {
    const chu = b.textContent;
    b.disabled = true;
    b.textContent = "Đang dò… (tới 1 phút)";
    const vung = b.dataset.do.startsWith("bep") ? $("kq-bep") : $("kq-quay");
    try {
      const ds = await window.techmenu.doMayInLan();
      $("ds-ip").replaceChildren(...ds.map((ip) => Object.assign(document.createElement("option"), { value: ip })));
      if (ds.length === 1) $(b.dataset.do).value = ds[0];
      hien(
        vung,
        ds.length ? `Tìm thấy: ${ds.join(", ")}` : "Không tìm thấy máy in mạng nào. Kiểm tra máy in đã cắm dây vào cùng router và bật nguồn.",
        ds.length > 0
      );
    } finally {
      b.disabled = false;
      b.textContent = chu;
    }
  });
}

for (const b of document.querySelectorAll("[data-in-thu]")) {
  b.addEventListener("click", async () => {
    const vai = b.dataset.inThu;
    const vung = vai === "bep" ? $("kq-bep") : $("kq-quay");
    b.disabled = true;
    hien(vung, "Đang gửi tờ in thử…", true);
    try {
      const kq = await window.techmenu.inThu(nhap(), vai);
      hien(vung, kq.ok ? "Đã gửi — kiểm tra giấy ra ở máy in." : `In thử không được: ${kq.thongDiep || "lỗi không rõ"}`, kq.ok);
    } finally {
      b.disabled = false;
    }
  });
}

$("luu").addEventListener("click", async () => {
  const n = nhap();
  if (chon("bep") === "lan" && !n.bep?.host) return hien($("kq-luu"), "Nhập địa chỉ IP máy in bếp (hoặc chọn Không có).", false);
  if (chon("quay") === "lan" && !n.quay?.host) return hien($("kq-luu"), "Nhập địa chỉ IP máy in quầy.", false);
  if (chon("quay") === "usb" && !n.quay) return hien($("kq-luu"), "Chọn máy in quầy trong danh sách.", false);
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
