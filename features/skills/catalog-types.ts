import { z } from 'zod';
import type { CatalogSkill } from './skills-types';

export const categoryLabels = {
  development: '개발과 아키텍처', design: 'UI와 디자인', debugging: '테스트와 문제 해결',
  review: '코드 리뷰와 보안', data: '데이터와 데이터베이스', infrastructure: '배포와 인프라',
  documents: '문서와 지식', research: '조사와 분석', workflow: '에이전트 작업 흐름',
  media: '이미지와 영상', marketing: '마케팅과 비즈니스', productivity: '업무 자동화',
} as const;
const paragraph = z.string().trim().min(8).max(900);
export const skillExplanationSchema = z.object({
  category: z.enum(Object.keys(categoryLabels) as [keyof typeof categoryLabels, ...(keyof typeof categoryLabels)[]]),
  workKinds: z.array(z.enum(['coding', 'debugging', 'review', 'documents', 'design', 'research'])).min(1).max(4),
  tagline: z.string().trim().min(8).max(180), summary: paragraph,
  capabilities: z.array(z.string().trim().min(2).max(150)).min(1).max(6),
  problems: z.array(paragraph).min(1).max(4),
  steps: z.array(paragraph).min(1).max(5),
  benefits: z.array(paragraph).min(1).max(3),
  requirements: z.array(paragraph).min(1).max(4),
  limitations: z.array(paragraph).min(1).max(4),
}).strict();
export type SkillExplanation = z.infer<typeof skillExplanationSchema>;
export type CatalogEntry = CatalogSkill & {
  rank: number; explanation: SkillExplanation; contentHash: string;
  checkedAt: string; writtenAt: string; descriptionVersion: number;
};
export type CatalogSnapshot = { version: string; fetchedAt: string; checkedAt: string; sourceUrl: string; skills: CatalogEntry[] };
export function sourceKindLabel(kind?: string) { return kind === 'skills_sh_snapshot' ? 'skills.sh 공개 원문 확인' : 'GitHub 고정 커밋 확인'; }
