import { StationScreen } from "@/components/staff/StationScreen";

export const dynamic = "force-dynamic";

export default async function PosHome({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <StationScreen slug={slug} surface="pos" />;
}
