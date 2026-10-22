import { z } from 'zod';
import { skillSearchQuery, type CatalogSkill, type SkillSearchResult } from './skills-types';

export class SkillsError extends Error {
  constructor(message: string, public status = 502, public retryAfter: number | null = null) { super(message); }
}
const LIMIT = 20;
const FRESH_MS = 60000;
const STALE_MS = 3600000;
const cache = new Map<string, SkillSearchResult>();
const pending = new Map<string, Promise<SkillSearchResult>>();
const segment = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,199}$/;
const upstreamSchema = z.object({ skills: z.array(z.object({
  id: z.string().min(1).max(600), name: z.string().trim().min(1).max(200),
  source: z.string().min(1).max(400), installs: z.number().int().nonnegative().safe(),
})).max(200) });

function normalize(skill: z.infer<typeof upstreamSchema>['skills'][number]): CatalogSkill {
  const parts = skill.id.split('/');
  const sourceParts = skill.source.split('/');
  if (![2, 3].includes(parts.length) || !parts.every(part => segment.test(part)) ||
    parts.slice(0, -1).join('/') !== skill.source || !sourceParts.every(part => segment.test(part))) {
    throw new SkillsError('스킬 출처 형식이 변경됐습니다. 원본 사이트에서 확인해 주세요.');
  }
  const slug = parts.at(-1)!;
  return {
    id: skill.id, name: skill.name, source: skill.source, slug, installs: skill.installs,
    url: `https://skills.sh/${parts.map(encodeURIComponent).join('/')}`,
    repositoryUrl: parts.length === 3 ? `https://github.com/${sourceParts.map(encodeURIComponent).join('/')}` : null,
  };
}
async function readJson(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) throw new SkillsError('스킬 검색 응답이 비어 있습니다.');
  const chunks: Uint8Array[] = []; let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > 262144) { await reader.cancel(); throw new SkillsError('스킬 검색 응답이 읽기 한도를 초과했습니다.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
}
export async function searchSkills(input: unknown): Promise<SkillSearchResult> {
  const query = skillSearchQuery.parse(input).replace(/\s+/g, ' ');
  const cached = cache.get(query);
  if (cached && Date.now() - Date.parse(cached.fetchedAt) < FRESH_MS) return cached;
  const existing = pending.get(query);
  if (existing) return existing;
  if (pending.size >= 8) throw new SkillsError('검색 요청이 많습니다. 잠시 후 다시 검색해 주세요.', 503, 10);
  const request = (async () => {
    try {
      // Public search endpoint used by vercel-labs/skills/src/find.ts.
      // Do not substitute the authenticated /api/v1 API or scrape HTML.
      const url = new URL('https://skills.sh/api/search');
      url.searchParams.set('q', query); url.searchParams.set('limit', String(LIMIT));
      const response = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'RepoFit' }, signal: AbortSignal.timeout(15000), redirect: 'manual' });
      if (response.status === 429) {
        const retry = Math.min(300, Math.max(1, Number(response.headers.get('retry-after')) || 60));
        throw new SkillsError('skills.sh의 검색 요청 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.', 429, retry);
      }
      if ([401, 403].includes(response.status)) throw new SkillsError('skills.sh가 공개 검색 접근을 제한했습니다. 원본 사이트에서 확인해 주세요.', 503);
      if (!response.ok) throw new SkillsError('skills.sh 검색에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.');
      const parsed = upstreamSchema.parse(await readJson(response));
      const skills = [...new Map(parsed.skills.slice(0, LIMIT).map(skill => [skill.id, normalize(skill)])).values()];
      const result: SkillSearchResult = { query, skills, fetchedAt: new Date().toISOString(), stale: false, sourceUrl: `https://skills.sh/?q=${encodeURIComponent(query)}`, limit: LIMIT };
      if (cache.size >= 100) cache.delete(cache.keys().next().value!);
      cache.set(query, result);
      return result;
    } catch (error) {
      if (cached && Date.now() - Date.parse(cached.fetchedAt) < STALE_MS) return { ...cached, stale: true };
      if (error instanceof SkillsError) throw error;
      throw new SkillsError(error instanceof z.ZodError || error instanceof SyntaxError ? '스킬 검색 응답 형식을 확인하지 못했습니다. 원본 사이트에서 확인해 주세요.' : '스킬 검색이 지연되거나 연결이 끊겼습니다. 다시 시도해 주세요.');
    } finally { pending.delete(query); }
  })();
  pending.set(query, request);
  return request;
}
