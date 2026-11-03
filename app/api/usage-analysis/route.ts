import { ServiceError } from '@/lib/service-error';
import { z } from 'zod';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { localBody, localJson, requireLocalOrigin } from '@/features/local-agent/local-agent-http';
import { cancelUsageRun, createAgentUsageRun, deleteUsageRun, getUsageRun, listUsageRuns } from '@/features/usage/usage-store';

export const dynamic = 'force-dynamic';
async function owner() {
  const user = await getChatGPTUser();
  if (!user) throw new ServiceError('로그인 후 분석을 시작해 주세요.', 401);
  return user.userId;
}
function failure(error: unknown) {
  return localJson({ error: error instanceof ServiceError ? error.message : error instanceof z.ZodError ? '분석 요청 형식을 확인해 주세요.' : '분석 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.' }, error instanceof ServiceError ? error.status : error instanceof z.ZodError ? 400 : 503);
}
export async function GET(request: Request) {
  try { const userId = await owner(); const id = new URL(request.url).searchParams.get('id'); return localJson(id ? await getUsageRun(userId, id) : { runs: await listUsageRuns(userId) }); }
  catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try { requireLocalOrigin(request); return localJson(await createAgentUsageRun(await owner(), await localBody(request, 1000)), 201); }
  catch (error) { return failure(error); }
}
export async function PATCH(request: Request) {
  try { requireLocalOrigin(request); const { id } = z.object({ id: z.string().uuid() }).strict().parse(await localBody(request, 1000)); return localJson(await cancelUsageRun(await owner(), id)); }
  catch (error) { return failure(error); }
}
export async function DELETE(request: Request) {
  try { requireLocalOrigin(request); const { id } = z.object({ id: z.string().uuid() }).strict().parse(await localBody(request, 1000)); return localJson(await deleteUsageRun(await owner(), id)); }
  catch (error) { return failure(error); }
}
