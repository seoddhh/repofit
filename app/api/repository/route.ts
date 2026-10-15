import { GitHubError, inspectRepository } from '@/lib/github-server';
import { repositoryId } from '@/lib/repository-types';

export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return Response.json({ error: '허용되지 않은 요청입니다.' }, { status: 403 });
  try {
    const body = await request.text();
    if (body.length > 1000) return Response.json({ error: '레포 주소가 너무 깁니다.' }, { status: 400 });
    const input = JSON.parse(body);
    const id = input && typeof input.repository === 'string' && repositoryId(input.repository);
    if (!id) return Response.json({ error: 'github.com/owner/repository 형식의 공개 레포 주소를 입력해 주세요.' }, { status: 400 });
    return Response.json(await inspectRepository(id), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof SyntaxError) return Response.json({ error: '올바른 JSON 요청을 보내 주세요.' }, { status: 400 });
    return Response.json({ error: error instanceof GitHubError ? error.message : '자료를 불러오지 못했습니다. 주소를 확인하고 다시 시도해 주세요.' }, { status: error instanceof GitHubError ? error.status : 502 });
  }
}
