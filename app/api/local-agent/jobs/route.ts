import { claimCoachJob, updateCoachJob } from '@/lib/coach-store';
import { localBody, localError, localJson } from '@/lib/local-agent-http';

export const dynamic = 'force-dynamic';
const token = (request: Request) => request.headers.get('authorization')?.match(/^Bearer ([a-f0-9]{48})$/)?.[1] ?? '';
export async function POST(request: Request) {
  try { return localJson(await claimCoachJob(token(request))); } catch (error) { return localError(error); }
}
export async function PUT(request: Request) {
  try { return localJson(await updateCoachJob(token(request), await localBody(request, 100000))); } catch (error) { return localError(error); }
}
