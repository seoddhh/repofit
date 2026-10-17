'use client';
import { useEffect } from 'react';
import type { WebMcpRegistry } from '@/lib/agent-tools';

// The browser bridge and unattended MCP use the same server authorization and writer.
export function EditorialBridge() {
  useEffect(() => {
    const registry = (document as Document & { modelContext?: WebMcpRegistry }).modelContext;
    if (!registry?.registerTool) return;
    const lifecycle = new AbortController();
    async function rpc(method: string, params?: unknown) {
      const response = await fetch('/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: lifecycle.signal, body: JSON.stringify({ jsonrpc: '2.0', id: crypto.randomUUID(), method, params }) });
      if (!response.ok) throw new Error('해설 도구에 연결하지 못했습니다.');
      return await response.json() as { result?: { tools?: { name: string; description: string; inputSchema: object }[]; isError?: boolean; content?: { type: string; text: string }[] }; error?: { message: string } };
    }
    void (async () => {
      try {
        const discovery = await rpc('tools/list');
        for (const tool of discovery.result?.tools ?? []) {
          if (lifecycle.signal.aborted) return;
          await registry!.registerTool({
            ...tool, name: `repofit_editorial_${tool.name}`,
            annotations: { readOnlyHint: tool.name === 'read_repository_brief', untrustedContentHint: true },
            async execute(input) {
              const result = await rpc('tools/call', { name: tool.name, arguments: input });
              if (tool.name === 'publish_repository_brief' && !result.result?.isError && !result.error) window.dispatchEvent(new Event('repofit-brief-updated'));
              return result.result ?? result.error;
            },
          }, { signal: lifecycle.signal });
        }
      } catch { /* The ordinary UI works in browsers without page-tool support. */ }
    })();
    return () => lifecycle.abort();
  }, []);
  return null;
}
