import { readFile } from 'node:fs/promises';
import { runStructured } from './coach.mjs';
import { recentUsageHistory } from './history.mjs';

const skillUrl = new URL('../../public/skills/repofit-usage-analysis/SKILL.md', import.meta.url);
const analysisSchema = new URL('../../public/skills/repofit-usage-analysis/analysis.schema.json', import.meta.url);
const reportSchema = new URL('../../public/skills/repofit-usage-analysis/report.schema.json', import.meta.url);

export function validateUsageSources(analysis, history) {
  const samples = new Map(history.cases.flatMap(c => c.samples.map(s => [s.id, s])));
  const ids = new Set(samples.keys());
  if (!Array.isArray(analysis.patterns) || !analysis.patterns.length || analysis.patterns.length > 8 || new Set(analysis.patterns.map(p => p.id)).size !== analysis.patterns.length || analysis.patterns.some(p => !Array.isArray(p.sourceIds) || !p.sourceIds.length || p.sourceIds.some(id => !ids.has(id)))) throw new Error('사용 방식 분석이 읽지 않은 대화 항목을 참조했습니다.');
  if (analysis.rubricVersion !== 'workflow-evidence-v1' || analysis.patterns.length > 5 || analysis.patterns.some(p => !p.assessment || !Array.isArray(p.assessment.evidence) || !p.assessment.evidence.length || p.assessment.evidence.length > 3)) throw new Error('판단 기준과 대표 근거가 필요합니다.');
  for (const p of analysis.patterns) {
    const evidence = p.assessment.evidence;
    if (new Set(evidence.map(e => e.sourceId)).size !== evidence.length || evidence.some(e => !p.sourceIds.includes(e.sourceId) || !ids.has(e.sourceId))) throw new Error('대표 근거가 해당 관찰의 원본 항목과 일치하지 않습니다.');
    if (evidence.some(e => e.kind !== samples.get(e.sourceId).type)) throw new Error('대표 근거의 사용자·에이전트·실행 항목 구분이 원본과 다릅니다.');
  }
  return analysis;
}
export async function runUsageJob({ job, workspace, inventory, signal, mcp, executable = 'codex', readHistory = recentUsageHistory, generate = runStructured }) {
  let history;
  try { history = await readHistory(workspace, signal, executable); }
  catch (error) { error.usageReason = 'history_unavailable'; throw error; }
  if (!history.coverage.threadsRead || !history.coverage.itemsRead) {
    const error = new Error('분석할 최근 대화를 찾지 못했습니다.'); error.usageReason = 'no_history'; throw error;
  }
  signal?.throwIfAborted();
  const instructions = await readFile(skillUrl, 'utf8');
  const skills = (inventory.agents.find(a => a.id === 'codex')?.skills ?? []).map(({ name, description, status, scope }) => ({ name, description, status, scope }));
  const analysis = validateUsageSources(await generate({
    instructions: `${instructions}\n\n실행 단계: usage_analysis. 제공된 최근 대화 사례에서 활용 방식을 분석하세요. 명령이나 외부 도구를 실행하지 마세요. rubricVersion은 workflow-evidence-v1입니다. 주요 판단 최대 5개에만 assessment를 작성하고, 각각 대표 evidence 1~3개의 sourceId와 원본 type과 같은 kind, 짧은 요약을 연결하세요. 모든 항목에 주석을 달거나 전체 원문을 재작성하지 마세요. sourceIds는 cases.samples에 있는 ID만 사용하세요. 사용자 요청과 에이전트의 자발적 행동을 구분하고, 두 개 이상 사례에서 관찰했을 때만 반복 패턴이라고 설명하세요. 확인되지 않은 원인과 영향은 미확인으로 표시하세요. query는 필요한 기능을 찾을 일반 검색어 1~3개로 작성하세요. 대화 제목, 사람 이름, 프로젝트 경로, 원문 인용, 인증값을 결과에 넣지 말고 근거를 요약하세요. 설문 답변을 만들지 마세요. analysis.schema.json 형식의 JSON만 반환하세요.`,
    schemaUrl: analysisSchema, data: { goal: job.goal, inventory: skills, ...history },
  }, workspace, signal, executable), history);
  signal?.throwIfAborted();
  // Only this summary and coverage cross the Site boundary. Raw cases never do.
  const prepared = await mcp('update_usage_analysis', { action: 'prepare', id: job.id, lease: job.lease, analysis, coverage: history.coverage });
  if (!prepared.active) throw new Error('활용 분석 요청이 종료됐습니다.');
  // The site retains evidence for the report. Recommendations only need the
  // already-validated judgments, not another copy of item-level annotations.
  const recommendationAnalysis = { ...analysis, patterns: analysis.patterns.map(({ sourceIds: _ids, assessment: { evidence: _evidence, ...judgment }, ...pattern }) => ({ ...pattern, assessment: judgment })) };
  const report = await generate({
    instructions: `${instructions}\n\n실행 단계: skill_recommendations. 전달된 analysis와 candidates만 사용해 report.schema.json 형식으로 작성하세요. patternIds는 analysis.patterns에 있는 ID만 인용하세요. assessment의 insufficient_evidence와 not_applicable은 스킬 추천 근거로 쓰지 말고 필요한 추가 확인을 안내하세요. 원인 추정을 확정 사실로 바꾸지 마세요. catalogSkillId는 candidates에 있는 ID만 사용하세요. 사용자가 선택한 후보가 있으면 그 후보의 적합성을 우선 판단하세요. 인기도나 분야 일치만으로 추천하지 마세요. 추천할 후보가 없으면 recommendations는 빈 배열로 두고 unmetNeeds에 설명하세요. 호환성 미확인, 설치와 실제 사용의 차이, 기대 효과의 불확실성을 표시하세요. 추가 스킬이 필요 없으면 기존 스킬 활용과 요청 방법을 제안하세요. 외부 도구 없이 JSON만 반환하세요.`,
    schemaUrl: reportSchema, data: { goal: job.goal, selectedSkillIds: job.selectedSkillIds, analysis: recommendationAnalysis, coverage: history.coverage, inventory: skills, candidates: prepared.candidates },
  }, workspace, signal, executable);
  signal?.throwIfAborted();
  const completed = await mcp('update_usage_analysis', { action: 'complete', id: job.id, lease: job.lease, report });
  if (!completed.active) throw new Error('분석 요청이 취소되었거나 연결이 끊겼습니다.');
  return completed;
}
