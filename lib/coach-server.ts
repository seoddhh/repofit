import { searchSkills } from './skills-server';
import { inspectSkillSource } from './skill-source';
import { goalNeeds, initialNarrative, rankCandidates, workQueries } from './coach-rules';
import { assessmentLabels, type CoachInput, type CoachBundle, type ActivitySummary } from './coach-types';
import type { LocalInventory } from './local-agent-types';
import type { CatalogSkill } from './skills-types';

export async function prepareCoachReport(input: CoachInput, snapshot: LocalInventory | null, activities: ActivitySummary[] = []) {
  const runtime = snapshot?.agents.find(agent => agent.id === input.agent);
  const inventory = runtime?.skills ?? [];
  // Send topic labels only, never the questionnaire, inventory, or personal goal.
  const queries = [...new Set([...goalNeeds(input.goal).map(need => need.query), ...input.work.map(kind => workQueries[kind]), ...activities.flatMap(a => a.summary.work.map(kind => workQueries[kind]))])].slice(0, 4);
  if (input.candidateId) queries.unshift(input.candidateId.split('/').at(-1)!);
  const searched = await Promise.allSettled(queries.map(query => searchSkills(query)));
  const warnings: string[] = [];
  const found = new Map<string, CatalogSkill>();
  const groups: CatalogSkill[][] = [];
  for (const result of searched) {
    if (result.status === 'rejected') { warnings.push('일부 관심 작업의 skills.sh 검색에 실패했습니다. 후보가 누락될 수 있습니다.'); continue; }
    if (result.value.stale) warnings.push('일부 후보는 이전 skills.sh 검색 결과입니다.');
    groups.push(result.value.skills.slice(0, 4));
    const requested = result.value.skills.find(item => item.id === input.candidateId);
    if (requested) found.set(requested.id, requested);
  }
  for (let index = 0; index < 4; index++) for (const group of groups) if (group[index]) found.set(group[index].id, group[index]);
  if (input.candidateId && !found.has(input.candidateId)) warnings.push('선택한 카탈로그 후보를 현재 검색 응답에서 찾지 못했습니다. 다른 작업 후보를 함께 살펴봤습니다.');
  const selected = [...found.values()].sort((a, b) => Number(b.id === input.candidateId) - Number(a.id === input.candidateId)).slice(0, 6);
  const inspected = await Promise.all(selected.map(async skill => ({ ...skill, sourceEvidence: await inspectSkillSource(skill) })));
  const candidates = rankCandidates(input, inspected, inventory);
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
