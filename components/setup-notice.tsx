/** Hiện khi database chưa áp migration mới nhất (thay vì trang trắng). */
export function MigrationNotice({ migration }: { migration: string }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <h1 className="text-2xl font-bold">Database chưa cập nhật</h1>
      <p className="max-w-md opacity-70">
        Trang này cần migration <code>{migration}</code> đã được áp lên
        database. Chạy <code>supabase login</code>, rồi{" "}
        <code>npx supabase link --project-ref &lt;ref&gt;</code> và{" "}
        <code>npx supabase db push</code>, sau đó tải lại trang.
      </p>
    </main>
  );
}

export function SetupNotice() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <h1 className="text-2xl font-bold">Chưa kết nối Supabase</h1>
      <p className="max-w-md opacity-70">
        Trang này cần cơ sở dữ liệu. Sao chép <code>.env.example</code> thành{" "}
        <code>.env.local</code> và điền key Supabase, sau đó khởi động lại
        server.
      </p>
    </main>
  );
}
