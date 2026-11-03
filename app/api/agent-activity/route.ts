import { ServiceError } from '@/lib/service-error';
import { z } from 'zod';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { listAgentActivities, deleteAgentActivity } from '@/features/coach/coach-store';
import { localBody, localError, localJson, requireLocalOrigin } from '@/features/local-agent/local-agent-http';

export const dynamic = 'force-dynamic';
async function owner() { const user = await getChatGPTUser(); if (!user) throw new ServiceError('로그인이 필요합니다.', 401); return user.userId; }
export async function GET() {
  try { return localJson({ activities: await listAgentActivities(await owner()) }); } catch (error) { return localError(error); }
}
export async function DELETE(request: Request) {
  try { requireLocalOrigin(request); const userId = await owner(); const { id } = z.object({ id: z.string().uuid() }).strict().parse(await localBody(request, 1000)); await deleteAgentActivity(userId, id); return localJson({ deleted: true }); } catch (error) { return localError(error); }
}
