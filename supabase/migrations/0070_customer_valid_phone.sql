-- 0070_customer_valid_phone.sql — Danh sách khách chỉ nhận SĐT đúng định dạng (P16 16-05).
--
-- 0069 nhận mọi SĐT không rỗng ⇒ chuỗi thử "0000000" trên qt-food thành một "khách". 16-01 cố ý giữ nguyên chuỗi không
-- phải SĐT trong dữ liệu gốc; ở đây chỉ LỌC khi gom khách — cùng quy tắc với đặt bàn (`^0\d{8,10}$`).

-- Hóa đơn đã trả (không vỏ chia) → SĐT khách + tên + kênh theo quy ước trên. Nội bộ cho hai RPC dưới.
create or replace function public.customer_bills(p_tenants uuid[])
returns table (tenant_id uuid, bill_id uuid, visit_key text, phone text, name text, channel text, total integer, at timestamptz)
language sql
stable
set search_path = public
as $$
  select b.tenant_id, b.id,
         coalesce(b.table_session_id::text, b.split_parent_id::text, b.online_order_id::text, b.id::text),
         c.phone, c.name, c.channel, b.total, b.business_at
  from public.bills_revenue b
  cross join lateral (
    select o.customer_contact ->> 'phone' as phone, nullif(btrim(o.customer_contact ->> 'name'), '') as name, o.channel
    from public.orders o
    where o.tenant_id = b.tenant_id
      and (o.customer_contact ->> 'phone') ~ '^0\d{8,10}$'
      and (
        o.id = b.online_order_id
        or (b.table_session_id is not null and o.table_session_id = b.table_session_id)
        or o.id in (
          select oi.order_id from public.bill_items bi join public.order_items oi on oi.id = bi.order_item_id
          where bi.bill_id in (b.id, b.split_parent_id)
        )
      )
    order by (o.id = b.online_order_id) desc, o.created_at
    limit 1
  ) c
  where b.tenant_id = any (p_tenants) and b.status = 'paid' and b.split_count is null
$$;
revoke execute on function public.customer_bills(uuid[]) from public, anon, authenticated;
