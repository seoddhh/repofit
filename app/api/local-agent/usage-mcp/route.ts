import { z } from 'zod';
import { authenticateLocalDevice, LocalAgentError } from '@/lib/local-agent-store';
import { localBody, localJson } from '@/lib/local-agent-http';
import { callUsageTool, usageDeviceTools, usageServerInstructions, usageTools } from '@/lib/usage-mcp';

export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  try {
    const token = request.headers.get('authorization')?.match(/^Bearer ([a-f0-9]{48})$/)?.[1] ?? '';
    await authenticateLocalDevice(token);
    const m = z.object({ jsonrpc: z.literal('2.0'), id: z.union([z.string(), z.number(), z.null()]).optional(), method: z.string(), params: z.unknown().optional() }).strict().parse(await localBody(request, 100000));
    const respond = (result: unknown) => localJson({ jsonrpc: '2.0', id: m.id ?? null, result });
    if (m.method === 'initialize') return respond({ protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'RepoFit Usage', version: '1.0.0' }, instructions: usageServerInstructions });
    if (m.method === 'notifications/initialized') return new Response(null, { status: 204 });
    if (m.method === 'tools/list') return respond({ tools: [...usageTools.filter(t => ['get_usage_analysis_instructions', 'search_usage_skills'].includes(t.name)), ...usageDeviceTools] });
    if (m.method !== 'tools/call') return localJson({ jsonrpc: '2.0', id: m.id ?? null, error: { code: -32601, message: 'Method not found' } });
    const { name, arguments: args } = z.object({ name: z.string(), arguments: z.unknown().default({}) }).strict().parse(m.params);
    if (![...usageDeviceTools, ...usageTools.filter(t => ['get_usage_analysis_instructions', 'search_usage_skills'].includes(t.name))].some(t => t.name === name)) throw new LocalAgentError('연결 프로그램이 사용할 수 없는 도구입니다.', 403);
    try { const data = await callUsageTool(name, args, { deviceToken: token }); return respond({ content: [{ type: 'text', text: JSON.stringify(data) }] }); }
    catch (error) { return respond({ isError: true, content: [{ type: 'text', text: error instanceof LocalAgentError ? error.message : error instanceof z.ZodError ? '분석 결과 형식을 확인해 주세요.' : '분석 도구를 처리하지 못했습니다.' }] }); }
  } catch (error) {
    return localJson({ error: error instanceof LocalAgentError ? error.message : 'MCP 요청 형식을 확인해 주세요.' }, error instanceof LocalAgentError ? error.status : 400);
  }
}
