import { z } from 'zod';

export const skillSearchQuery = z.string().trim().min(2, '검색어를 두 글자 이상 입력해 주세요.').max(100, '검색어는 100자 이내로 입력해 주세요.');
export type CatalogSkill = {
  id: string; name: string; source: string; slug: string; installs: number;
  url: string; repositoryUrl: string | null;
};
export type SkillSearchResult = {
  query: string; skills: CatalogSkill[]; fetchedAt: string; stale: boolean;
  sourceUrl: string; limit: number;
};
