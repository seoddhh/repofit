import { z } from 'zod';
import { LocalAgentError } from './local-agent-store';

export function localJson(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie, Authorization', 'X-Content-Type-Options': 'nosniff' } });
}
export function localError(error: unknown) {
  if (error instanceof LocalAgentError) return localJson({ error: error.message }, error.status);
  if (error instanceof z.ZodError) return localJson({ error: '기기 요청 형식이 올바르지 않습니다.' }, 400);
  return localJson({ error: '기기 연결을 처리하지 못했습니다. 서버 DB 설정과 연결 상태를 확인해 주세요.' }, 503);
}
export function requireLocalOrigin(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) throw new LocalAgentError('허용되지 않은 요청입니다.', 403);
}
export async function localBody(request: Request, maxBytes = 1_000_000) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new LocalAgentError('JSON 요청이 필요합니다.', 415);
  const reader = request.body?.getReader();
  if (!reader) throw new LocalAgentError('요청 본문이 필요합니다.');
  const chunks: Uint8Array[] = []; let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) { await reader.cancel(); throw new LocalAgentError('목록이 전송 한도를 초과했습니다.', 413); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    try { return JSON.parse(new TextDecoder().decode(bytes)); }
    catch { throw new LocalAgentError('JSON 형식을 확인해 주세요.'); }
  } finally { reader.releaseLock(); }
}
