import { z } from 'zod';
import { repositoryId } from './repository-types';

const text = z.string().trim().min(1).max(2000);
const repository = z.string().max(300).transform(value => repositoryId(value)).refine(value => value !== null, 'GitHub 레포 주소를 확인해 주세요.').transform(value => value!);
const goal = z.string().trim().min(1, '관심 작업이나 검토 목표를 입력해 주세요.').max(1000);
export const taskInputSchema = z.discriminatedUnion('purpose', [
  z.object({
    purpose: z.literal('project'),
    project: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('github'), repository, sha: z.string().regex(/^[a-f0-9]{40}$/i).optional() }).strict(),
      z.object({ kind: z.literal('local'), label: z.string().trim().min(1).max(120) }).strict(),
    ]),
    candidate: repository, goal,
  }).strict(),
  z.object({
    purpose: z.literal('skills'),
    agentProfile: z.object({ name: z.string().trim().min(1).max(100), currentSkills: z.array(z.string().trim().min(1).max(500)).max(30) }).strict(),
    candidate: repository.optional(), goal,
  }).strict(),
]).refine(input => input.purpose !== 'project' || input.project.kind !== 'github' || input.project.repository.toLowerCase() !== input.candidate.toLowerCase(), '프로젝트와 다른 후보 레포를 선택해 주세요.');

const httpsUrl = z.string().max(2000).url().refine(value => {
  const url = new URL(value);
  return url.protocol === 'https:' && !url.username && !url.password;
}, '근거 링크는 자격 증명이 없는 HTTPS 주소여야 합니다.');
export const reviewResultSchema = z.object({
  agent: z.string().trim().min(1).max(100),
  verdict: z.enum(['adopt', 'trial', 'hold', 'skip']),
  summary: text,
  reasons: z.array(text).min(1).max(10),
  benefits: z.array(text).max(10),
  risks: z.array(text).max(10),
  changes: z.array(z.object({ path: z.string().trim().min(1).max(300), proposal: text }).strict()).max(20),
  evidence: z.array(z.object({ label: z.string().trim().min(1).max(200), url: httpsUrl }).strict()).max(20),
  validation: z.array(z.object({ check: text, status: z.enum(['not_run', 'passed', 'failed']), detail: text }).strict()).max(15),
  limitations: z.array(text).min(1).max(10),
  skillFit: z.object({
    recommendations: z.array(z.object({ repository, skill: z.string().trim().min(1).max(200), benefit: text }).strict()).max(10),
    addedCapabilities: z.array(text).max(10), overlaps: z.array(text).max(10),
    conflicts: z.array(text).max(10), integrationSteps: z.array(text).max(10),
  }).strict().optional(),
}).strict();

export type ReviewResult = z.infer<typeof reviewResultSchema>;
export type TaskInput = z.infer<typeof taskInputSchema>;
export type AgentTask = TaskInput & {
  scope: 'review_only';
  id: string; revision: number; status: 'queued' | 'running' | 'completed' | 'failed' | 'canceled';
  createdAt: string; updatedAt: string; message: string; result?: ReviewResult;
};
export const taskKeySchema = z.object({ taskId: z.string().uuid() }).strict();
export const progressSchema = taskKeySchema.extend({ expectedRevision: z.number().int().min(0), status: z.enum(['running', 'failed']), message: z.string().trim().min(1).max(500) }).strict();
export const submissionSchema = taskKeySchema.extend({ expectedRevision: z.number().int().min(0), result: reviewResultSchema }).strict();

export function createAgentTask(input: unknown): AgentTask {
  const parsed = taskInputSchema.parse(input);
  const now = new Date().toISOString();
  return { ...parsed, scope: 'review_only', id: crypto.randomUUID(), revision: 0, status: 'queued', createdAt: now, updatedAt: now, message: '에이전트의 검토 시작을 기다리고 있습니다.' };
}

export function reviseAgentTask(task: AgentTask, expectedRevision: number, update: { status: 'running' | 'failed' | 'canceled'; message: string } | { status: 'completed'; result: ReviewResult }): AgentTask {
  if (task.revision !== expectedRevision) throw new Error('작업이 변경됐습니다. 작업을 다시 읽고 최신 revision으로 요청하세요.');
  if (!['queued', 'running'].includes(task.status)) throw new Error('이미 종료된 작업입니다. 새 검토 요청을 만들어 주세요.');
  if (update.status === 'completed' && task.status !== 'running') throw new Error('검토 시작 상태를 먼저 보고해 주세요.');
  if (update.status === 'completed' && task.purpose === 'skills' && !update.result.skillFit) throw new Error('스킬 검토에는 추천 후보, 추가 기능, 중복·충돌과 추가 방법을 포함한 skillFit이 필요합니다.');
  const next = update.status === 'completed' ? { ...update, result: reviewResultSchema.parse(update.result), message: '에이전트가 검토 결과를 제출했습니다.' } : update;
  return { ...task, ...next, revision: task.revision + 1, updatedAt: new Date().toISOString() };
}

