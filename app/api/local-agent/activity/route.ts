import { receiveAgentActivity } from '@/lib/coach-store';
import { localBody, localError, localJson } from '@/lib/local-agent-http';

export const dynamic = 'force-dynamic';
export async function PUT(request: Request) {
  try { const token = request.headers.get('authorization')?.match(/^Bearer ([a-f0-9]{48})$/)?.[1] ?? ''; return localJson(await receiveAgentActivity(token, await localBody(request, 16000))); } catch (error) { return localError(error); }
}
