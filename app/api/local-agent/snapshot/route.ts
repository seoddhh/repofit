import { receiveLocalInventory } from '@/lib/local-agent-store';
import { localBody, localError, localJson } from '@/lib/local-agent-http';

export const dynamic = 'force-dynamic';
export async function PUT(request: Request) {
  try {
    const token = request.headers.get('authorization')?.match(/^Bearer ([a-f0-9]{48})$/)?.[1] ?? '';
    return localJson(await receiveLocalInventory(token, await localBody(request)));
  } catch (error) { return localError(error); }
}
