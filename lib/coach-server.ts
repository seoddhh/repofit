import { readSkillCatalog } from './catalog-store';
import { initialNarrative, rankCandidates } from './coach-rules';
import { assessmentLabels, type CoachInput, type CoachBundle, type ActivitySummary } from './coach-types';
import type { LocalInventory } from './local-agent-types';

export async function prepareCoachReport(input: CoachInput, snapshot: LocalInventory | null, activities: ActivitySummary[] = []) {
  const runtime = snapshot?.agents.find(agent => agent.id === input.agent);
  const inventory = runtime?.skills ?? [];
  // Public descriptions are prepared once. A personal report never queries
  // skills.sh or GitHub and never sends the user's goal to those services.
  const catalog = await readSkillCatalog();
  const warnings: string[] = [];
  const inspected = catalog.skills.map(skill => ({ ...skill, sourceEvidence: {
    status: 'verified' as const, kind: 'skills_sh_snapshot' as const,
    description: skill.explanation.summary,
    body: [skill.explanation.summary, ...skill.explanation.capabilities, ...skill.explanation.problems].join('\n'),
    revision: null, path: null, url: skill.url, hash: skill.contentHash, license: null, resources: [],
    checkedAt: skill.checkedAt,
    warning: 'skills.sh 공개 원문과 저장된 설명입니다. 고정 GitHub 커밋 확인이나 실행 호환성 검증은 아닙니다.',
  } }));
  if (input.candidateId && !catalog.skills.some(skill => skill.id === input.candidateId)) warnings.push('선택한 스킬이 현재 상위 300개 목록에 없습니다. 저장된 다른 후보와 목표를 비교했습니다.');
  const candidates = rankCandidates(input, inspected, inventory).slice(0, 6);
  const bundle: CoachBundle = {
    input, observedAt: snapshot?.observedAt ?? null, inventory, inventoryStatus: runtime?.status ?? 'not_connected', candidates,
    evidence: [
      { id: 'goal', kind: 'self_reported', detail: `관심 작업: ${input.work.join(', ')}. 목표: ${input.goal}` },
      ...Object.entries(assessmentLabels).map(([axis, label]) => ({ id: `assessment:${axis}`, kind: 'self_reported' as const, detail: `${label}: ${input.assessment[axis as keyof typeof assessmentLabels]}` })),
      ...(snapshot ? [{ id: 'inventory', kind: 'observed' as const, detail: `${snapshot.observedAt} 목록 ${inventory.length}개. 인식과 실제 사용은 다릅니다.` }] : []),
      ...candidates.filter(c => c.sourceEvidence.status === 'verified').map(c => ({ id: `source:${c.id}`, kind: 'observed' as const, detail: `${c.sourceEvidence.url}, SHA256 ${c.sourceEvidence.hash}` })),
      ...activities.flatMap(a => a.summary.findings.map((f, i) => ({ id: `activity:${a.id}:${i}`, kind: 'inferred' as const, detail: `${f.axis}: ${f.finding} (로컬 Codex가 선택한 사례를 요약한 추정)` }))),
    ],
    warnings: [...new Set([...warnings, ...(runtime?.warnings ?? []), ...activities.flatMap(a => a.summary.limitations), ...(activities.length && activities.length < 5 ? ['선택한 사례가 5개 미만입니다. 반복 패턴 판정은 제한됩니다.'] : []), ...(!snapshot ? ['로컬 에이전트 구성을 확인하지 않았습니다.'] : []), ...(snapshot && Date.now() - Date.parse(snapshot.observedAt) > 150000 ? ['로컬 스킬 목록이 오래됐습니다. 연결 프로그램을 켜고 다시 확인해 주세요.'] : [])])], rulesVersion: '1', activityCount: activities.length,
  };
  return { bundle, narrative: initialNarrative(bundle) };
}
