import { z } from 'zod';
import { repositoryId } from './repository-types';

const text = z.string().trim().min(1).max(2000);
const repository = z.string().max(300).transform(value => repositoryId(value)).refine(value => value !== null, 'GitHub 레포 주소를 확인해 주세요.').transform(value => value!);
export const taskInputSchema = z.object({
  project: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('github'), repository, sha: z.string().regex(/^[a-f0-9]{40}$/i).optional() }).strict(),
    z.object({ kind: z.literal('local'), label: z.string().trim().min(1).max(120) }).strict(),
  ]),
  candidate: repository,
  goal: z.string().trim().min(1, '검토할 목표를 입력해 주세요.').max(1000),
}).strict().refine(input => input.project.kind !== 'github' || input.project.repository.toLowerCase() !== input.candidate.toLowerCase(), '프로젝트와 다른 후보 레포를 선택해 주세요.');

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
  const next = update.status === 'completed' ? { ...update, result: reviewResultSchema.parse(update.result), message: '에이전트가 검토 결과를 제출했습니다.' } : update;
  return { ...task, ...next, revision: task.revision + 1, updatedAt: new Date().toISOString() };
}

export const verdictLabels = { adopt: '도입 추천', trial: '작게 시도', hold: '추가 확인', skip: '도입 보류' };
export const taskStatusLabels = { queued: '실행 요청 대기', running: '검토 중', completed: '검토 완료', failed: '검토 중단', canceled: '요청 취소' };
export function projectLabel(task: TaskInput) { return task.project.kind === 'github' ? task.project.repository : task.project.label; }

export function taskPrompt(task: AgentTask, siteUrl: string) {
  return `RepoFit 검토 요청 ${task.id}\n현재 revision: ${task.revision}\n페이지: ${new URL('/agent', siteUrl).href}\n대상: ${projectLabel(task)}${task.project.kind === 'github' && task.project.sha ? ` @ ${task.project.sha}` : ''}\n후보: https://github.com/${task.candidate}\n목표: ${task.goal}\n\n$repofit-review 스킬로 검토해 주세요. 이 페이지의 repofit_get_context와 repofit_get_task로 요청을 읽고, repofit_update_progress로 시작을 보고한 뒤 repofit_submit_review로 결과를 표시해 주세요. 검토만 요청하며 코드 수정·설치·실행은 포함하지 않습니다. 도구를 사용할 수 없으면 같은 검토 결과를 스킬의 JSON 형식으로 제공해 주세요. 로컬 프로젝트는 사용자가 허용한 현재 작업 폴더에서만 확인하세요.`;
}

export function resultMarkdown(task: AgentTask) {
  const result = task.result;
  if (!result) return taskPrompt(task, 'https://repofit.fizzybean4.chatgpt.site');
  return [`# ${task.candidate} 검토`, `대상: ${projectLabel(task)}`, `목표: ${task.goal}`, `작성: ${result.agent} · 사용자 에이전트가 제출한 결과`, '', `## ${verdictLabels[result.verdict]}`, result.summary,
    '', '## 판단 근거', ...result.reasons.map(value => `- ${value}`), '', '## 기대 효과', ...result.benefits.map(value => `- ${value}`), '', '## 도입 부담', ...result.risks.map(value => `- ${value}`),
    '', '## 변경 제안', ...result.changes.map(value => `- ${value.path}: ${value.proposal}`), '', '## 검증 보고', ...result.validation.map(value => `- [${value.status}] ${value.check}: ${value.detail}`),
    '', '## 출처', ...result.evidence.map(value => `- ${value.label}: ${value.url}`), '', '## 확인 범위와 한계', ...result.limitations.map(value => `- ${value}`)].join('\n');
}
