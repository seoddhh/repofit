import { z } from 'zod';

export const skillSearchQuery = z.string().trim().min(2, '검색어를 두 글자 이상 입력해 주세요.').max(100, '검색어는 100자 이내로 입력해 주세요.');
export type CatalogSkill = {
  id: string; name: string; source: string; slug: string; installs: number;
  url: string; repositoryUrl: string | null;
  availability?: 'active' | 'moved' | 'deprecated';
};
export type SkillSearchResult = {
  query: string; skills: CatalogSkill[]; fetchedAt: string; stale: boolean;
  sourceUrl: string; limit: number;
};

export type SkillSource = {
  status: 'verified' | 'unverified'; description: string; body: string; revision: string | null;
  kind?: 'github_commit' | 'skills_sh_snapshot'; checkedAt?: string;
  path: string | null; url: string | null; hash: string | null; license: string | null;
  resources: string[]; warning: string | null;
};
