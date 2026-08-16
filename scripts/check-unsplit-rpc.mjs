// scripts/check-unsplit-rpc.mjs — Kiểm RPC `unsplit_bill_evenly` (0031/0032) trên DB THẬT.
//
// VÌ SAO KHÔNG PHẢI UNIT TEST: luật "con đã thu thì không gỡ" đã dời hẳn xuống SQL, và thứ nó sinh
// ra để làm — CHẶN lượt thu tiền chen ngang bằng khóa hàng — chỉ quan sát được với HAI KẾT NỐI
// đồng thời. Một session đơn lẻ không bao giờ tự thấy mình bị khóa. Vitest + supabase-js cũng
// không giữ được transaction mở, nên phải nói chuyện thẳng với Postgres bằng `pg`.
//
//   npm run check:unsplit
//
// AN TOÀN — đọc kỹ trước khi sửa:
//  - Script TỰ TẠO một tenant thử nghiệm slug `zz-check-unsplit-<ngẫu nhiên>` và chỉ ghi trong
//    phạm vi tenant đó. KHÔNG đụng một dòng nào của nhà hàng thật.
//  - Dọn ở `finally`: xóa đúng tenant vừa tạo (bills/payments cascade theo tenant_id — 0012), rồi
//    ĐẾM LẠI để chứng minh không còn dòng nào. Hỏng giữa chừng vẫn dọn.
//  - Mọi câu lệnh đều kèm `tenant_id = $tenant` tường minh, kể cả khi chạy bằng quyền bỏ qua RLS.
import pg from "pg";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";

config({ path: ".env.local" });

const raw = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
if (!raw) {
  console.error("Thiếu POSTGRES_URL_NON_POOLING trong .env.local");
  process.exit(1);
}
// Supabase pooler đặt sslmode trong URL; `pg` cần cấu hình ssl rời để bỏ qua chuỗi CA nội bộ.
const connectionString = raw.replace(/[?&]sslmode=[^&]*/g, "");

const SLUG = `zz-check-unsplit-${randomUUID().slice(0, 8)}`;
const LOCK_TIMEOUT = "1500ms";

let passed = 0;
const failures = [];

function check(name, ok, detail = "") {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const A = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
const B = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });

let tenantId = null;

/** Vỏ chia đều + N con 'open'. Trả { shell, children }. */
async function makeSplitShell(n, total = 300000) {
  const share = Math.floor(total / n);
  const { rows: shellRows } = await A.query(
    `insert into public.bills (tenant_id, status, split_count, subtotal, total)
     values ($1, 'open', $2, $3, $3) returning id`,
    [tenantId, n, total]
  );
  const shell = shellRows[0].id;
  const children = [];
  for (let i = 0; i < n; i++) {
    const { rows } = await A.query(
      `insert into public.bills (tenant_id, status, split_parent_id, subtotal, total)
       values ($1, 'open', $2, $3, $3) returning id`,
      [tenantId, shell, share]
    );
    children.push(rows[0].id);
  }
  return { shell, children };
}

async function unsplit(client, shell) {
  const { rows } = await client.query(`select public.unsplit_bill_evenly($1, $2, null) as r`, [tenantId, shell]);
  return rows[0].r;
}

async function billStatus(id) {
  const { rows } = await A.query(`select status, split_count from public.bills where id = $1 and tenant_id = $2`, [id, tenantId]);
  return rows[0];
}

