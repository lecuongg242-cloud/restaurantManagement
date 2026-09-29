// Màn mất mạng (DESK-04): tự thử lại mỗi 10 giây, không để trang lỗi của Chromium.
const dich = new URLSearchParams(location.search).get("dich") || "";
let conLai = 10;
const dem = document.getElementById("dem");

function thuLai() {
  window.techmenu.thuLai(dich);
}

setInterval(() => {
  conLai -= 1;
  if (conLai <= 0) {
    conLai = 10;
    thuLai();
  }
  dem.textContent = `Thử lại sau ${conLai} giây…`;
}, 1000);

document.getElementById("thu").addEventListener("click", thuLai);
