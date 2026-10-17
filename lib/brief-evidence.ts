import { github, boundedText } from './github-server';
import type { TrendingSnapshot } from './repository-types';
import type { BriefEvidence } from './brief-types';

export async function collectBriefEvidence(id: string, snapshot: TrendingSnapshot | null): Promise<BriefEvidence> {
  const base = `/repos/${id.split('/').map(encodeURIComponent).join('/')}`;
  const metadata = JSON.parse(await boundedText(await github(base), 80000)) as {
    full_name: string; description: string | null; language: string | null;
    stargazers_count: number; license: { spdx_id: string } | null;
  };
  const warnings: string[] = [];
  const [readmeResult, releaseResult] = await Promise.allSettled([
    github(`${base}/readme`).then(r => boundedText(r, 120000)).then(text => JSON.parse(text) as { content?: string; encoding?: string; size?: number; sha?: string; html_url?: string }),
    github(`${base}/releases?per_page=3`).then(r => boundedText(r, 180000)).then(text => JSON.parse(text) as { name: string; tag_name: string; body: string; html_url: string; published_at: string; draft: boolean; prerelease: boolean }[]),
  ]);
  const repoUrl = `https://github.com/${metadata.full_name}`;
  const sources = [{ title: '공식 GitHub 저장소', url: repoUrl }];
  let readme: string | null = null;
  let readmeSha: string | null = null;
  if (readmeResult.status === 'fulfilled' && readmeResult.value.encoding === 'base64' && readmeResult.value.content && (readmeResult.value.size ?? Infinity) <= 64000) {
    try {
      readme = new TextDecoder().decode(Uint8Array.from(atob(readmeResult.value.content.replace(/\s/g, '')), c => c.charCodeAt(0))).slice(0, 20000);
      readmeSha = readmeResult.value.sha ?? null;
      sources.push({ title: '공식 README', url: readmeResult.value.html_url?.startsWith(`${repoUrl}/blob/`) ? readmeResult.value.html_url : `${repoUrl}#readme` });
    } catch { warnings.push('README 텍스트를 해석하지 못했습니다.'); }
  } else warnings.push('README를 읽지 못했거나 읽기 제한을 초과했습니다.');
  const latest = releaseResult.status === 'fulfilled' ? releaseResult.value.find(r => !r.draft && !r.prerelease) : null;
  const release = latest && latest.html_url.startsWith(`${repoUrl}/releases/`) ? {
    name: latest.name || latest.tag_name, publishedAt: latest.published_at,
    body: (latest.body ?? '').slice(0, 12000), url: latest.html_url,
  } : null;
  if (release) sources.push({ title: `공식 릴리스 · ${release.name}`, url: release.url });
  if (releaseResult.status === 'rejected') warnings.push('릴리스 자료를 확인하지 못했습니다.');
  const trending = snapshot?.repositories.find(r => r.id.toLowerCase() === metadata.full_name.toLowerCase()) ?? null;
  if (trending) sources.push({ title: 'GitHub 오늘의 트렌딩', url: snapshot!.sourceUrl });
  return {
    id: metadata.full_name, description: metadata.description ?? '', language: metadata.language,
    stars: metadata.stargazers_count, license: metadata.license?.spdx_id ?? null,
    readme, readmeSha, release, sources, trending,
    trendingFetchedAt: trending ? snapshot!.fetchedAt : null, trendingStale: snapshot?.stale ?? false,
    fetchedAt: new Date().toISOString(), warnings,
  };
}

export async function evidenceFingerprint(evidence: BriefEvidence) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(evidence)));
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
}
