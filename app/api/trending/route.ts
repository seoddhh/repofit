import { getTrending } from '@/lib/github-server';

export async function GET() {
  try { return Response.json(await getTrending(), { headers: { 'Cache-Control': 'no-store' } }); }
  catch (error) {
    console.warn('RepoFit trending collection failed:', error instanceof Error ? error.message : 'unknown error');
    return Response.json({ error: 'GitHub Trending을 불러오지 못했습니다. 잠시 후 다시 시도하거나 GitHub 원본을 확인해 주세요.' }, { status: 502 });
  }
}
