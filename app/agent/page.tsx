import { AgentWorkspace } from '@/features/agent-review/agent-workspace';
import { AgentCoach } from '@/features/coach/agent-coach';
import { UsageAnalysis } from '@/features/usage/usage-analysis';

export default async function Page({ searchParams }: { searchParams: Promise<{ candidate?: string; task?: string; skill?: string; mode?: string; run?: string }> }) {
  const params = await searchParams;
  if (params.task) return <AgentWorkspace key={params.task} initialCandidate={params.candidate ?? ''} initialTaskId={params.task}/>;
  if (params.mode === 'questionnaire') return <AgentCoach key={params.skill ?? ''} initialSkill={params.skill}/>;
  return <UsageAnalysis initialRun={params.run}/>;
}
