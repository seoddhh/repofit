'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Bot, Check, Clipboard, FileText, Layers3, LoaderCircle, RefreshCw, ScanText, ShieldCheck, Sparkles, Trash2 } from 'lucide-react';
import type { UsageRun, UsageRunSummary } from '@/features/usage/usage-types';
import { UsageReport } from './usage-report';

const labels = { queued: '에이전트 실행 대기', running: '에이전트 분석 중', completed: '분석 완료', failed: '분석 중단', canceled: '취소됨' };
const date = (value: string) => new Date(value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
async function api<T>(method = 'GET', body?: unknown, id?: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/usage-analysis${id ? `?id=${encodeURIComponent(id)}` : ''}`, { method, cache: 'no-store', signal, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const result = await response.json() as T & { error?: string };
  if (!response.ok) throw Object.assign(new Error(result.error ?? '분석 요청을 처리하지 못했습니다.'), { status: response.status });
  return result;
}
function executionPrompt(id: string) {
  return `RepoFit의 에이전트 활용 분석을 실행해 줘. 분석 요약과 보고서를 내 계정에 30일 보관하는 데 동의해. start_usage_analysis에 id=${id}, consent=true를 전달하고 반환된 RepoFit 분석 스킬을 따라 진행해 줘. 내가 분석 조건이나 후보를 입력하는 대신, 접근 허용된 최근 작업 기록 최대 10개(한 개만 있어도 가능)와 확인 가능한 스킬 목록에서 사용 방식과 개선 기회를 도출해 줘. 접근하지 못한 과거 기록을 읽었다고 가정하지 마. submit_usage_analysis의 prepare로 요약을 제출해 실제 후보를 받고 complete로 근거·원인 추정·한계·활용법을 포함한 보고서를 제출해 줘. 대화 원문이나 비밀값은 사이트에 보내지 마.`;
}
export function UsageAnalysis({ initialRun = '' }: { initialRun?: string }) {
  const [view, setView] = useState<'new' | 'report'>('report');
  const [runs, setRuns] = useState<UsageRunSummary[]>([]);
  const [details, setDetails] = useState<Record<string, UsageRun>>({});
  const [selectedId, setSelectedId] = useState(initialRun);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [login, setLogin] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const result = await api<{ runs: UsageRunSummary[] }>();
      setRuns(result.runs); setLogin(false);
      setSelectedId(current => result.runs.some(r => r.id === current) ? current : result.runs[0]?.id ?? '');
    } catch (error) {
      if ((error as { status?: number }).status === 401) { setLogin(true); setRuns([]); setDetails({}); setSelectedId(''); }
      else setError(error instanceof Error ? error.message : '분석 기록을 불러오지 못했습니다.');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => { if (!document.hidden) void refresh(); }, 5000);
    return () => clearInterval(timer);
  }, [refresh]);
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
  async function copyRequest(id: string) {
    try { await navigator.clipboard.writeText(executionPrompt(id)); setCopied(true); setNotice('실행 요청을 복사했습니다. RepoFit에 연결된 에이전트 대화에 보내면 분석을 시작합니다.'); }
    catch { setError('복사할 수 없습니다. 아래 실행 요청을 직접 선택해 에이전트 대화에 보내 주세요.'); }
  }
  async function create(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice(''); setCopied(false);
    try {
      const result = await api<UsageRun>('POST', { consent });
      setRuns(current => [result, ...current.filter(r => r.id !== result.id)]); setDetails(current => ({ ...current, [result.id]: result })); setSelectedId(result.id); setConsent(false); setView('report');
      // This extension is provided only by compatible MCP UI hosts. An ordinary
      // website must never claim that preparing a DB row starts an agent.
      const host = (window as Window & { openai?: { sendFollowUpMessage?: (input: { prompt: string }) => Promise<unknown> } }).openai;
      if (host?.sendFollowUpMessage) {
        try { await host.sendFollowUpMessage({ prompt: executionPrompt(result.id) }); setNotice('호스트에 실행 요청을 전달했습니다. 에이전트가 시작하면 진행 상태가 바뀝니다.'); }
        catch { setNotice('실행 전달을 완료하지 못했습니다. 아래 요청을 에이전트 대화에 보내 주세요.'); }
      } else setNotice('분석 요청을 준비했습니다. 아래 요청을 RepoFit에 연결된 에이전트 대화에 보내면 분석이 시작됩니다.');
    } catch (error) { setError(error instanceof Error ? error.message : '분석 요청을 준비하지 못했습니다.'); }
    finally { setBusy(false); }
  }
  async function change(method: 'PATCH' | 'DELETE', id: string) {
    setBusy(true); setError('');
    try { await api(method, { id }); setDetails(current => { const next = { ...current }; delete next[id]; return next; }); await refresh(); } catch (error) { setError(error instanceof Error ? error.message : '요청을 처리하지 못했습니다.'); }
    finally { setBusy(false); }
  }
  return <>
    <div className="page-heading"><div><div className="eyebrow">나의 에이전트 활용 방식</div><h1>내 에이전트</h1><p>RepoFit 분석 스킬로 사용 방식을 살펴보고,<br/>근거와 활용 방법이 담긴 보고서를 받아보세요.</p></div><Link className="secondary-button" href="/skills">스킬 둘러보기 <ArrowRight size={16}/></Link></div>
    {error && <p className="field-error" role="alert">{error}</p>}
    {notice && <p className="inline-notice" role="status">{notice}</p>}
    <div className="agent-layout"><div className="agent-main">
      {!showReport && <section className="surface agent-request usage-analysis-start"><div className="usage-start-heading"><span className="usage-start-symbol"><Bot size={28}/></span><span className="usage-report-overline">REPOFIT · AGENT ANALYSIS</span><h2>입력할 조건 없이,<br/>작업 기록에서 시작합니다.</h2><p>내 에이전트가 RepoFit 분석 스킬을 실행합니다.<br/>사용 방식을 살펴보고, 필요한 기능과 활용법을 보고서로 정리합니다.</p></div>
        <div className="usage-start-outcomes"><div><ScanText size={19}/><strong>사용 방식</strong><span>잘 작동한 방법과 반복되는 흐름</span></div><div><Sparkles size={19}/><strong>개선 기회</strong><span>대표 근거와 원인 추정·한계</span></div><div><Layers3 size={19}/><strong>스킬 활용법</strong><span>필요한 기능과 실제 적용 방법</span></div></div>
        <form onSubmit={event => void create(event)}>
          <label className="coach-consent"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}/><span>에이전트가 접근 허용된 작업 기록을 분석하고, RepoFit에 원문 대신 근거 요약과 보고서를 30일 보관하는 데 동의합니다. 최근 최대 10개 대화를 사용하며, 한 개만 있어도 그 범위로 분석할 수 있습니다.</span></label>
          <div className="form-bottom"><button className="primary-button" disabled={busy || login || !consent}>{busy ? <LoaderCircle size={16} className="spin"/> : <Bot size={16}/>}에이전트 분석 요청 <ArrowRight size={16}/></button><span className="usage-start-privacy"><ShieldCheck size={14}/> 원문 대신 요약만 보관</span></div>
          {login && <p className="field-hint">상단의 ChatGPT 로그인 후 분석을 요청할 수 있습니다.</p>}
        </form>
        <div className="usage-start-note"><FileText size={17}/><p>요청을 에이전트 대화에 보내면 분석이 시작됩니다. 이미 RepoFit에 연결된 에이전트에서는 <strong>“내 에이전트 활용 분석해 줘”</strong>라고 바로 요청해도 됩니다.</p></div>
      </section>}
      {showReport && run?.executor === 'agent' && run.status === 'queued' && <section className="surface agent-handoff usage-analysis-handoff"><span className="usage-report-overline">NEXT · 에이전트에서 실행</span><div className="section-heading"><h2>이제 에이전트에 맡기세요.</h2><Bot size={24}/></div><p>조건과 후보를 고를 필요 없이, 아래 요청을 RepoFit에 연결된 에이전트 대화에 보내면 됩니다.</p><button className="primary-button" type="button" onClick={() => void copyRequest(run.id)}>{copied ? <Check size={15}/> : <Clipboard size={15}/>} {copied ? '복사됨' : '실행 요청 복사'}</button><details className="agent-disclosure"><summary>실행 요청 내용 보기</summary><pre>{executionPrompt(run.id)}</pre></details><p className="field-hint">아직 분석이 시작되지는 않았습니다. 에이전트가 요청을 받으면 아래에 진행 상황과 보고서가 표시됩니다.</p></section>}
      {showReport && (run ? <UsageReport key={run.id} run={run} busy={busy} onCancel={() => void change('PATCH', run.id)} onNew={() => { setView('new'); setNotice(''); }}/>: <section className="surface usage-report-loading" role="status"><LoaderCircle size={24} className="spin"/><p>저장된 보고서를 불러오고 있습니다.</p></section>)}
    </div><aside className="agent-aside"><section className="surface agent-setup"><div className="section-heading"><h2>내 분석 기록</h2><button className="icon-button" aria-label="분석 기록 새로고침" onClick={() => void refresh()}><RefreshCw size={15}/></button></div>{loading ? <p role="status">기록을 불러오고 있습니다.</p> : !runs.length ? <p>에이전트가 작성한 보고서가 여기에 남습니다.</p> : <ul className="usage-runs">{runs.map(r => <li key={r.id}><button className={r.id === selectedId ? 'selected' : ''} onClick={() => { setSelectedId(r.id); setView('report'); setNotice(''); }}><strong>{date(r.createdAt)}</strong><span>{labels[r.status]}</span></button><button className="icon-button" aria-label={`${date(r.createdAt)} 분석 삭제`} disabled={busy} onClick={() => void change('DELETE', r.id)}><Trash2 size={14}/></button></li>)}</ul>}</section>
      <section className="quiet-section"><h2>에이전트가 이렇게 분석합니다.</h2><ol className="purpose-steps"><li><span>1</span><div><strong>RepoFit 분석 스킬 실행</strong><p>허용된 작업 기록과 현재 구성을 확인합니다.</p></div></li><li><span>2</span><div><strong>근거에서 필요한 기능 도출</strong><p>관찰·원인 추정·개선 기회와 한계를 구분합니다.</p></div></li><li><span>3</span><div><strong>보고서 작성</strong><p>실제 후보와 비교하고 활용법까지 정리해 제출합니다.</p></div></li></ol></section>
      <details className="coach-method"><summary>분석 스킬과 MCP 연결</summary><a className="text-button" href="/skills/repofit-usage-analysis/SKILL.md" download="SKILL.md">활용 분석 스킬 문서</a><p>에이전트의 RepoFit MCP 연결을 사용합니다. 웹사이트 로그인은 에이전트 연결과 별개이며 모든 과거 기록에 대한 접근을 제공하지 않습니다.</p><p><Link href="/agent?mode=questionnaire">기존 설문 방식</Link></p></details>
    </aside></div>
  </>;
}
