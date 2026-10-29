import { z } from 'zod';
import type { CatalogSkill } from './skills-types';
import type { LocalSkill } from './local-agent-types';
import type { SkillExplanation } from './catalog-types';

const sentence = z.string().trim().min(1).max(1600);
export const workKinds = ['coding', 'debugging', 'review', 'documents', 'design', 'research'] as const;
export const workLabels: Record<typeof workKinds[number], string> = { coding: '코드 작성', debugging: '문제 해결', review: '코드 리뷰', documents: '문서와 자료', design: '디자인', research: '조사와 분석' };
export const assessmentLabels = { goal: '원하는 결과와 완료 조건을 설명해요', context: '관련 자료와 제약을 함께 제공해요', steps: '복잡한 작업은 중간 결과를 확인해요', validation: '결과를 테스트하거나 출처를 확인해요', reuse: '반복 작업에 기존 스킬과 도구를 활용해요' };
export const assessmentSchema = z.object({ goal: z.enum(['usually', 'sometimes', 'unknown']), context: z.enum(['usually', 'sometimes', 'unknown']), steps: z.enum(['usually', 'sometimes', 'unknown']), validation: z.enum(['usually', 'sometimes', 'unknown']), reuse: z.enum(['usually', 'sometimes', 'unknown']) }).strict();
export const coachInputSchema = z.object({
  deviceId: z.string().uuid().nullable(), agent: z.enum(['codex', 'claude']),
  work: z.array(z.enum(workKinds)).min(1).max(3).refine(v => new Set(v).size === v.length),
  goal: sentence, assessment: assessmentSchema,
  candidateId: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*\/[a-zA-Z0-9][a-zA-Z0-9._-]*(?:\/[a-zA-Z0-9][a-zA-Z0-9._-]*)?$/).max(600).optional(),
  activityIds: z.array(z.string().uuid()).max(5).default([]),
}).strict();
export type CoachInput = z.infer<typeof coachInputSchema>;
export type SkillSource = {
  status: 'verified' | 'unverified'; description: string; body: string; revision: string | null;
  kind?: 'github_commit' | 'skills_sh_snapshot'; checkedAt?: string;
  path: string | null; url: string | null; hash: string | null; license: string | null;
  resources: string[]; warning: string | null;
};
export type CoachCandidate = CatalogSkill & {
  explanation?: SkillExplanation;
  sourceEvidence: SkillSource; score: number; reasons: string[];
  relation: 'add' | 'use_existing' | 'unverified'; overlap: string[];
  matchedWork: string[]; compatibility: 'needs_check';
};
const recommendationSchema = z.object({
  catalogSkillId: z.string().min(1).max(600), reason: sentence,
  evidenceIds: z.array(z.string().max(100)).min(1).max(10),
  prerequisites: z.array(sentence).min(1).max(6), steps: z.array(sentence).min(1).max(8),
  examplePrompt: sentence, expectedBenefits: z.array(sentence).min(1).max(5),
  exercise: sentence, checks: z.array(sentence).min(1).max(5),
}).strict();
export const coachNarrativeSchema = z.object({
  summary: sentence,
  dimensions: z.array(z.object({ axis: z.enum(['goal', 'context', 'steps', 'validation', 'reuse']), finding: sentence, evidenceIds: z.array(z.string().max(100)).min(1).max(10), confidence: z.enum(['low', 'medium']) }).strict()).length(5),
  habits: z.array(z.object({ action: sentence, examplePrompt: sentence, evidenceIds: z.array(z.string().max(100)).min(1).max(10) }).strict()).min(1).max(3),
  recommendations: z.array(recommendationSchema).max(3), limitations: z.array(sentence).min(1).max(10),
}).strict();
export type CoachNarrative = z.infer<typeof coachNarrativeSchema>;
export const activitySummarySchema = z.object({
  work: z.array(z.enum(workKinds)).min(1).max(3),
  findings: z.array(z.object({ axis: z.enum(['goal', 'context', 'steps', 'validation', 'reuse']), finding: sentence, sourceIds: z.array(z.string().regex(/^item-[0-9]+$/)).min(1).max(10) }).strict()).max(5),
  limitations: z.array(sentence).min(1).max(8),
}).strict();
export type ActivitySummary = { id: string; deviceId: string; createdAt: string; expiresAt: string; summary: z.infer<typeof activitySummarySchema> };
export type CoachEvidence = { id: string; kind: 'self_reported' | 'observed' | 'inferred'; detail: string };
export type CoachBundle = { input: CoachInput; observedAt: string | null; inventory: LocalSkill[]; inventoryStatus: 'ready' | 'partial' | 'unavailable' | 'not_connected'; evidence: CoachEvidence[]; candidates: CoachCandidate[]; warnings: string[]; rulesVersion: '1'; activityCount: number; };
export type CoachReport = {
  id: string; deviceId: string | null; createdAt: string; updatedAt: string; expiresAt: string;
  status: 'ready' | 'queued' | 'running' | 'completed' | 'failed' | 'canceled';
  author: 'rules' | 'codex'; message: string; bundle: CoachBundle; narrative: CoachNarrative;
  feedback: Record<string, { outcome: 'helpful' | 'not_helpful' | 'not_tried'; note: string }>;
};

