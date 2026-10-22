import { z } from 'zod';
import { searchSkills, SkillsError } from '@/lib/skills-server';

export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    return Response.json(await searchSkills(new URL(request.url).searchParams.get('q')), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: error.issues[0]?.message ?? '검색어를 확인해 주세요.' }, { status: 400 });
    const failure = error instanceof SkillsError ? error : new SkillsError('스킬 검색을 처리하지 못했습니다.');
    return Response.json({ error: failure.message }, { status: failure.status, headers: { 'Cache-Control': 'no-store', ...(failure.retryAfter ? { 'Retry-After': String(failure.retryAfter) } : {}) } });
  }
}
