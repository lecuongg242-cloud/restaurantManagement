export default async function CustomerPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
      <h1 className="text-2xl font-bold">Trang khách</h1>
      <p className="opacity-70">
        Nhà hàng: <span className="font-mono">{slug}</span>. Menu và gọi món QR
        được xây ở P2–P3. (Mobile-first)
      </p>
    </main>
  );
}
