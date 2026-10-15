'use client';
import { createContext, useContext, useEffect, useSyncExternalStore } from 'react';
import { createDemoRun, advanceDemoRun, parseDemoRuns, demoSteps, STORAGE_KEY, type DemoRun } from '@/lib/demo-agent';

type Snapshot = { runs: DemoRun[]; ready: boolean; storageAvailable: boolean; notice: string };
type Store = Snapshot & {
  start: (scenario?: DemoRun['scenario']) => string; preview: () => string;
  pause: (id: string) => void; resume: (id: string) => void; cancel: (id: string) => void;
  remove: (id: string) => void; notify: (message: string) => void;
};
const Context = createContext<Store | null>(null);
const serverSnapshot: Snapshot = { runs: [], ready: false, storageAvailable: true, notice: '' };
let browserSnapshot: Snapshot | null = null;
const listeners = new Set<() => void>();

// Browser persistence is an external store. A fixed server snapshot keeps
// hydration consistent without synchronously setting React state in effects.
function getSnapshot(): Snapshot {
  if (browserSnapshot) return browserSnapshot;
  let runs: DemoRun[] = [];
  let notice = '';
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) runs = parseDemoRuns(raw);
  } catch { notice = '이전 데모 기록을 읽지 못했습니다.'; }
  browserSnapshot = { runs, ready: true, storageAvailable: true, notice };
  return browserSnapshot;
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function update(changes: Partial<Snapshot>) {
  const next = { ...getSnapshot(), ...changes };
  if (changes.runs) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(changes.runs)); }
    catch { next.storageAvailable = false; next.notice = '이 브라우저에 데모 기록을 저장하지 못했습니다.'; }
  }
  browserSnapshot = next;
  listeners.forEach(listener => listener());
}
const notify = (message: string) => update({ notice: message });
const change = (id: string, status: DemoRun['status']) => update({ runs: getSnapshot().runs.map(run => run.id === id ? { ...run, status } : run) });
function start(scenario: DemoRun['scenario'] = 'success') {
  const { runs } = getSnapshot();
  const active = runs.find(run => run.status === 'running');
  if (active) return active.id;
  const run = createDemoRun(scenario);
  update({ runs: [run, ...runs].slice(0, 20) });
  return run.id;
}
function preview() {
  const { runs } = getSnapshot();
  const completed = runs.find(run => run.status === 'completed');
  if (completed) return completed.id;
  const run = { ...createDemoRun('success'), status: 'completed' as const, step: demoSteps.length };
  update({ runs: [run, ...runs].slice(0, 20) });
  return run.id;
}
export function DemoProvider({ children }: { children: React.ReactNode }) {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => serverSnapshot);
  useEffect(() => {
    const run = snapshot.runs.find(item => item.status === 'running');
    if (!run) return;
    const timer = setTimeout(() => update({ runs: getSnapshot().runs.map(item => item.id === run.id ? advanceDemoRun(item) : item) }), demoSteps[run.step]?.duration ?? 500);
    return () => clearTimeout(timer);
  }, [snapshot.runs]);
  useEffect(() => {
    if (!snapshot.notice) return;
    const timer = setTimeout(() => notify(''), 4000);
    return () => clearTimeout(timer);
  }, [snapshot.notice]);
  return <Context.Provider value={{ ...snapshot, start, preview, notify,
    pause: id => change(id, 'paused'), cancel: id => change(id, 'canceled'),
    resume: id => {
      if (getSnapshot().runs.some(run => run.status === 'running' && run.id !== id)) { notify('다른 데모가 진행 중입니다. 먼저 완료하거나 중단해 주세요.'); return; }
      change(id, 'running');
    },
    remove: id => update({ runs: getSnapshot().runs.filter(run => run.id !== id) }),
  }}>{children}</Context.Provider>;
}
export function useDemo() {
  const context = useContext(Context);
  if (!context) throw new Error('DemoProvider required');
  return context;
}
