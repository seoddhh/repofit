import { z } from 'zod';
import type { CatalogEntry } from './catalog-types';

const text = z.string().trim().min(1).max(1600);
const sourceId = z.string().regex(/^case-(?:[1-9]|10)-item-[0-9]+$/);
const assessmentSchema = z.object({
  criterion: z.enum(['goal_context', 'continuity', 'scope', 'verification', 'reuse']),
  status: z.enum(['confirmed_issue', 'opportunity', 'insufficient_evidence', 'working_well', 'not_applicable']),
  attribution: z.enum(['user', 'agent', 'environment', 'shared', 'unknown']),
  cause: z.string().trim().min(1).max(240), impact: z.string().trim().min(1).max(240),
  alternativeExplanation: z.string().trim().min(1).max(240), nextCheck: z.string().trim().min(1).max(240),
  evidence: z.array(z.object({
    sourceId, kind: z.enum(['user_request', 'agent_response', 'command', 'tool']),
    summary: z.string().trim().min(1).max(160),
  }).strict()).min(1).max(3),
}).strict();
export const usageAnalysisSchema = z.object({
  // Older saved reports have neither a rubric version nor assessments.
  rubricVersion: z.literal('workflow-evidence-v1').optional(),
  summary: text,
  patterns: z.array(z.object({
    id: z.string().regex(/^pattern-[0-9]+$/), observation: text, interpretation: text,
    need: text, query: z.string().trim().min(1).max(100),
    sourceIds: z.array(sourceId).min(1).max(15),
    assessment: assessmentSchema.optional(),
  }).strict()).min(1).max(8),
  strengths: z.array(text).max(5), limitations: z.array(text).min(1).max(10),
}).strict().superRefine((value, ctx) => {
  if (new Set(value.patterns.map(p => p.id)).size !== value.patterns.length) ctx.addIssue({ code: 'custom', message: '분석 근거 식별자가 중복됐습니다.' });
  if (value.rubricVersion && value.patterns.length > 5) ctx.addIssue({ code: 'custom', message: '주요 판단은 최대 5개입니다.' });
  for (const p of value.patterns) {
    if (value.rubricVersion && !p.assessment) ctx.addIssue({ code: 'custom', message: '판단 기준과 대표 근거가 필요합니다.' });
    if (!value.rubricVersion && p.assessment) ctx.addIssue({ code: 'custom', message: '판단 기준 버전이 필요합니다.' });
    if (p.assessment && (new Set(p.assessment.evidence.map(e => e.sourceId)).size !== p.assessment.evidence.length || p.assessment.evidence.some(e => !p.sourceIds.includes(e.sourceId)))) ctx.addIssue({ code: 'custom', message: '대표 근거는 해당 관찰의 서로 다른 근거 항목이어야 합니다.' });
  }
});
export const usageCoverageSchema = z.object({
  observedAt: z.string().datetime(), threadsRead: z.number().int().min(1).max(10),
  itemsRead: z.number().int().min(1).max(400), truncated: z.boolean(),
  warnings: z.array(z.string().max(500)).max(15),
}).strict();
export const usageReportSchema = z.object({
  summary: text,
  habits: z.array(z.object({ action: text, examplePrompt: text, patternIds: z.array(z.string()).min(1).max(8) }).strict()).max(3),
  recommendations: z.array(z.object({
    catalogSkillId: z.string().min(1).max(600), reason: text,
    patternIds: z.array(z.string()).min(1).max(8),
    overlap: text, prerequisites: z.array(text).min(1).max(6),
    steps: z.array(text).min(1).max(8), examplePrompt: text,
    expectedBenefits: z.array(text).min(1).max(5), checks: z.array(text).min(1).max(5),
  }).strict()).max(3),
  unmetNeeds: z.array(text).max(8), limitations: z.array(text).min(1).max(10),
}).strict();
export const usageRequestSchema = z.object({
  deviceId: z.string().uuid(), goal: z.string().trim().max(1000).default(''),
  selectedSkillIds: z.array(z.string().min(1).max(600)).max(5).default([]),
  consent: z.literal(true), historyScope: z.literal('recent-10'),
}).strict();
export type UsageAnalysis = z.infer<typeof usageAnalysisSchema>;
export type UsageCoverage = z.infer<typeof usageCoverageSchema>;
export type UsageReport = z.infer<typeof usageReportSchema>;
export type UsageCandidate = Pick<CatalogEntry, 'id' | 'name' | 'slug' | 'source' | 'url' | 'availability' | 'explanation' | 'checkedAt' | 'contentHash'>;
export type UsageRun = {
  id: string; deviceId: string; goal: string; selectedSkillIds: string[];
  status: 'queued' | 'running' | 'completed' | 'failed' | 'canceled'; revision: number;
  createdAt: string; updatedAt: string; expiresAt: string; message: string;
  analysis: UsageAnalysis | null; coverage: UsageCoverage | null;
  candidates: UsageCandidate[]; report: UsageReport | null;
};
export type UsageRunSummary = Omit<UsageRun, 'analysis' | 'coverage' | 'candidates' | 'report'>;
export function validateUsageReport(value: unknown, analysis: UsageAnalysis, candidates: UsageCandidate[]) {
  const report = usageReportSchema.parse(value);
  const patterns = new Set(analysis.patterns.map(p => p.id));
  const ids = new Set(candidates.filter(c => c.availability !== 'deprecated').map(c => c.id));
  if (new Set(report.recommendations.map(r => r.catalogSkillId)).size !== report.recommendations.length) throw new Error('추천이 중복됐습니다.');
  for (const item of [...report.habits, ...report.recommendations]) {
    if (item.patternIds.some(id => !patterns.has(id))) throw new Error('분석에서 확인하지 않은 사용 방식을 참조했습니다.');
  }
  const unsupported = new Set(analysis.patterns.filter(p => ['insufficient_evidence', 'not_applicable'].includes(p.assessment?.status ?? '')).map(p => p.id));
  if (report.recommendations.some(r => r.patternIds.some(id => unsupported.has(id)))) throw new Error('판단 자료가 부족하거나 해당하지 않는 관찰로 스킬을 추천할 수 없습니다.');
  if (report.recommendations.some(r => !ids.has(r.catalogSkillId))) throw new Error('조회한 스킬 후보만 추천할 수 있습니다.');
  return report;
}
