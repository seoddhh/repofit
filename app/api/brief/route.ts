import { readBrief, listBriefs } from '@/lib/brief-store';
import { repositoryId } from '@/lib/repository-types';
import { GitHubError } from '@/lib/github-server';

export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const input = new URL(request.url).searchParams.get('repository');
  if (input !== null && !repositoryId(input)) return Response.json({ error: '올바른 공개 레포 주소를 입력해 주세요.' }, { status: 400 });
  try {
    return Response.json(input ? await readBrief(repositoryId(input)!) : { articles: await listBriefs() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.warn('RepoFit brief read failed:', error instanceof Error ? error.message : 'unknown error');
    return Response.json({ error: error instanceof GitHubError ? error.message : '해설 자료를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.' }, { status: error instanceof GitHubError ? error.status : 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
