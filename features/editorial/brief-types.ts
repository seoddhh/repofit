import { z } from 'zod';
import type { TrendingPeriod, TrendingRepo } from '../repositories/repository-types';
import { repositoryId } from '../repositories/repository-types';

const paragraph = z.string().trim().min(10).max(1200);
export const briefContentSchema = z.object({
  tagline: z.string().trim().min(10).max(160),
  summary: paragraph,
  useCases: z.array(paragraph).min(1).max(5),
  strengths: z.array(paragraph).min(1).max(5),
  limitations: z.array(paragraph).min(1).max(5),
  gettingStarted: paragraph,
  trendReasons: z.array(z.object({
    text: paragraph,
    kind: z.enum(['fact', 'inference']),
    sourceUrls: z.array(z.string().url()).min(1).max(4),
  }).strict()).min(1).max(5),
}).strict();

export const publishBriefSchema = z.object({
  repository: z.string().max(150),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  content: briefContentSchema,
}).strict();

export const editorialQueueSchema = z.object({
  refreshAfter: z.string().datetime({ offset: true }).optional(),
}).strict();

// Owner-authored backfills use directly read official sources, without REST calls.
// Keep source registration and publication atomic, and never replace an existing brief.
export const importBriefSchema = z.object({
  repository: z.string().refine(value => repositoryId(value) === value, 'owner/repository 형식이 필요합니다.'),
  source: z.object({
    description: z.string().max(2000), language: z.string().max(100).nullable(),
    stars: z.number().int().nonnegative().nullable(), license: z.string().max(100).nullable(),
    readme: z.string().min(50).max(20000), readmeUrl: z.string().url(),
    fetchedAt: z.string().datetime({ offset: true }),
    period: z.enum(['daily', 'weekly', 'monthly']),
    warnings: z.array(z.string().min(1).max(500)).max(10),
  }).strict(),
  content: briefContentSchema,
}).strict().superRefine(({ repository, source }, context) => {
  const url = new URL(source.readmeUrl);
  const prefix = `/${repository.toLowerCase()}/`;
  const official = url.protocol === 'https:' && !url.port && !url.username && !url.password && !url.search && !url.hash && (
    (url.hostname === 'raw.githubusercontent.com' && url.pathname.toLowerCase().startsWith(prefix)) ||
    (url.hostname === 'github.com' && url.pathname.toLowerCase().startsWith(`${prefix}blob/`))
  );
  if (!official) context.addIssue({ code: 'custom', path: ['source', 'readmeUrl'], message: '해당 저장소의 공식 README 출처가 필요합니다.' });
});

export type BriefContent = z.infer<typeof briefContentSchema>;
export type BriefEvidence = {
  id: string;
  description: string;
  language: string | null;
  stars: number;
  license: string | null;
  readme: string | null;
  readmeSha: string | null;
  release: { name: string; publishedAt: string; body: string; url: string } | null;
  trending: TrendingRepo | null;
  trendingPeriod?: TrendingPeriod;
  trendingFetchedAt: string | null;
  trendingStale: boolean;
  sources: { title: string; url: string }[];
  fetchedAt: string;
  warnings: string[];
};
export type RepositoryBrief = {
  id: string;
  evidence: BriefEvidence;
  content: BriefContent;
  generatedAt: string;
};
export type BriefResponse = {
  article: RepositoryBrief | null;
  evidence: BriefEvidence | null;
  stale: boolean;
};

export function explanationPath(id: string) {
  return `/explore/${id.split('/').map(encodeURIComponent).join('/')}`;
}
