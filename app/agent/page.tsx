import { AgentWorkspace } from '@/components/agent-workspace';
import { AgentCoach } from '@/components/agent-coach';

export default async function Page({ searchParams }: { searchParams: Promise<{ candidate?: string; task?: string; skill?: string }> }) {
  const params = await searchParams;
  if (params.task) return <AgentWorkspace key={params.task} initialCandidate={params.candidate ?? ''} initialTaskId={params.task}/>;
  return <AgentCoach key={params.skill ?? ''} initialSkill={params.skill}/>;
}