export const verdictLabels = { adopt: '도입 추천', trial: '작게 시도', hold: '추가 확인', skip: '도입 보류' };
export const taskStatusLabels = { queued: '실행 요청 대기', running: '검토 중', completed: '검토 완료', failed: '검토 중단', canceled: '요청 취소' };
export function projectLabel(task: TaskInput) { return task.purpose === 'skills' ? `${task.agentProfile.name} · 스킬 도입` : task.project.kind === 'github' ? task.project.repository : task.project.label; }
export function taskLabel(task: TaskInput) { return task.candidate ?? '나에게 맞는 스킬 찾기'; }
export function taskPath(task: AgentTask) { return task.purpose === 'skills' ? `/agent?task=${task.id}` : `/project?mode=agent&task=${task.id}`; }

export function taskPrompt(task: AgentTask, siteUrl: string) {
  const target = task.purpose === 'skills'
    ? `에이전트: ${task.agentProfile.name}\n현재 스킬 (선택 입력): ${task.agentProfile.currentSkills.length ? task.agentProfile.currentSkills.join('; ') : '미제공 — 기존 스킬 없이 폭넓게 탐색'}\n좋은 오픈소스 스킬을 찾아 추가로 할 수 있는 작업과 활용 예시를 설명하세요. 기존 스킬이 제공된 경우에만 실제 중복과 조합을 비교하세요. 결과에 skillFit을 포함하세요.`
    : `대상: ${projectLabel(task)}${task.project.kind === 'github' && task.project.sha ? ` @ ${task.project.sha}` : ''}\n프로젝트에 오픈소스를 도입할 가치와 변경할 파일을 검토하세요.`;
  return `RepoFit 검토 요청 ${task.id}\n현재 revision: ${task.revision}\n페이지: ${new URL(taskPath(task), siteUrl).href}\n검토 종류: ${task.purpose}\n${target}\n후보: ${task.candidate ? `https://github.com/${task.candidate}` : '지정 없음 — 관심 작업에 맞는 오픈소스 스킬을 탐색'}\n목표: ${task.goal}\n\n$repofit-review 스킬로 검토해 주세요. 이 페이지의 repofit_get_context와 repofit_get_task로 요청을 읽고, repofit_update_progress로 시작을 보고한 뒤 repofit_submit_review로 결과를 표시해 주세요. 검토만 요청하며 코드 수정·설치·실행은 포함하지 않습니다. 도구를 사용할 수 없으면 같은 검토 결과를 스킬의 JSON 형식으로 제공해 주세요. 로컬 자료는 사용자가 허용한 범위에서만 확인하세요.`;
}

export function resultMarkdown(task: AgentTask) {
  const result = task.result;
  if (!result) return taskPrompt(task, 'https://repofit.fizzybean4.chatgpt.site');
  return [`# ${taskLabel(task)} 검토`, `대상: ${projectLabel(task)}`, `목표: ${task.goal}`, `작성: ${result.agent} · 사용자 에이전트가 제출한 결과`, '', `## ${verdictLabels[result.verdict]}`, result.summary,
    '', '## 판단 근거', ...result.reasons.map(value => `- ${value}`), '', '## 기대 효과', ...result.benefits.map(value => `- ${value}`), '', '## 도입 부담', ...result.risks.map(value => `- ${value}`),
    ...(result.skillFit ? ['', '## 추천 스킬', ...result.skillFit.recommendations.map(item => `- ${item.skill} (${item.repository}): ${item.benefit}`), '', '## 추가되는 능력', ...result.skillFit.addedCapabilities.map(item => `- ${item}`), '', '## 기존 스킬과 중복', ...result.skillFit.overlaps.map(item => `- ${item}`), '', '## 충돌과 제약', ...result.skillFit.conflicts.map(item => `- ${item}`), '', '## 스킬 추가 방법', ...result.skillFit.integrationSteps.map(item => `- ${item}`)] : []), '', '## 변경 제안', ...result.changes.map(value => `- ${value.path}: ${value.proposal}`), '', '## 검증 보고', ...result.validation.map(value => `- [${value.status}] ${value.check}: ${value.detail}`),
    '', '## 출처', ...result.evidence.map(value => `- ${value.label}: ${value.url}`), '', '## 확인 범위와 한계', ...result.limitations.map(value => `- ${value}`)].join('\n');
}
