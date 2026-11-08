import { readBrief, listBriefs } from '@/features/editorial/brief-store';
import { repositoryId } from '@/features/repositories/repository-types';
import { ServiceError } from '@/lib/service-error';

export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const input = params.get('repository');
  const period = params.get('since') ?? undefined;
  if (period && !['daily', 'weekly', 'monthly'].includes(period)) return Response.json({ error: '트렌딩 기간을 확인해 주세요.' }, { status: 400 });
  if (input !== null && !repositoryId(input)) return Response.json({ error: '올바른 공개 레포 주소를 입력해 주세요.' }, { status: 400 });
  try {
    return Response.json(input ? await readBrief(repositoryId(input)!, { version: params.get('snapshot') ?? undefined, period: period as 'daily' | 'weekly' | 'monthly' | undefined }) : { articles: await listBriefs() }, { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=60' } });
  } catch (error) {
    console.warn('RepoFit brief read failed:', error instanceof Error ? error.message : 'unknown error');
    return Response.json({ error: error instanceof ServiceError ? error.message : '해설 자료를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.' }, { status: error instanceof ServiceError ? error.status : 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