// ---- Ca (b): chia → gỡ → chia lại → gỡ LẦN HAI ------------------------------
// Đúng lỗ hổng của 0031: con `void` của lượt gỡ trước vẫn mang `split_parent_id`, bị đếm vào chốt
// "đã thu chưa" ⇒ lượt gỡ thứ hai trả 'has_payment' dù chưa ai thu đồng nào ⇒ bàn khóa cứng.
async function caseSecondUnsplit() {
  console.log("\n[b] Chia đều → gỡ → chia lại → gỡ lần hai");
  const { shell, children } = await makeSplitShell(2);

  const r1 = await unsplit(A, shell);
  check("gỡ lần 1 trả ok", r1?.ok === true && r1?.voided === 2, JSON.stringify(r1));
  check("con lượt 1 thành void", (await billStatus(children[0])).status === "void");
  check("vỏ bỏ cờ split_count", (await billStatus(shell)).split_count === null);

  // Chia lại: y hệt splitBillEvenly (con MỚI trỏ cùng vỏ, con void cũ nằm lại).
  await A.query(`update public.bills set split_count = 2 where id = $1 and tenant_id = $2`, [shell, tenantId]);
  const again = [];
  for (let i = 0; i < 2; i++) {
    const { rows } = await A.query(
      `insert into public.bills (tenant_id, status, split_parent_id, subtotal, total)
       values ($1, 'open', $2, 150000, 150000) returning id`,
      [tenantId, shell]
    );
    again.push(rows[0].id);
  }

  // Chứng minh bài kiểm này KHÔNG rỗng: chạy đúng vị từ của 0031 (không loại 'void') lên cùng dữ
  // liệu — nó phải đếm ra > 0, tức bản cũ sẽ trả 'has_payment' ngay tại đây.
  const { rows: probe } = await A.query(
    `select
       (select count(*) from public.bills c
         where c.tenant_id = $1 and c.split_parent_id = $2
           and (c.status <> 'open'
                or exists (select 1 from public.payments p where p.tenant_id = $1 and p.bill_id = c.id))) as old_0031,
       (select count(*) from public.bills c
         where c.tenant_id = $1 and c.split_parent_id = $2 and c.status <> 'void'
           and (c.status <> 'open'
                or exists (select 1 from public.payments p where p.tenant_id = $1 and p.bill_id = c.id))) as new_0032`,
    [tenantId, shell]
  );
  check("vị từ 0031 (cũ) SẼ chặn — bài kiểm không rỗng", Number(probe[0].old_0031) > 0, JSON.stringify(probe[0]));
  check("vị từ 0032 (mới) không chặn", Number(probe[0].new_0032) === 0, JSON.stringify(probe[0]));

  const r2 = await unsplit(A, shell);
  check("gỡ lần 2 KHÔNG bị con void chặn", r2?.ok === true, JSON.stringify(r2));
  check("gỡ lần 2 void đúng 2 con mới", r2?.voided === 2, JSON.stringify(r2));
  check("con lượt 1 vẫn còn (không bị xóa)", (await billStatus(children[1])).status === "void");
  check("con lượt 2 thành void", (await billStatus(again[0])).status === "void");
}

// ---- Ca (c): con đã thu thì CHẶN ---------------------------------------------
async function caseBlockedByPaidChild() {
  console.log("\n[c] Con đã thu chặn gỡ chia");

  const one = await makeSplitShell(2);
  await A.query(`update public.bills set status = 'paid' where id = $1 and tenant_id = $2`, [one.children[0], tenantId]);
  const r1 = await unsplit(A, one.shell);
  check("con 'paid' → has_payment", r1?.ok === false && r1?.code === "has_payment", JSON.stringify(r1));
  check("con còn lại KHÔNG bị void", (await billStatus(one.children[1])).status === "open");
  check("vỏ giữ nguyên cờ chia", (await billStatus(one.shell)).split_count === 2);

  // Thu chưa đủ: con vẫn 'open' nhưng đã có dòng payments → vẫn phải chặn.
  const two = await makeSplitShell(2);
  await A.query(
    `insert into public.payments (tenant_id, bill_id, method, amount) values ($1, $2, 'cash', 50000)`,
    [tenantId, two.children[0]]
  );
  const r2 = await unsplit(A, two.shell);
  check("con 'open' có payments → has_payment", r2?.ok === false && r2?.code === "has_payment", JSON.stringify(r2));
  check("không con nào bị void", (await billStatus(two.children[0])).status === "open");

  // Con void của lượt trước KHÔNG được coi là "đã thu", nhưng con paid thì có — kiểm lẫn lộn cả hai.
  const three = await makeSplitShell(2);
  await A.query(`update public.bills set status = 'void' where id = $1 and tenant_id = $2`, [three.children[0], tenantId]);
  await A.query(`update public.bills set status = 'paid' where id = $1 and tenant_id = $2`, [three.children[1], tenantId]);
  const r3 = await unsplit(A, three.shell);
  check("void + paid lẫn lộn → vẫn has_payment", r3?.ok === false && r3?.code === "has_payment", JSON.stringify(r3));
}

