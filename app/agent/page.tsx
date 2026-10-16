import { AgentWorkspace } from '@/components/agent-workspace';

export default async function Page({ searchParams }: { searchParams: Promise<{ candidate?: string; task?: string }> }) {
  const params = await searchParams;
  return <AgentWorkspace key={`${params.candidate ?? ''}-${params.task ?? ''}`} initialCandidate={params.candidate ?? ''} initialTaskId={params.task ?? ''}/>;
}
