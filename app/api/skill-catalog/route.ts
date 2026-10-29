import { readSkillCatalog } from '@/lib/catalog-store';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const snapshot = await readSkillCatalog();
    return Response.json(snapshot, { headers: { 'Cache-Control': 'public, max-age=300', ETag: `"${snapshot.version}"` } });
  } catch {
    return Response.json({ error: '저장된 스킬 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
