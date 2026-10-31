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
    github(`${base}/readme`).then(r => boundedText(r, 400000)).then(text => JSON.parse(text) as { content?: string; encoding?: string; size?: number; sha?: string; html_url?: string }),
    github(`${base}/releases?per_page=3`).then(r => boundedText(r, 800000)).then(text => JSON.parse(text) as { name: string; tag_name: string; body: string; html_url: string; published_at: string; draft: boolean; prerelease: boolean }[]),
  ]);
  const repoUrl = `https://github.com/${metadata.full_name}`;
  const sources = [{ title: '공식 GitHub 저장소', url: repoUrl }];
  let readme: string | null = null;
  let readmeSha: string | null = null;
  if (readmeResult.status === 'fulfilled' && readmeResult.value.encoding === 'base64' && readmeResult.value.content && (readmeResult.value.size ?? Infinity) <= 256000) {
    try {
      const decoded = new TextDecoder().decode(Uint8Array.from(atob(readmeResult.value.content.replace(/\s/g, '')), c => c.charCodeAt(0)));
      readme = decoded.slice(0, 20000);
      if (decoded.length > 20000) warnings.push('긴 README의 앞부분 20,000자만 확인했습니다.');
      readmeSha = readmeResult.value.sha ?? null;
      sources.push({ title: '공식 README', url: readmeResult.value.html_url?.startsWith(`${repoUrl}/blob/`) ? readmeResult.value.html_url : `${repoUrl}#readme` });
    } catch { warnings.push('README 텍스트를 해석하지 못했습니다.'); }
  } else warnings.push('README를 읽지 못했거나 읽기 제한을 초과했습니다.');
  const latest = releaseResult.status === 'fulfilled' ? releaseResult.value.find(r => !r.draft && !r.prerelease) : null;
  const release = latest && latest.html_url.startsWith(`${repoUrl}/releases/`) ? {
    name: latest.name || latest.tag_name, publishedAt: latest.published_at,
    body: (latest.body ?? '').slice(0, 12000), url: latest.html_url,
  } : null;
  if (release) sources.push({ title: `공식 릴리스, ${release.name}`, url: release.url });
  if (releaseResult.status === 'rejected') warnings.push('릴리스 자료를 확인하지 못했습니다.');
  const trending = snapshot?.repositories.find(r => r.id.toLowerCase() === metadata.full_name.toLowerCase()) ?? null;
  const since = snapshot ? new URL(snapshot.sourceUrl).searchParams.get('since') : null;
  const trendingPeriod = since === 'weekly' || since === 'monthly' ? since : 'daily';
  const periodLabel = { daily: '오늘의', weekly: '이번 주', monthly: '이번 달' }[trendingPeriod];
  if (trending) sources.push({ title: `GitHub ${periodLabel} 트렌딩`, url: snapshot!.sourceUrl });
  return {
    id: metadata.full_name, description: metadata.description ?? '', language: metadata.language,
    stars: metadata.stargazers_count, license: metadata.license?.spdx_id ?? null,
    readme, readmeSha, release, sources, trending, trendingPeriod,
    trendingFetchedAt: trending ? snapshot!.fetchedAt : null, trendingStale: snapshot?.stale ?? false,
    fetchedAt: new Date().toISOString(), warnings,
  };
}

export async function evidenceFingerprint(evidence: BriefEvidence) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(evidence)));
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
}

// Compare the substance of the sources, excluding volatile popularity and timestamps.
// Derive this from saved evidence too, so existing briefs need no migration.
export async function evidenceContentFingerprint(evidence: BriefEvidence) {
  const content = {
    id: evidence.id.toLowerCase(), description: evidence.description,
    language: evidence.language, license: evidence.license,
    readme: evidence.readme, readmeSha: evidence.readmeSha,
    release: evidence.release, sources: evidence.sources.filter(source => {
      const url = new URL(source.url);
      return !(url.origin === 'https://github.com' && url.pathname === '/trending');
    }),
    warnings: evidence.warnings,
  };
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(content)));
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
}
