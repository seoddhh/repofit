import { getTrending } from '@/lib/github-server';

export async function GET() {
  try {
    const snapshot = await getTrending();
    const age = Math.max(0, Date.now() - Date.parse(snapshot.fetchedAt));
    const remaining = Math.max(0, 300 - Math.ceil(age / 1000));
    return Response.json(snapshot, { headers: { 'Cache-Control': snapshot.stale ? 'no-store' : `private, max-age=${remaining}` } });
  }
  catch (error) {
    console.warn('RepoFit trending collection failed:', error instanceof Error ? error.message : 'unknown error');
    return Response.json({ error: 'GitHub Trending을 불러오지 못했습니다. 잠시 후 다시 시도하거나 GitHub 원본을 확인해 주세요.' }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
