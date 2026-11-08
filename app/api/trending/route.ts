import { readTrendingSnapshot } from '@/features/repositories/snapshot-store';

export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const period = new URL(request.url).searchParams.get('since') ?? 'daily';
  if (period !== 'daily' && period !== 'weekly' && period !== 'monthly') {
    return Response.json({ error: '지원하지 않는 트렌딩 기간입니다.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }
  try {
    const snapshot = await readTrendingSnapshot(period);
    return Response.json(snapshot, { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=60', ETag: `"${snapshot.snapshotId ?? snapshot.fetchedAt}-${period}"` } });
  } catch {
    return Response.json({ error: '저장된 오픈소스 스냅샷을 준비하고 있습니다. 잠시 후 다시 확인해 주세요.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
