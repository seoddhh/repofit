import { load, JSON_SCHEMA } from 'js-yaml';
import { boundedText, github, GitHubError } from './github-server';
import type { CatalogSkill } from './skills-types';
import type { SkillSource } from './coach-types';

type RepositoryTree = { revision: string; license: string | null; paths: string[]; complete: boolean };
const repos = new Map<string, { expires: number; value: Promise<RepositoryTree> }>();
const sources = new Map<string, { expires: number; value: Promise<SkillSource> }>();
const safePath = (path: string) => path.length <= 600 && path.split('/').every(p => !!p && p !== '.' && p !== '..' && !/[\\\x00-\x1f]/.test(p));
async function repositoryTree(repository: string): Promise<RepositoryTree> {
  const cached = repos.get(repository);
  if (cached && cached.expires > Date.now()) return cached.value;
  const value = (async () => {
    const base = `/repos/${repository}`;
    const meta = JSON.parse(await boundedText(await github(base), 100000));
    if (typeof meta.default_branch !== 'string') throw new Error('기본 브랜치가 없습니다.');
    const ref = JSON.parse(await boundedText(await github(`${base}/git/ref/heads/${encodeURIComponent(meta.default_branch)}`), 100000));
    const revision = String(ref.object?.sha ?? '');
    if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error('소스 커밋을 확인하지 못했습니다.');
    const tree = JSON.parse(await boundedText(await github(`${base}/git/trees/${revision}?recursive=1`), 2000000));
    if (!Array.isArray(tree.tree)) throw new Error('파일 목록을 확인하지 못했습니다.');
    return { revision, license: typeof meta.license?.spdx_id === 'string' ? meta.license.spdx_id.slice(0, 100) : null, paths: tree.tree.filter((entry: { type: string; path: string }) => entry.type === 'blob' && typeof entry.path === 'string' && safePath(entry.path)).map((entry: { path: string }) => entry.path), complete: !tree.truncated };
  })();
  if (repos.size >= 30) repos.delete(repos.keys().next().value!);
  repos.set(repository, { expires: Date.now() + 300000, value });
  value.catch(() => { if (repos.get(repository)?.value === value) repos.delete(repository); });
  return value;
}
export async function inspectSkillSource(skill: CatalogSkill): Promise<SkillSource> {
  const cached = sources.get(skill.id);
  if (cached && cached.expires > Date.now()) return cached.value;
  const value = (async (): Promise<SkillSource> => {
    try {
      if (!/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(skill.source) || skill.id !== `${skill.source}/${skill.slug}` || !/^[a-zA-Z0-9._-]+$/.test(skill.slug)) throw new Error('지원하지 않는 출처입니다.');
      const tree = await repositoryTree(skill.source);
      const paths = tree.paths.filter(path => path === 'SKILL.md' || path.endsWith(`/${skill.slug}/SKILL.md`) || path === `${skill.slug}/SKILL.md`);
      if (paths.length !== 1) throw new Error('스킬 파일 경로를 특정하지 못했습니다.');
      const path = paths[0];
      const response = await fetch(`https://raw.githubusercontent.com/${skill.source}/${tree.revision}/${path.split('/').map(encodeURIComponent).join('/')}`, { signal: AbortSignal.timeout(12000), redirect: 'manual', headers: { Accept: 'text/plain' } });
      if (!response.ok) throw new Error('스킬 본문을 읽지 못했습니다.');
      const body = await boundedText(response, 32768);
      const frontmatter = body.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
      if (!frontmatter) throw new Error('스킬 메타데이터가 없습니다.');
      const meta = load(frontmatter[1], { schema: JSON_SCHEMA, maxAliasCount: 0 }) as { name?: unknown; description?: unknown };
      if (!meta || meta.name !== skill.slug || typeof meta.description !== 'string' || !meta.description.trim()) throw new Error('검색된 스킬과 원본이 일치하지 않습니다.');
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body))), byte => byte.toString(16).padStart(2, '0')).join('');
      const directory = path.slice(0, -'SKILL.md'.length);
      return { status: 'verified', description: meta.description.slice(0, 2000), body, revision: tree.revision, path, hash, url: `https://github.com/${skill.source}/blob/${tree.revision}/${path.split('/').map(encodeURIComponent).join('/')}`, license: tree.license, resources: tree.paths.filter(p => p.startsWith(directory) && p !== path).slice(0, 30), warning: tree.complete ? '원본 확인은 실행 호환성 및 안전성 검증이 아닙니다.' : '원본 파일 목록이 일부 누락될 수 있습니다.' };
    } catch (error) {
      const warning = error instanceof GitHubError && error.status === 429 ? 'GitHub 공개 API 요청 한도에 도달해 원본 확인을 보류했습니다. 한도 복구 후 새 보고서로 확인해 주세요.' : '공개 원본 및 커밋 및 이름을 확인하지 못했습니다. GitHub 접근 상태 또는 원본 경로를 확인해 주세요.';
      return { status: 'unverified', description: '', body: '', revision: null, path: null, url: null, hash: null, license: null, resources: [], warning };
    }
  })();
  if (sources.size >= 60) sources.delete(sources.keys().next().value!);
  sources.set(skill.id, { expires: Date.now() + 300000, value });
  return value;
}
