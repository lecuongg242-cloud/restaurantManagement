export default async function KdsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-2 bg-neutral-950 p-8 text-center text-neutral-100">
      <h1 className="text-2xl font-bold">KDS — Màn hình bếp</h1>
      <p className="opacity-70">
        Tenant: <span className="font-mono">{slug}</span>. Hàng đợi món được xây
        ở P3. (Giao diện tối mặc định cho môi trường bếp)
      </p>
    </main>
  );
}