export function validateNarrative(value: unknown, bundle: CoachBundle): CoachNarrative {
  const result = coachNarrativeSchema.parse(value);
  const evidence = new Set(bundle.evidence.map(item => item.id));
  const candidates = new Set(bundle.candidates.filter(item => item.sourceEvidence.status === 'verified' && item.score > 0).map(item => item.id));
  if (new Set(result.dimensions.map(item => item.axis)).size !== 5) throw new Error('진단 축이 중복됐습니다.');
  if (new Set(result.recommendations.map(item => item.catalogSkillId)).size !== result.recommendations.length) throw new Error('추천 스킬이 중복됐습니다.');
  for (const item of [...result.dimensions, ...result.habits, ...result.recommendations]) if (item.evidenceIds.some(id => !evidence.has(id))) throw new Error('확인하지 않은 근거를 참조했습니다.');
  if (result.recommendations.some(item => !candidates.has(item.catalogSkillId))) throw new Error('검증한 카탈로그 후보만 추천할 수 있습니다.');
  return result;
}

export function coachMarkdown(report: CoachReport) {
  const { narrative: n, bundle: b } = report;
  return [`# 나의 에이전트 활용 보고서`, `작성: ${report.author === 'codex' ? '로컬 Codex' : '규칙 기반 초기 진단'}, ${report.createdAt}`, `관심 작업: ${b.input.work.map(v => workLabels[v]).join(', ')}`, `목표: ${b.input.goal}`, '', n.summary, '', '## 활용 진단', ...n.dimensions.map(v => `- ${assessmentLabels[v.axis]}: ${v.finding} (${v.evidenceIds.join(', ')})`), '', '## 먼저 바꿔볼 습관', ...n.habits.map(v => `- ${v.action}\n  요청 예시: ${v.examplePrompt}`), '', '## 추천 스킬', ...n.recommendations.flatMap(v => { const c = b.candidates.find(c => c.id === v.catalogSkillId)!; return [`### ${c.name}`, v.reason, `출처: ${c.url}`, `원본: ${c.sourceEvidence.url}`, c.sourceEvidence.kind === 'skills_sh_snapshot' ? `공개 원문 확인: ${c.sourceEvidence.checkedAt}, SHA256 ${c.sourceEvidence.hash}` : `확인 커밋: ${c.sourceEvidence.revision}`, `호환성: 실행 환경 추가 확인 필요`, '적용 방법:', ...v.steps.map(s => `- ${s}`), `요청 예시: ${v.examplePrompt}`, '기대 효과 (예상):', ...v.expectedBenefits.map(s => `- ${s}`), `실습: ${v.exercise}`, ...v.checks.map(s => `- ${s}`)]; }), '', '## 근거', ...b.evidence.map(v => `- ${v.id} [${v.kind}]: ${v.detail}`), '', '## 확인 범위와 한계', ...[...b.warnings, ...n.limitations].map(v => `- ${v}`)].join('\n');
}
