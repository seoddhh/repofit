import { AgentWorkspace } from '@/features/agent-review/agent-workspace';
import { ProjectWorkspace } from '@/features/repositories/project-workspace';
export default async function Page({ searchParams }: { searchParams: Promise<{ candidate?: string; review?: string; mode?: string; task?: string }> }) {
  const params = await searchParams;
  if (params.mode === 'agent' || params.task) return <AgentWorkspace key={`project-${params.candidate ?? ''}-${params.task ?? ''}`} purpose="project" initialCandidate={params.candidate ?? ''} initialTaskId={params.task ?? ''}/>;
  return <ProjectWorkspace key={`${params.candidate ?? ''}-${params.review ?? ''}`} initialCandidate={params.candidate ?? ''} reviewId={params.review ?? ''}/>;
}
