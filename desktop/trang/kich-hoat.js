// Màn Đăng nhập (DESK-01, QD-028). Mật khẩu chủ quán / quản lý chỉ sống trong biến của trang này tới khi kích hoạt xong — app không lưu.
const $ = (id) => document.getElementById(id);
const form = $("form");
const chon = $("chon");

function baoLoi(o, chu) {
  o.textContent = chu;
  o.classList.toggle("an", !chu);
}

function coMayIn() {
  return document.querySelector('input[name="co-may-in"]:checked')?.value === "co";
}

async function gui(tenantId, nhieuChiNhanh) {
  const vao = {
    email: $("email").value.trim(),
    password: $("mat-khau").value,
    coMayIn: coMayIn(),
    tenantId,
    nhieuChiNhanh,
  };
  return window.techmenu.kichHoat(vao);
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  baoLoi($("loi"), "");
  if (!$("email").value.trim() || !$("mat-khau").value) {
    baoLoi($("loi"), "Nhập email và mật khẩu.");
    return;
  }
  const nut = $("nut");
  nut.disabled = true;
  nut.textContent = "Đang đăng nhập…";
  try {
    const kq = await gui(undefined, false);
    if (kq.loi) baoLoi($("loi"), kq.loi);
    else if (kq.chonChiNhanh) hienChiNhanh(kq.chonChiNhanh);
  } catch {
    baoLoi($("loi"), "Có lỗi — thử lại.");
  } finally {
    nut.disabled = false;
    nut.textContent = "Đăng nhập";
  }
});

function hienChiNhanh(ds) {
  form.classList.add("an");
  chon.classList.remove("an");
  const hop = $("ds");
  hop.replaceChildren();
  for (const cn of ds) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = cn.name;
    b.addEventListener("click", async () => {
      for (const x of hop.querySelectorAll("button")) x.disabled = true;
      baoLoi($("loi-chon"), "");
      try {
        const kq = await gui(cn.id, true);
        if (kq.loi) baoLoi($("loi-chon"), kq.loi);
      } catch {
        baoLoi($("loi-chon"), "Có lỗi — thử lại.");
      } finally {
        for (const x of hop.querySelectorAll("button")) x.disabled = false;
      }
    });
    hop.append(b);
  }
  hop.querySelector("button")?.focus();
}

$("quay-lai").addEventListener("click", () => {
  chon.classList.add("an");
  form.classList.remove("an");
  $("mat-khau").focus();
});
