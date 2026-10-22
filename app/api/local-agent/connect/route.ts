import { claimLocalPairing } from '@/lib/local-agent-store';
import { localBody, localError, localJson } from '@/lib/local-agent-http';

export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  try { return localJson(await claimLocalPairing(await localBody(request, 2000))); }
  catch (error) { return localError(error); }
}