// ---- Ca (a): gỡ chia ↔ thu tiền ĐỒNG THỜI (2 kết nối) ------------------------
// `insert into payments` phải lấy FOR KEY SHARE trên đúng dòng `bills` được tham chiếu; RPC lấy
// FOR UPDATE. Hai khóa xung đột, nên bên vào sau PHẢI CHỜ — đó là toàn bộ lý do luật này nằm ở SQL.
// Chứng minh bằng `lock_timeout`: bên vào sau nhận lỗi 55P03 thay vì chạy lọt.
async function caseConcurrentRace() {
  console.log("\n[a] Gỡ chia ↔ thu tiền đồng thời (2 kết nối)");

  // A giữ transaction gỡ chia đang mở → B thu tiền phải bị chặn.
  const one = await makeSplitShell(2);
  await A.query("begin");
  const rA = await unsplit(A, one.shell);
  check("A gỡ chia thành công trong transaction", rA?.ok === true, JSON.stringify(rA));

  let blocked = false;
  await B.query("begin");
  await B.query(`set local lock_timeout = '${LOCK_TIMEOUT}'`);
  try {
    await B.query(
      `insert into public.payments (tenant_id, bill_id, method, amount) values ($1, $2, 'cash', 150000)`,
      [tenantId, one.children[0]]
    );
  } catch (e) {
    blocked = e.code === "55P03";
  }
  await B.query("rollback");
  check("B thu tiền bị KHÓA trong lúc A gỡ chia", blocked);

  await A.query("commit");
  check("sau commit: con đã void", (await billStatus(one.children[0])).status === "void");

  // Bên THUA cuộc đua: payBill đã ghi payments rồi mới chốt bill. `.eq(status,'open')` (Important 3)
  // phải trả 0 dòng để con void không bị lật ngược về 'paid' (nếu lật: vào thẳng doanh thu, trong
  // khi vỏ đã về hóa đơn thường và sẽ bị thu TOÀN BỘ lần nữa).
  const { rowCount } = await B.query(
    `update public.bills set status = 'paid', paid_at = now()
      where id = $1 and tenant_id = $2 and status = 'open' returning id`,
    [one.children[0], tenantId]
  );
  check("không lật được con void về 'paid'", rowCount === 0, `rowCount=${rowCount}`);
  check("con vẫn void sau lượt thu thua cuộc", (await billStatus(one.children[0])).status === "void");

  // Chiều ngược lại: B giữ khóa thu tiền trước → A gỡ chia phải CHỜ (không đọc lọt "chưa ai thu").
  const two = await makeSplitShell(2);
  await B.query("begin");
  await B.query(
    `insert into public.payments (tenant_id, bill_id, method, amount) values ($1, $2, 'cash', 150000)`,
    [tenantId, two.children[0]]
  );
  let unsplitBlocked = false;
  await A.query("begin");
  await A.query(`set local lock_timeout = '${LOCK_TIMEOUT}'`);
  try {
    await unsplit(A, two.shell);
  } catch (e) {
    unsplitBlocked = e.code === "55P03";
  }
  await A.query("rollback");
  await B.query("rollback");
  check("A gỡ chia bị KHÓA trong lúc B đang thu", unsplitBlocked);
  check("vỏ giữ nguyên cờ chia sau lượt gỡ bị chặn", (await billStatus(two.shell)).split_count === 2);
}

// ---- Chạy --------------------------------------------------------------------
try {
  await A.connect();
  await B.connect();

  const { rows: dup } = await A.query(`select 1 from public.tenants where slug = $1`, [SLUG]);
  if (dup.length > 0) throw new Error(`Slug thử nghiệm ${SLUG} đã tồn tại — dừng để khỏi đụng dữ liệu lạ.`);

  const { rows } = await A.query(
    `insert into public.tenants (slug, name) values ($1, 'KIỂM THỬ gỡ chia đều (tự xóa)') returning id`,
    [SLUG]
  );
  tenantId = rows[0].id;
  console.log(`Tenant thử nghiệm: ${SLUG}`);

  await caseSecondUnsplit();
  await caseBlockedByPaidChild();
  await caseConcurrentRace();
} catch (e) {
  failures.push(`Lỗi khi chạy: ${e.message}`);
  console.error("Lỗi:", e.message);
} finally {
  // Dọn sạch: xóa tenant thử nghiệm → bills/bill_items/payments cascade theo (0012).
  if (tenantId) {
    try {
      for (const c of [A, B]) {
        try {
          await c.query("rollback");
        } catch {
          /* không có transaction nào đang mở — bình thường */
        }
      }
      await A.query(`delete from public.payments where tenant_id = $1`, [tenantId]);
      await A.query(`delete from public.bills where tenant_id = $1`, [tenantId]);
      await A.query(`delete from public.tenants where id = $1`, [tenantId]);
      const { rows: left } = await A.query(
        `select (select count(*) from public.bills where tenant_id = $1) as bills,
                (select count(*) from public.payments where tenant_id = $1) as payments,
                (select count(*) from public.tenants where id = $1) as tenants`,
        [tenantId]
      );
      const clean = left[0].bills === "0" && left[0].payments === "0" && left[0].tenants === "0";
      console.log(`\nDọn dẹp: bills=${left[0].bills} payments=${left[0].payments} tenants=${left[0].tenants}`);
      if (!clean) failures.push("CÒN SÓT dữ liệu thử nghiệm — phải dọn tay!");
    } catch (e) {
      failures.push(`Dọn dẹp thất bại: ${e.message} (tenant ${SLUG})`);
      console.error("Dọn dẹp thất bại:", e.message);
    }
  }
  await A.end().catch(() => {});
  await B.end().catch(() => {});
}

console.log(`\n${passed} kiểm tra đạt, ${failures.length} hỏng.`);
if (failures.length > 0) {
  for (const f of failures) console.error(` - ${f}`);
  process.exitCode = 1;
}
