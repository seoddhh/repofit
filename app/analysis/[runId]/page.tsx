import { Analysis } from '@/features/demo/analysis';
export default async function Page({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  return <Analysis runId={runId} />;
}
