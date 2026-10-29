import { z } from 'zod';
import { catalogSearch } from '@/lib/catalog-store';

export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const query = (new URL(request.url).searchParams.get('q') ?? '').slice(0, 100);
    const catalog = await catalogSearch(query);
    return Response.json({ query, skills: catalog.skills, fetchedAt: catalog.checkedAt, stale: false, sourceUrl: catalog.sourceUrl, limit: 300 }, { headers: { 'Cache-Control': 'public, max-age=300' } });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: error.issues[0]?.message ?? '검색어를 확인해 주세요.' }, { status: 400 });
    return Response.json({ error: '저장된 스킬 검색을 처리하지 못했습니다.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
