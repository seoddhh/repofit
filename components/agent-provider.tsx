'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { createAgentTask, reviseAgentTask, submissionSchema, type AgentTask } from '@/lib/agent-review';
import { createAgentTools, type WebMcpRegistry } from '@/lib/agent-tools';

type AgentWorkspace = {
  tasks: AgentTask[]; selectedId: string | null; selectTask: (id: string) => void;
  connection: 'checking' | 'available' | 'unsupported' | 'error';
  createTask: (input: unknown) => AgentTask; cancelTask: (id: string) => void; importResult: (input: unknown) => void;
};
const Context = createContext<AgentWorkspace | null>(null);
export function AgentProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [connection, setConnection] = useState<AgentWorkspace['connection']>('checking');
  const state = useRef<{ tasks: AgentTask[]; selectedId: string | null }>({ tasks: [], selectedId: null });
  const publish = useCallback((next: AgentTask[], selected = state.current.selectedId) => {
    state.current = { tasks: next, selectedId: selected };
    flushSync(() => { setTasks(next); setSelectedId(selected); });
  }, []);
  const getTask = useCallback((id: string) => {
    const task = state.current.tasks.find(task => task.id === id);
    if (!task) throw new Error('이 탭에 해당 요청이 없습니다. 새로고침했다면 검토 요청을 다시 만들어 주세요.');
    return task;
  }, []);
  const update = useCallback((id: string, expectedRevision: number, change: Parameters<typeof reviseAgentTask>[2]) => {
    const task = reviseAgentTask(getTask(id), expectedRevision, change);
    publish(state.current.tasks.map(current => current.id === id ? task : current));
    return task;
  }, [getTask, publish]);
  const importResult = useCallback((input: unknown) => {
    const parsed = submissionSchema.parse(input);
    const task = getTask(parsed.taskId);
    if (task.revision !== parsed.expectedRevision) throw new Error('작업이 변경됐습니다. 최신 요청 번호와 revision을 확인해 주세요.');
    const started = task.status === 'queued' ? update(task.id, task.revision, { status: 'running', message: '사용자가 에이전트 결과를 가져오고 있습니다.' }) : task;
    update(started.id, started.revision, { status: 'completed', result: parsed.result });
  }, [getTask, update]);
  const selectTask = useCallback((id: string) => {
    getTask(id);
    state.current.selectedId = id;
    setSelectedId(id);
  }, [getTask]);

  useEffect(() => {
    const registry = (document as Document & { modelContext?: WebMcpRegistry }).modelContext;
    if (typeof registry?.registerTool !== 'function') { setConnection('unsupported'); return; }
    const lifecycle = new AbortController();
    const tools = createAgentTools({
      context: () => ({ protocolVersion: 1, scope: 'review_only', storage: 'current_tab_memory', skillPath: '/skills/repofit-review/SKILL.md', selectedTaskId: state.current.selectedId, tasks: state.current.tasks.map(task => ({ id: task.id, candidate: task.candidate, status: task.status, revision: task.revision })) }),
      task: getTask,
      progress: input => update(input.taskId, input.expectedRevision, { status: input.status, message: input.message }),
      submit: input => update(input.taskId, input.expectedRevision, { status: 'completed', result: input.result }),
    });
    const register = async () => {
      try {
        for (const tool of tools) {
          if (lifecycle.signal.aborted) return;
          await registry.registerTool(tool, { signal: lifecycle.signal });
        }
        if (!lifecycle.signal.aborted) setConnection('available');
      } catch {
        lifecycle.abort();
        setConnection('error');
      }
    };
    void register();
    return () => lifecycle.abort();
  }, [getTask, update]);

  return <Context.Provider value={{ tasks, selectedId, connection, importResult,
    selectTask,
    createTask: input => {
      if (state.current.tasks.length >= 30) throw new Error('이 탭에는 최대 30개 요청을 보관합니다. 결과를 내려받고 새 탭에서 시작해 주세요.');
      const task = createAgentTask(input); publish([task, ...state.current.tasks], task.id); return task;
    },
    cancelTask: id => { const task = getTask(id); update(id, task.revision, { status: 'canceled', message: '사용자가 요청을 취소했습니다.' }); },
  }}>{children}</Context.Provider>;
}
export function useAgentWorkspace() {
  const context = useContext(Context);
  if (!context) throw new Error('AgentProvider required');
  return context;
}
