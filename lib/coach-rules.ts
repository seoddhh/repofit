import { assessmentLabels, workLabels, type CoachInput, type CoachCandidate, type CoachBundle, type CoachNarrative } from './coach-types';
import type { LocalSkill } from './local-agent-types';

export const workQueries = { coding: 'coding', debugging: 'debugging', review: 'code review', documents: 'documentation', design: 'design', research: 'research' };
export const goalNeeds = (goal: string) => ([
  { pattern: /테스트|검증|\b(test|testing|validation)\b/i, kind: 'debugging' as const, query: 'testing' },
  { pattern: /리뷰|보안|\b(review|security)\b/i, kind: 'review' as const, query: 'code review' },
  { pattern: /문서|보고서|\b(pdf|docx|document)\b/i, kind: 'documents' as const, query: 'documentation' },
  { pattern: /디자인|접근성|\b(design|accessibility|figma)\b/i, kind: 'design' as const, query: 'design' },
  { pattern: /출처|조사|\b(research|citation)\b/i, kind: 'research' as const, query: 'research' },
]).filter(need => need.pattern.test(goal));
const vocabulary = {
  coding: ['code', 'coding', 'programming', 'typescript', 'react', '코드', '개발'],
  debugging: ['debug', 'debugging', 'test', 'testing', 'error', '디버깅', '테스트'],
  review: ['review', 'quality', 'security', '리뷰', '검토'],
  documents: ['document', 'documentation', 'pdf', 'docx', 'writing', '문서'],
  design: ['design', 'ui', 'ux', 'figma', '디자인'],
  research: ['research', 'search', 'analysis', 'source', '조사', '분석'],
};
const words = (text: string) => new Set(text.toLowerCase().match(/[a-z0-9가-힣]+/g) ?? []);
const normalizeName = (text: string) => text.toLowerCase().split(':').at(-1)?.replace(/[^a-z0-9가-힣]/g, '') ?? '';
export function rankCandidates(input: CoachInput, candidates: Omit<CoachCandidate, 'score' | 'reasons' | 'relation' | 'overlap' | 'matchedWork' | 'compatibility'>[], inventory: LocalSkill[]): CoachCandidate[] {
  const goals = words(input.goal);
  return candidates.map(candidate => {
    const source = candidate.sourceEvidence;
    const verified = source.status === 'verified';
    const text = `${candidate.name} ${source.description} ${source.body.slice(0, 12000)}`.toLowerCase();
    const tokens = words(text);
    const matchedWork = verified ? input.work.filter(kind => vocabulary[kind].some(term => tokens.has(term))) : [];
    const matchedNeeds = verified ? goalNeeds(input.goal).filter(need => vocabulary[need.kind].some(term => tokens.has(term))) : [];
    const goalMatches = [...goals].filter(word => word.length > 2 && tokens.has(word)).length;
    const overlap = inventory.filter(skill => !['disabled', 'shadowed'].includes(skill.status) && normalizeName(skill.name) === normalizeName(candidate.slug)).map(skill => skill.name);
    // Install count deliberately does not participate. Scores are internal relevance signals, not skill quality or proficiency.
    const score = verified ? matchedWork.length * 30 + matchedNeeds.length * 20 + Math.min(goalMatches, 3) * 5 + (input.candidateId === candidate.id && (matchedWork.length || matchedNeeds.length) ? 5 : 0) : 0;
    const reasons = [verified ? '고정 커밋의 SKILL.md 이름과 본문을 확인했습니다.' : '스킬 원본을 확인하지 못해 추천에서 제외했습니다.', ...matchedWork.map(kind => `${workLabels[kind]} 작업 관련 용어가 원본에 있습니다.`), ...matchedNeeds.map(need => `목표에서 언급한 ${workLabels[need.kind]} 관련 필요와 원본의 용어를 비교했습니다.`), ...(overlap.length ? ['같은 이름의 활성 스킬이 있어 기존 스킬 활용을 먼저 제안합니다. 이름 일치만으로 내용 동일성을 확정하지 않습니다.'] : []), '설치 집계는 적합성 점수에 사용하지 않았습니다.'];
    return { ...candidate, score, reasons, relation: !verified ? 'unverified' as const : overlap.length ? 'use_existing' as const : 'add' as const, overlap, matchedWork: [...new Set([...matchedWork, ...matchedNeeds.map(n => n.kind)])], compatibility: 'needs_check' as const };
  }).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

const habitGuides = {
  goal: ['원하는 산출물과 완료 조건을 한 문장씩 추가해 보세요.', '완료할 결과와 확인 기준을 먼저 정리하고 작업해 줘.'],
  context: ['관련 자료와 작업 제약을 함께 전달해 보세요.', '첨부한 자료를 기준으로 작업하고 부족한 문맥은 먼저 확인해 줘.'],
  steps: ['복잡한 작업에서 작은 중간 결과를 확인해 보세요.', '복잡한 부분은 점검 가능한 단계로 진행하고 중간 결과를 보여 줘.'],
  validation: ['작업 성격에 맞는 검증 방법을 요청에 포함해 보세요.', '완료 후 관련 검증이나 출처 확인을 하고, 확인하지 못한 부분을 알려 줘.'],
  reuse: ['반복 작업에 이미 있는 스킬을 먼저 사용해 보세요.', '현재 사용할 수 있는 스킬 중 이 작업에 맞는 것을 골라 적용 이유를 설명해 줘.'],
};
export function initialNarrative(bundle: CoachBundle): CoachNarrative {
  const { input, candidates } = bundle;
  const axes = Object.keys(assessmentLabels) as (keyof typeof assessmentLabels)[];
  const priorities = axes.filter(axis => input.assessment[axis] === 'sometimes');
  const habitAxes = priorities.length ? priorities.slice(0, 2) : ['validation' as const];
  return {
    summary: `${input.work.map(kind => workLabels[kind]).join(', ')} 작업을 중심으로 자기 응답과 확인 가능한 스킬 구성을 살펴봤습니다. ${bundle.activityCount ? `선택한 사례 ${bundle.activityCount}개의 로컬 요약이 포함됐습니다. 사례에 대한 맞춤 해석은 Codex 작성을 요청해 확인하세요.` : '실제 대화 기록을 분석하지 않은 초기 진단입니다.'}`,
    dimensions: axes.map(axis => ({ axis, finding: input.assessment[axis] === 'usually' ? '자기 응답에서 평소 실천하는 습관으로 확인했습니다. 실제 작업 결과는 확인하지 않았습니다.' : input.assessment[axis] === 'sometimes' ? '자기 응답에 따라 더 일관되게 실천할 기회가 있습니다.' : '사용 근거가 없어 판단을 보류합니다.', evidenceIds: [`assessment:${axis}`], confidence: 'low' as const })),
    habits: habitAxes.map(axis => ({ action: habitGuides[axis][0], examplePrompt: habitGuides[axis][1], evidenceIds: [`assessment:${axis}`] })),
    recommendations: candidates.filter(c => c.score > 0 && c.sourceEvidence.status === 'verified').slice(0, 3).map(c => ({
      catalogSkillId: c.id, reason: `${c.matchedWork.map(v => workLabels[v as keyof typeof workLabels]).join(', ')} 관련성이 원본에서 확인된 검토 후보입니다. ${c.overlap.length ? '같은 이름의 기존 스킬부터 활용해 보세요.' : '실행 도구와 환경 호환성은 적용 전에 추가 확인해야 합니다.'}`,
      evidenceIds: ['goal', `source:${c.id}`], prerequisites: ['원본의 필요한 도구 및 계정 및 권한을 확인하세요.', '현재 에이전트에서의 실제 실행 호환성은 아직 확인하지 않았습니다.'],
      steps: [c.overlap.length ? '현재 인식된 같은 이름의 스킬과 원본의 목적 및 내용을 비교하세요.' : `${c.url}에서 설치 안내와 스킬의 모든 지원 파일을 확인하세요.`, `${input.agent === 'codex' ? '~/.agents/skills' : '~/.claude/skills'} 개인 범위를 선택하고 변경 파일을 검토한 뒤 설치하세요.`, `현재 보고서는 ${c.sourceEvidence.revision} 커밋을 확인했습니다. 설치 안내가 최신 브랜치를 사용하면 내용이 달라질 수 있습니다.`, '목록을 새로 조회해 인식을 확인하고 아래 요청으로 작은 작업에 사용하세요.'],
      examplePrompt: `$${c.slug} 스킬을 사용해 ${input.goal.slice(0, 600)}. 필요한 입력을 확인하고, 결과의 확인 방법과 미확인 부분을 알려 줘.`,
      expectedBenefits: ['반복 작업의 절차를 일정하게 만드는 데 도움이 될 수 있습니다. 실제 효과는 실습 후 확인해야 합니다.'],
      exercise: `${input.work.map(v => workLabels[v]).join(', ')} 중 작은 작업 하나에 이 스킬을 명시적으로 요청해 보세요.`, checks: ['원하는 산출물이 나왔는지 확인', '검증 및 출처가 필요한 경우 확인 여부 기록', '효과가 없거나 다시 작업한 이유 기록'],
    })),
    limitations: ['자가 응답은 실제 행동 검증과 다릅니다.', '설치 및 목록 인식 및 사용 요청 및 실제 실행 및 효과는 서로 다른 상태입니다.', '원본 확인은 안전성 감사나 에이전트 실행 호환성 검증이 아닙니다.', '기대 효과는 예상이며 시간 및 비용 절감이나 숙련도 점수를 측정하지 않았습니다.'],
  };
}
