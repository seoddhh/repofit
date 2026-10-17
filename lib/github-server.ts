import { parseTrending } from './trending-parser';
import type { RepositoryOverview, TrendingSnapshot } from './repository-types';

export class GitHubError extends Error {
  constructor(message: string, public status = 502) { super(message); }
}

export async function boundedText(response: Response, limit: number): Promise<string> {
  if (!response.body) throw new GitHubError('GitHub 응답이 비어 있습니다.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new GitHubError('자료가 읽기 제한을 초과했습니다.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder().decode(bytes);
}

export async function github(path: string, accept = 'application/vnd.github+json'): Promise<Response> {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: { Accept: accept, 'User-Agent': 'RepoFit', 'X-GitHub-Api-Version': '2022-11-28' },
    signal: AbortSignal.timeout(12000), redirect: 'manual',
  });
  if (response.status === 404) throw new GitHubError('공개 레포를 찾지 못했습니다. 주소와 공개 여부를 확인해 주세요.', 404);
  if (response.status === 403 || response.status === 429) throw new GitHubError('GitHub 요청 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.', 429);
  if (!response.ok) throw new GitHubError('GitHub 자료를 불러오지 못했습니다. 다시 시도해 주세요.');
  return response;
}

let trendingCache: TrendingSnapshot | null = null;
let trendingRequest: Promise<TrendingSnapshot> | null = null;
export async function getTrending(): Promise<TrendingSnapshot> {
  if (trendingCache && Date.now() - Date.parse(trendingCache.fetchedAt) < 300000) return trendingCache;
  if (trendingRequest) return trendingRequest;
  trendingRequest = (async () => {
    try {
      const sourceUrl = 'https://github.com/trending?since=daily';
      const response = await fetch(sourceUrl, { headers: { 'User-Agent': 'RepoFit', Accept: 'text/html' }, signal: AbortSignal.timeout(15000), redirect: 'manual' });
      if (!response.ok) throw new GitHubError('GitHub Trending에 연결하지 못했습니다.');
      const repositories = parseTrending(await boundedText(response, 2000000));
      trendingCache = { repositories, sourceUrl, fetchedAt: new Date().toISOString(), stale: false };
      return trendingCache;
    } catch (error) {
      if (trendingCache) return { ...trendingCache, stale: true };
      throw error;
    } finally { trendingRequest = null; }
  })();
  return trendingRequest;
}

type Metadata = { full_name: string; description: string | null; language: string | null; stargazers_count: number; license: { spdx_id: string } | null; default_branch: string };
type Tree = { tree: { path: string; type: string }[]; truncated: boolean };
const overviewCache = new Map<string, RepositoryOverview>();
const safePath = (path: string) => !/(^|\/)(\.env[^/]*|credentials[^/]*|secrets?[^/]*|[^/]*\.(pem|key))($|\/)/i.test(path);

export async function inspectRepository(id: string): Promise<RepositoryOverview> {
  const cached = overviewCache.get(id.toLowerCase());
  if (cached && Date.now() - Date.parse(cached.fetchedAt) < 300000) return cached;
  const base = `/repos/${id.split('/').map(encodeURIComponent).join('/')}`;
  const metadata: Metadata = JSON.parse(await boundedText(await github(base), 100000));
  const ref: { object: { sha: string } } = JSON.parse(await boundedText(await github(`${base}/git/ref/heads/${encodeURIComponent(metadata.default_branch)}`), 100000));
  const commit = { sha: ref.object.sha };
  const warnings: string[] = [];
  const results = await Promise.allSettled([
    github(`${base}/git/trees/${commit.sha}?recursive=1`).then(response => boundedText(response, 3000000)).then(text => JSON.parse(text) as Tree),
    github(`${base}/readme?ref=${commit.sha}`).then(response => boundedText(response, 120000)).then(text => JSON.parse(text) as { content?: string; encoding?: string; path?: string; size?: number }),
    github(`${base}/contents/package.json?ref=${commit.sha}`, 'application/vnd.github.raw+json').then(response => boundedText(response, 64000)).then(text => JSON.parse(text) as { name?: unknown; dependencies?: Record<string, unknown>; devDependencies?: Record<string, unknown> }),
  ]);
  const tree = results[0].status === 'fulfilled' ? results[0].value : null;
  if (!tree) warnings.push('파일 구조를 읽지 못했습니다.');
  let readme: string | null = null;
  let readmePath: string | null = null;
  if (results[1].status === 'fulfilled') {
    const file = results[1].value;
    if (file.content && file.encoding === 'base64' && (file.size ?? 0) <= 64000) {
      try { readme = new TextDecoder().decode(Uint8Array.from(atob(file.content.replace(/\s/g, '')), c => c.charCodeAt(0))); readmePath = file.path ?? 'README.md'; }
      catch { warnings.push('README 텍스트를 해석하지 못했습니다.'); }
    } else warnings.push('README가 없거나 64KB 읽기 제한을 초과했습니다.');
  } else warnings.push('README를 읽지 못했습니다.');
  const pkg = results[2].status === 'fulfilled' ? results[2].value : null;
  const dependencies = Object.fromEntries(Object.entries({ ...pkg?.dependencies, ...pkg?.devDependencies }).filter((entry): entry is [string, string] => typeof entry[1] === 'string').slice(0, 150));
  if (!pkg) warnings.push('루트 package.json을 읽지 못했습니다. 다른 언어 또는 하위 패키지의 의존성은 분석하지 않았습니다.');
  // Keep root and shallow source paths visible even in documentation-heavy repos.
  const paths = (tree?.tree ?? []).map(entry => entry.path).filter(safePath).sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b)).slice(0, 500);
  const overview: RepositoryOverview = {
    id: metadata.full_name, description: metadata.description ?? '', language: metadata.language,
    stars: metadata.stargazers_count, license: metadata.license?.spdx_id ?? null, sha: commit.sha,
    fetchedAt: new Date().toISOString(), readme, readmePath, paths,
    truncated: Boolean(tree?.truncated || (tree?.tree.length ?? 0) > 500), dependencies,
    packageName: typeof pkg?.name === 'string' ? pkg.name : null, warnings,
  };
  if (overviewCache.size >= 40) overviewCache.delete(overviewCache.keys().next().value!);
  overviewCache.set(id.toLowerCase(), overview);
  return overview;
}
