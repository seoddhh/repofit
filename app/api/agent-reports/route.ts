import { z } from 'zod';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { LocalAgentError } from '@/lib/local-agent-store';
import { localBody, localError, localJson, requireLocalOrigin } from '@/lib/local-agent-http';
import { createCoachReport, deleteCoachReport, listCoachReports, updateCoachReport } from '@/lib/coach-store';

export const dynamic = 'force-dynamic';
async function owner() {
  const user = await getChatGPTUser();
  if (!user) throw new LocalAgentError('로그인 후 보고서를 만들거나 저장해 주세요.', 401);
  return user.userId;
}
export async function GET() {
  try { return localJson({ reports: await listCoachReports(await owner()) }); } catch (error) { return localError(error); }
}
export async function POST(request: Request) {
  try { requireLocalOrigin(request); const userId = await owner(); return localJson(await createCoachReport(userId, await localBody(request, 12000)), 201); } catch (error) { return localError(error); }
}
export async function PATCH(request: Request) {
  try { requireLocalOrigin(request); const userId = await owner(); return localJson(await updateCoachReport(userId, await localBody(request, 12000))); } catch (error) { return localError(error); }
}
export async function DELETE(request: Request) {
  try { requireLocalOrigin(request); const userId = await owner(); const { id } = z.object({ id: z.string().uuid() }).strict().parse(await localBody(request, 1000)); await deleteCoachReport(userId, id); return localJson({ deleted: true }); } catch (error) { return localError(error); }
}
