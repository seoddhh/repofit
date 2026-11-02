'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Bot, Check, LoaderCircle, RefreshCw, Search, Trash2, X } from 'lucide-react';
import { LocalAgentInventory } from './local-agent-inventory';
import type { LocalDevice } from '@/lib/local-agent-types';
import type { CatalogEntry, CatalogSnapshot } from '@/lib/catalog-types';
import type { UsageRun, UsageRunSummary } from '@/lib/usage-types';
import { chatGPTSignInPath } from '@/lib/chatgpt-auth-paths';
import { UsageReport } from './usage-report';

const labels = { queued: '분석 대기', running: 'Codex 분석 중', completed: '분석 완료', failed: '분석 중단', canceled: '취소됨' };
const date = (value: string) => new Date(value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
async function api<T>(method = 'GET', body?: unknown, id?: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/usage-analysis${id ? `?id=${encodeURIComponent(id)}` : ''}`, { method, cache: 'no-store', signal, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const result = await response.json() as T & { error?: string };
  if (!response.ok) throw Object.assign(new Error(result.error ?? '분석 요청을 처리하지 못했습니다.'), { status: response.status });
  return result;
}
export function UsageAnalysis({ initialSkill = '', initialRun = '', initialRepository = '' }: { initialSkill?: string; initialRun?: string; initialRepository?: string }) {
  const [view, setView] = useState<'new' | 'report'>(initialSkill || initialRepository ? 'new' : 'report');
  const [device, setDevice] = useState<LocalDevice>();
  const [agent, setAgent] = useState('codex');
  const onSelection = useCallback((d: LocalDevice | undefined, id: 'codex' | 'claude') => { setDevice(d); setAgent(id); }, []);
  const [runs, setRuns] = useState<UsageRunSummary[]>([]);
  const [details, setDetails] = useState<Record<string, UsageRun>>({});
  const [selectedId, setSelectedId] = useState(initialRun);
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [chosen, setChosen] = useState<string[]>(initialSkill ? [initialSkill] : []);
  const [query, setQuery] = useState('');
  const [goal, setGoal] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [login, setLogin] = useState(false);
  const [error, setError] = useState('');
  const [catalogError, setCatalogError] = useState('');
  const [repository, setRepository] = useState(initialRepository);
  const refresh = useCallback(async () => {
    try {
      const result = await api<{ runs: UsageRunSummary[] }>();
      setRuns(result.runs); setLogin(false); setError('');
      setSelectedId(current => result.runs.some(r => r.id === current) ? current : result.runs[0]?.id ?? '');
    } catch (error) {
      if ((error as { status?: number }).status === 401) { setLogin(true); setRuns([]); }
      else setError(error instanceof Error ? error.message : '분석 기록을 불러오지 못했습니다.');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => { if (!document.hidden) void refresh(); }, 5000);
    return () => clearInterval(timer);
  }, [refresh]);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/skill-catalog', { signal: controller.signal }).then(async r => {
      if (!r.ok) throw new Error('스킬 후보를 불러오지 못했습니다. 페이지를 새로고침해 주세요.');
      return await r.json() as CatalogSnapshot;
    }).then(data => {
      if (controller.signal.aborted) return;
      setCatalog(data.skills);
      if (initialRepository && !initialSkill) setChosen(data.skills.filter(s => s.source.toLowerCase() === initialRepository.toLowerCase()).slice(0, 5).map(s => s.id));
    }).catch(e => { if (!controller.signal.aborted) setCatalogError(e.message); });
    return () => controller.abort();
  }, [initialRepository, initialSkill]);
  const selectedRevision = runs.find(r => r.id === selectedId)?.revision;
  useEffect(() => {
    if (!selectedId || selectedRevision === undefined) return;
    const controller = new AbortController();
    api<UsageRun>('GET', undefined, selectedId, controller.signal).then(run => {
      if (!controller.signal.aborted) setDetails(current => ({ ...current, [run.id]: run }));
    }).catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [selectedId, selectedRevision]);
  const run = details[selectedId];
  const showReport = view === 'report' && Boolean(selectedId);
  const unavailableRepository = repository && catalog.length > 0 && !catalog.some(s => s.source.toLowerCase() === repository.toLowerCase());
  const active = device?.lastSeenAt && Date.now() - Date.parse(device.lastSeenAt) < 150000;
  const capable = active && agent === 'codex' && device?.inventory?.capabilities?.includes('usage-analysis-v1');
  async function create(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const result = await api<UsageRun>('POST', { deviceId: device?.id, goal, selectedSkillIds: chosen, consent, historyScope: 'recent-10' });
      setRuns(current => [result, ...current]); setDetails(current => ({ ...current, [result.id]: result })); setSelectedId(result.id); setConsent(false); setView('report');
    } catch (error) { setError(error instanceof Error ? error.message : '분석을 시작하지 못했습니다.'); }
    finally { setBusy(false); }
  }
  async function change(method: 'PATCH' | 'DELETE', id: string) {
    setBusy(true); setError('');
    try { await api(method, { id }); await refresh(); } catch (error) { setError(error instanceof Error ? error.message : '요청을 처리하지 못했습니다.'); }
    finally { setBusy(false); }
  }
  const choices = query.trim() ? catalog.filter(s => `${s.name} ${s.explanation.summary}`.toLowerCase().includes(query.toLowerCase())).slice(0, 12) : [];
  return <>
    <div className="page-heading"><div><div className="eyebrow">나의 에이전트 활용 방식</div><h1>내 에이전트</h1><p>최근 작업에서 사용 방식을 살펴보고,<br/>나에게 필요한 스킬과 활용 방법을 찾아보세요.</p></div><Link className="secondary-button" href="/skills">스킬 둘러보기 <ArrowRight size={16}/></Link></div>
    {!showReport && <section className="surface coach-intro"><Bot size={27}/><div><strong>내 Codex가 최근 대화를 분석합니다.</strong><p>연결한 Mac에서 새 Codex를 실행합니다. 최근 최대 10개 대화에서 맡기는 일과 진행·검증 방식을 읽고, 스킬이 필요한 이유와 실제 활용법을 정리합니다.</p></div></section>}
    <div hidden={showReport}><details className="coach-connection"><summary>Mac 연결과 내 스킬 목록</summary><LocalAgentInventory usageAnalysis onSelection={onSelection}/></details></div>
    {login && <div className="inline-notice"><p>로그인 후 본인의 Mac을 연결하고 분석 결과를 보관하세요.</p><a className="secondary-button" href={chatGPTSignInPath('/agent')} target="_top">ChatGPT로 로그인</a></div>}
    {error && <p className="field-error" role="alert">{error}</p>}
    <div className="agent-layout"><div className="agent-main">
      {!showReport && <section className="surface agent-request"><div className="section-heading"><h2>에이전트 활용 분석</h2><span className="subtle-badge">최근 대화 최대 10개</span></div>
        <form onSubmit={event => void create(event)}>
          <label className="field-label" htmlFor="usage-goal">특히 살펴볼 부분 <span>선택</span></label><textarea id="usage-goal" rows={2} maxLength={1000} placeholder="비워 두면 최근 작업에서 사용 방식을 분석합니다." value={goal} onChange={e => setGoal(e.target.value)}/>
          <label className="field-label" htmlFor="usage-search">비교할 스킬 <span>선택</span></label>
          <p className="field-hint">RepoFit에서 고른 스킬을 먼저 비교합니다. 후보를 고르지 않으면 관찰한 사용 방식에 맞춰 탐색합니다.</p>
          {catalogError && <p className="field-error">{catalogError}</p>}
          {unavailableRepository && <div className="inline-notice warning"><p>{repository}에 해당하는 등록 스킬을 찾지 못했습니다. 일반 오픈소스는 프로젝트 도입 검토에서 확인할 수 있습니다.</p><Link className="text-button" href={`/project?mode=agent&candidate=${encodeURIComponent(repository)}`}>프로젝트에서 검토</Link><button type="button" className="text-button" onClick={() => setRepository('')}>후보 없이 활용 분석하기</button></div>}
          <label className="catalog-search"><Search size={17}/><input id="usage-search" placeholder="스킬 이름이나 필요한 작업 검색" maxLength={100} value={query} onChange={e => setQuery(e.target.value)}/></label>
          <ul className="usage-choices">{choices.map(s => <li key={s.id}><button type="button" disabled={!chosen.includes(s.id) && chosen.length >= 5} onClick={() => setChosen(current => current.includes(s.id) ? current.filter(id => id !== s.id) : [...current, s.id])}>{chosen.includes(s.id) && <Check size={14}/>} {s.name}<small>{s.source}</small></button></li>)}</ul>
          {chosen.map(id => <div className="usage-selected" key={id}><span>{catalog.find(s => s.id === id)?.name ?? id}</span><button type="button" className="icon-button" aria-label={`${id} 선택 해제`} onClick={() => setChosen(current => current.filter(v => v !== id))}><X size={14}/></button></div>)}
          <label className="coach-consent"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}/><span>최근 Codex 대화 최대 10개의 일부를 로컬에서 읽어 분석합니다. 입력은 내 Codex 모델 서비스에 전달될 수 있으며 내 이용 한도가 적용됩니다. RepoFit에는 원문 대신 근거 요약과 추천 결과를 30일 저장합니다.</span></label>
          {!capable && !login && <p className="field-hint">위 ‘Mac 연결과 내 스킬 목록’을 열고 활용 분석 연결 프로그램을 실행해 주세요. 기존 프로그램은 --usage-analysis 옵션으로 다시 연결해야 합니다.</p>}
          <div className="form-bottom"><button className="primary-button" disabled={busy || login || !capable || !consent || Boolean(unavailableRepository) || Boolean(catalogError) || runs.some(r => r.deviceId === device?.id && ['queued', 'running'].includes(r.status))}>{busy ? <LoaderCircle size={16} className="spin"/> : <Bot size={16}/>}내 Codex로 분석 시작</button></div>
        </form>
      </section>}
      {showReport && (run ? <UsageReport key={run.id} run={run} busy={busy} onCancel={() => void change('PATCH', run.id)} onNew={() => setView('new')}/> : <section className="surface usage-report-loading" role="status"><LoaderCircle size={24} className="spin"/><p>저장된 보고서를 불러오고 있습니다.</p></section>)}
    </div><aside className="agent-aside"><section className="surface agent-setup"><div className="section-heading"><h2>내 분석 기록</h2><button className="icon-button" aria-label="분석 기록 새로고침" onClick={() => void refresh()}><RefreshCw size={15}/></button></div>{loading ? <p role="status">기록을 불러오고 있습니다.</p> : !runs.length ? <p>분석을 시작하면 진행 상황과 결과가 여기에 남습니다.</p> : <ul className="usage-runs">{runs.map(r => <li key={r.id}><button className={r.id === selectedId ? 'selected' : ''} onClick={() => { setSelectedId(r.id); setView('report'); }}><strong>{date(r.createdAt)}</strong><span>{labels[r.status]}</span></button><button className="icon-button" aria-label={`${date(r.createdAt)} 분석 삭제`} disabled={busy} onClick={() => void change('DELETE', r.id)}><Trash2 size={14}/></button></li>)}</ul>}</section>
      <section className="quiet-section"><button type="button" className="secondary-button" onClick={() => setView('new')}>새 분석 만들기 <ArrowRight size={15}/></button><h2>분석은 이렇게 이어집니다.</h2><ol className="purpose-steps"><li><span>1</span><div><strong>최근 작업 확인</strong><p>연결한 Mac에서 대화 최대 10개를 읽습니다.</p></div></li><li><span>2</span><div><strong>사용 방식 분석</strong><p>새 Codex가 요청·진행·검증 방식을 비교합니다.</p></div></li><li><span>3</span><div><strong>스킬 적합성 검토</strong><p>필요한 기능을 기준으로 고른 스킬과 활용법을 정리합니다.</p></div></li></ol></section>
      <details className="coach-method"><summary>분석 스킬과 다른 방법</summary><a className="text-button" href="/skills/repofit-usage-analysis/SKILL.md" download="SKILL.md">활용 분석 스킬 문서</a><p><Link href="/agent?mode=questionnaire">기존 설문과 선택 사례로 보고서 만들기</Link></p><p>이 연결 프로그램은 RepoFit MCP로 본인 기기에 배정된 요청을 읽고 결과를 제출합니다. 연결을 해제하면 새 작업을 받을 수 없습니다.</p></details>
    </aside></div>
  </>;
}
