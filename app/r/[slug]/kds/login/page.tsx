import { StationLoginForm } from "@/components/staff/StationLoginForm";

export default async function KdsLoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug } = await params;
  const { error } = await searchParams;
  return <StationLoginForm slug={slug} surface="kds" error={error} />;
}
