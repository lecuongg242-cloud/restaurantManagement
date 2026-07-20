export default async function AdminPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
      <h1 className="text-2xl font-bold">Quản trị nhà hàng</h1>
      <p className="opacity-70">
        Tenant: <span className="font-mono">{slug}</span> — dành cho owner /
        manager. (Hoàn thiện ở plan 01-03)
      </p>
    </main>
  );
}
