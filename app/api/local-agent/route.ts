import { z } from 'zod';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { createLocalPairing, listLocalDevices, removeLocalDevice, LocalAgentError } from '@/lib/local-agent-store';
import { localBody, localError, localJson, requireLocalOrigin } from '@/lib/local-agent-http';

export const dynamic = 'force-dynamic';
async function userId() {
  const user = await getChatGPTUser();
  if (!user) throw new LocalAgentError('로그인 후 Mac을 연결해 주세요.', 401);
  return user.userId;
}
export async function GET() {
  try { return localJson({ devices: await listLocalDevices(await userId()) }); }
  catch (error) { return localError(error); }
}
export async function POST(request: Request) {
  try { requireLocalOrigin(request); return localJson(await createLocalPairing(await userId()), 201); }
  catch (error) { return localError(error); }
}
export async function DELETE(request: Request) {
  try {
    requireLocalOrigin(request);
    const owner = await userId();
    const { id } = z.object({ id: z.string().uuid() }).strict().parse(await localBody(request, 1000));
    await removeLocalDevice(owner, id);
    return localJson({ removed: true });
  } catch (error) { return localError(error); }
}
