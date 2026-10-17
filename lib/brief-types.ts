import { z } from 'zod';
import type { TrendingRepo } from './repository-types';

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
  evidence: BriefEvidence;
  stale: boolean;
};

export function explanationPath(id: string) {
  return `/explore/${id.split('/').map(encodeURIComponent).join('/')}`;
}
