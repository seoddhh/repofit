'use client';
import Link from 'next/link';
import type { CatalogEntry, CatalogSnapshot } from '@/lib/catalog-types';
import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Bot, Check, Clipboard, Download, FileText, LoaderCircle, Sparkles, Trash2, X } from 'lucide-react';
import { assessmentLabels, coachInputSchema, coachMarkdown, workKinds, workLabels, type ActivitySummary, type CoachInput, type CoachReport, type CoachCandidate } from '@/lib/coach-types';
import { chatGPTSignInPath } from '@/lib/chatgpt-auth-paths';
import type { LocalDevice } from '@/lib/local-agent-types';
import { LocalAgentInventory } from './local-agent-inventory';
import { uiCopy, uiText } from '@/lib/ui-copy';
import { downloadText } from './agent-workspace';

const date = (value: string) => new Date(value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const statusLabels = { ready: '초기 보고서', queued: '로컬 분석 대기', running: 'Codex 작성 중', completed: 'Codex 작성 완료', failed: '분석 실패, 기존 결과 유지', canceled: '분석 취소, 기존 결과 유지' };
async function reportApi<T>(method = 'GET', body?: unknown, path = '/api/agent-reports'): Promise<T> {
  const response = await fetch(path, { method, cache: 'no-store', headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw Object.assign(new Error(data.error ?? '보고서를 처리하지 못했습니다.'), { status: response.status });
  if (method === 'GET') {
    const list = data as T & { reports?: CoachReport[]; activities?: ActivitySummary[] };
    if (list.reports) list.reports = list.reports.map(displayReport);
    if (list.activities) list.activities = list.activities.map(activity => ({ ...activity, summary: uiCopy(activity.summary) }));
  } else if (data && typeof data === 'object' && 'narrative' in data) {
    Object.assign(data, displayReport(data as T & CoachReport));
  }
  return data;
}
function displayReport(report: CoachReport): CoachReport {
  return { ...report, message: uiText(report.message), narrative: uiCopy(report.narrative), bundle: {
    ...report.bundle, input: { ...report.bundle.input, goal: uiText(report.bundle.input.goal) },
    warnings: uiCopy(report.bundle.warnings), evidence: report.bundle.evidence.map(e => ({ ...e, detail: uiText(e.detail) })),
    candidates: report.bundle.candidates.map(c => ({ ...c, name: uiText(c.name), reasons: uiCopy(c.reasons), sourceEvidence: { ...c.sourceEvidence, warning: c.sourceEvidence.warning ? uiText(c.sourceEvidence.warning) : null } })),
  } };
}
export function AgentCoach({ initialSkill = '' }: { initialSkill?: string }) {
  const [catalogSkill, setCatalogSkill] = useState<CatalogEntry>();
  useEffect(() => {
    if (!initialSkill) return;
    const controller = new AbortController();
    fetch('/api/skill-catalog', { signal: controller.signal }).then(async r => r.ok ? await r.json() as CatalogSnapshot : null).then(data => { if (data && !controller.signal.aborted) setCatalogSkill(data.skills.find(s => s.id === initialSkill)); }).catch(() => {});
    return () => controller.abort();
  }, [initialSkill]);
  const [tab, setTab] = useState<'diagnosis' | 'recommendations' | 'history'>('diagnosis');
  const [device, setDevice] = useState<LocalDevice>();
  const [agent, setAgent] = useState<'codex' | 'claude'>('codex');
  const [includeInventory, setIncludeInventory] = useState(true);
  const onSelection = useCallback((next: LocalDevice | undefined, id: 'codex' | 'claude') => { setDevice(next); setAgent(id); }, []);
  const [work, setWork] = useState<CoachInput['work']>(['coding']);
  const [goal, setGoal] = useState('반복 작업을 줄이고 결과를 더 일관되게 확인하고 싶어요.');
  const [assessment, setAssessment] = useState<CoachInput['assessment']>({ goal: 'unknown', context: 'unknown', steps: 'unknown', validation: 'unknown', reuse: 'unknown' });
  const [reports, setReports] = useState<CoachReport[]>([]);
  const [activities, setActivities] = useState<ActivitySummary[]>([]);
  const [activityIds, setActivityIds] = useState<string[]>([]);
  useEffect(() => { setActivityIds(current => current.filter(id => activities.some(a => a.id === id && a.deviceId === device?.id))); }, [activities, device?.id]);
  const [selectedId, setSelectedId] = useState('');
  const [error, setError] = useState('');
  const [login, setLogin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [consent, setConsent] = useState('');
  const selected = reports.find(r => r.id === selectedId) ?? reports[0];
  const refresh = useCallback(async () => {
    try { const [data, activity] = await Promise.all([reportApi<{ reports: CoachReport[] }>(), reportApi<{ activities: ActivitySummary[] }>('GET', undefined, '/api/agent-activity')]); setReports(data.reports); setActivities(activity.activities); setLogin(false); }
    catch (error) { if ((error as { status?: number }).status === 401) { setLogin(true); setReports([]); setActivities([]); } else setError((error as Error).message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const pending = reports.some(r => ['queued', 'running'].includes(r.status));
  useEffect(() => { if (!pending) return; const timer = setInterval(() => { void refresh(); }, 5000); return () => clearInterval(timer); }, [pending, refresh]);
  async function create(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const validSkill = /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(initialSkill);
      const input = coachInputSchema.parse({ deviceId: includeInventory && device?.inventory ? device.id : null, agent, work, goal, assessment, activityIds: includeInventory && device?.inventory ? activityIds.filter(id => activities.some(a => a.id === id && a.deviceId === device.id)) : [], ...(validSkill ? { candidateId: initialSkill } : {}) });
      const result = await reportApi<CoachReport>('POST', input);
      setReports(current => [result, ...current]); setSelectedId(result.id); setTab('recommendations');
    } catch (error) { setError(error instanceof Error ? error.message : '입력을 확인해 주세요.'); }
    finally { setBusy(false); }
  }
  async function action(body: unknown) {
    setBusy(true); setError('');
    try { const result = await reportApi<CoachReport>('PATCH', body); setReports(current => current.map(r => r.id === result.id ? result : r)); }
    catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  }
  async function remove(id: string) {
    setBusy(true); setError('');
    try { await reportApi('DELETE', { id }); setReports(current => current.filter(r => r.id !== id)); if (selectedId === id) setSelectedId(''); }
    catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  }
  async function removeActivity(id: string) {
    setBusy(true); setError('');
    try { await reportApi('DELETE', { id }, '/api/agent-activity'); setActivityIds(current => current.filter(value => value !== id)); await refresh(); }
    catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  }
  return <>
    <div className="page-heading"><div><div className="eyebrow">YOUR AGENT, BETTER TOGETHER</div><h1>내 에이전트</h1><p>나의 사용 방식을 살펴보고,<br/>에이전트를 더 잘 활용하는 방법을 찾아보세요.</p></div><Link className="secondary-button" href="/skills"><Sparkles size={16}/> 스킬 둘러보기 <ArrowRight size={15}/></Link></div>
    {catalogSkill && <section className="catalog-personal-note coach-catalog-context"><div><span className="eyebrow">선택한 스킬</span><h3>{catalogSkill.name}</h3><p>{catalogSkill.explanation.summary}</p><p>이 스킬이 도움이 될지 현재 목표와 기존 구성을 함께 비교합니다.</p></div><Link className="text-button" href={`/skills?skill=${encodeURIComponent(catalogSkill.id)}`}>설명 다시 보기 <ArrowRight size={15}/></Link></section>}
    <section className="coach-intro surface"><Bot size={26}/><div><strong>{device?.inventory ? `${agent === 'codex' ? 'Codex' : 'Claude Code'}, ${device.inventory.project ? '프로젝트 구성' : '개인 에이전트'}` : '프로젝트 없이, 나의 에이전트부터'}</strong><p>{device?.inventory ? `${device.lastSeenAt && Date.now() - Date.parse(device.lastSeenAt) < 150000 ? '연결됨' : '오프라인 상태의 마지막 목록'}, ${date(device.inventory.observedAt)} 확인. 인식과 실제 사용은 다릅니다.` : '관심 작업과 사용 습관으로 시작하고, 로컬 연결로 내 스킬 구성도 비교하세요.'}</p></div></section>
    <details className="coach-connection"><summary>Codex 연결과 내 스킬 목록</summary><LocalAgentInventory onSelection={onSelection}/></details>
    <nav className="coach-tabs" aria-label="내 에이전트 보기">{([['diagnosis', '활용 진단'], ['recommendations', '추천과 적용 가이드'], ['history', '보고서 기록']] as const).map(([id, label]) => <button key={id} aria-current={tab === id ? 'page' : undefined} className={tab === id ? 'selected' : ''} onClick={() => setTab(id)}>{label}{id === 'history' && <span>{reports.length}</span>}</button>)}</nav>
    {error && <p className="field-error coach-error" role="alert">{error}</p>}
    {login && <div className="inline-notice"><p>로그인하면 보고서를 생성하고 30일 동안 보관할 수 있습니다.</p><a className="secondary-button" href={chatGPTSignInPath('/agent')} target="_top">로그인</a></div>}
    {tab === 'diagnosis' && <div className="agent-layout"><section className="surface agent-request coach-form"><div className="section-heading"><div><h2>어떤 일을 더 잘하고 싶나요?</h2><p className="field-hint">프로젝트 등록 없이 나의 작업 방식부터 살펴봅니다.</p></div><Sparkles size={20}/></div><form onSubmit={event => void create(event)}>
      <fieldset className="coach-work"><legend className="field-label">자주 맡기는 작업은 최대 3개까지 선택하세요.</legend>{workKinds.map(kind => <label key={kind} className={work.includes(kind) ? 'selected' : ''}><input type="checkbox" checked={work.includes(kind)} disabled={!work.includes(kind) && work.length >= 3} onChange={event => setWork(current => event.target.checked ? [...current, kind] : current.filter(v => v !== kind))}/>{workLabels[kind]}</label>)}</fieldset>
      <label className="field-label" htmlFor="coach-goal">현재 불편한 점과 원하는 도움</label><textarea id="coach-goal" required maxLength={1600} rows={3} value={goal} onChange={e => setGoal(e.target.value)} placeholder="예: 에이전트가 만든 코드의 검증을 자꾸 빠뜨려요."/>
      <fieldset className="coach-assessment"><legend className="field-label">나의 사용 습관</legend>{Object.entries(assessmentLabels).map(([axis, label]) => <label key={axis}><span>{label}</span><select aria-label={label} value={assessment[axis as keyof typeof assessment]} onChange={e => setAssessment(current => ({ ...current, [axis]: e.target.value }))}><option value="unknown">아직 잘 모르겠어요</option><option value="usually">대체로 그래요</option><option value="sometimes">가끔 그래요</option></select></label>)}</fieldset>
      <label className="coach-consent"><input type="checkbox" disabled={!device?.inventory} checked={includeInventory && !!device?.inventory} onChange={e => setIncludeInventory(e.target.checked)}/><span>연결된 환경의 스킬 목록을 함께 비교하기</span></label>
      <details className="coach-method"><summary>선택한 사용 사례로 진단 보완하기</summary><p>로컬 연결 명령 끝에 <code>--select-history</code>를 추가하면 터미널에서 과거 기록을 하나 선택할 수 있습니다. 모델 요약과 사이트 전송을 각각 확인하며 원문 대화는 사이트에 보내지 않습니다.</p><button className="text-button" type="button" onClick={() => void refresh()}>공유한 사례 새로 확인</button>{activities.filter(a => a.deviceId === device?.id).map(a => <div className="coach-activity" key={a.id}><label><input type="checkbox" checked={activityIds.includes(a.id)} disabled={!includeInventory || (!activityIds.includes(a.id) && activityIds.length >= 5)} onChange={e => setActivityIds(current => e.target.checked ? [...current, a.id] : current.filter(id => id !== a.id))}/><span>{date(a.createdAt)}, {a.summary.work.map(w => workLabels[w]).join(', ')}, 로컬 요약</span></label><details><summary>요약 보기</summary><ul>{a.summary.findings.map((f, i) => <li key={i}>{f.finding}</li>)}</ul></details><button type="button" className="text-button" disabled={busy} onClick={() => void removeActivity(a.id)}>사례와 파생 보고서 삭제</button></div>)}<p>선택한 환경의 사례를 최대 5개 포함합니다. 사례 삭제 시 해당 사례를 사용한 보고서도 삭제됩니다.</p></details>
      {initialSkill && <p className="field-hint">카탈로그에서 선택한 후보: {initialSkill}</p>}
      <p className="field-hint">저장된 스킬 설명을 목표와 비교합니다. 자기 응답과 개인 스킬은 skills.sh나 GitHub에 보내지 않습니다.</p>
      <div className="form-bottom"><button className="primary-button" disabled={busy || login || !work.length}>{busy ? <LoaderCircle size={16} className="spin"/> : <FileText size={16}/>} 활용 보고서 만들기</button></div>
    </form></section><aside className="agent-aside"><section className="surface agent-setup"><h2>보고서에서 알 수 있어요</h2><ol className="purpose-steps"><li><span>1</span><div><strong>먼저 바꿔볼 사용 습관</strong><p>목표 전달, 문맥, 진행, 결과 확인을 살펴봅니다.</p></div></li><li><span>2</span><div><strong>나에게 맞는 스킬과 이유</strong><p>원문을 확인한 스킬 설명과 현재 구성을 비교합니다.</p></div></li><li><span>3</span><div><strong>적용 방법과 작은 실습</strong><p>기대 효과를 살펴보고 직접 확인할 기준을 받습니다.</p></div></li></ol></section><div className="capability-note"><Bot size={18}/><p>자가 진단은 실제 사용 기록 분석과 다릅니다. 스킬 개수로 숙련도를 매기지 않습니다.</p></div></aside></div>}
    {tab === 'history' && <section className="surface coach-history"><h2>보고서 기록</h2><p className="field-hint">30일간 조회할 수 있습니다. 필요할 때 내려받거나 삭제하세요.</p>{loading ? <p role="status">기록을 확인하고 있습니다.</p> : reports.length ? reports.map(report => <div key={report.id} className="coach-history-row"><button onClick={() => { setSelectedId(report.id); setConsent(''); setTab('recommendations'); }}><strong>{report.bundle.input.work.map(v => workLabels[v]).join(', ')}</strong><span>{date(report.createdAt)}, {statusLabels[report.status]}</span><p>{report.bundle.input.goal}</p></button><button className="icon-button" aria-label={`${date(report.createdAt)} 보고서 삭제`} disabled={busy} onClick={() => void remove(report.id)}><Trash2 size={16}/></button></div>) : <div className="agent-empty"><FileText size={30}/><h3>아직 만든 보고서가 없어요.</h3><button className="text-button" onClick={() => setTab('diagnosis')}>활용 진단 시작 <ArrowRight size={14}/></button></div>}</section>}
    {tab === 'recommendations' && (selected ? <>
      <section className="surface coach-run"><div className="section-heading"><div><span className="eyebrow">{statusLabels[selected.status]}</span><h2>나의 에이전트 활용 보고서</h2></div><button className="secondary-button" onClick={() => downloadText(`repofit-coach-${selected.id}.md`, coachMarkdown(selected), 'text/markdown;charset=utf-8')}><Download size={15}/> 내려받기</button></div><p role="status">{selected.message}</p>
        {['queued', 'running'].includes(selected.status) ? <button className="text-button" disabled={busy} onClick={() => void action({ action: 'cancel', id: selected.id })}><X size={15}/> 로컬 분석 취소</button> : selected.deviceId && selected.bundle.input.agent === 'codex' ? <><label className="coach-consent"><input type="checkbox" checked={consent === selected.id} onChange={e => setConsent(e.target.checked ? selected.id : '')}/><span>자기 응답과 스킬 목록, 공개 후보를 로컬 Codex 분석에 전달합니다. 모델 서비스로 전송될 수 있으며 로컬 인증과 이용 한도가 적용됩니다.</span></label><button className="primary-button" disabled={busy || consent !== selected.id} onClick={() => void action({ action: 'queue', id: selected.id, consent: true })}><Bot size={16}/> Codex로 맞춤 보고서 작성</button><p className="field-hint">기존 대화와 개인 MCP 설정을 사용하지 않는 읽기 전용 보고서 실행입니다. 원본 자료를 확인한 초기 보고서도 아래에서 볼 수 있습니다.</p></> : <p className="field-hint">초기 진단입니다. Codex를 연결한 뒤 목록을 포함한 새 보고서를 만들면 로컬 맞춤 분석을 요청할 수 있습니다.</p>}
      </section>
      <section className="surface agent-report coach-report"><p className="coach-byline">{selected.author === 'codex' ? '로컬 Codex 작성' : '자기 응답에 따른 규칙 기반 초기 진단'}, {date(selected.createdAt)} KST</p><p className="agent-report-summary">{selected.narrative.summary}</p><div className="coach-dimensions">{selected.narrative.dimensions.map(d => <div key={d.axis}><strong>{assessmentLabels[d.axis]}</strong><p>{d.finding}</p><small>근거: {d.evidenceIds.join(', ')}, {d.confidence === 'low' ? '제한적 근거' : '추가 확인 필요'}</small></div>)}</div><div className="integration-section"><h3>먼저 바꿔볼 습관</h3>{selected.narrative.habits.map((habit, i) => <div className="coach-habit" key={i}><strong>{habit.action}</strong><CopyPrompt text={habit.examplePrompt}/></div>)}</div>
        <div className="integration-section"><h3>나에게 맞는 스킬과 적용 방법</h3><p className="field-hint">관심 작업 관련성으로 추린 검토 후보입니다. 실제 환경 호환성은 적용 전에 확인하세요.</p>{selected.narrative.recommendations.length ? selected.narrative.recommendations.map(rec => <SkillRecommendation key={`${selected.id}:${rec.catalogSkillId}`} candidate={selected.bundle.candidates.find(c => c.id === rec.catalogSkillId)!} recommendation={rec} feedback={selected.feedback[rec.catalogSkillId]} busy={busy} save={(outcome, note) => action({ action: 'feedback', id: selected.id, skillId: rec.catalogSkillId, outcome, note })}/>) : <p className="coach-empty">근거를 갖춰 추천할 후보가 없습니다. 기존 스킬과 사용 습관부터 개선해 보세요.</p>}</div>
        <details className="coach-method"><summary>후보 확인 결과와 추천 판단 방식</summary><p>저장된 스킬 설명과 해결 대상 문제 확인 → 관심 작업과 목표 비교 → 같은 이름의 기존 스킬 확인. 공개 페이지 자료와 GitHub 커밋 자료는 구분합니다. 설치 집계는 점수에서 제외합니다. 의미상 중복 및 충돌과 실행 호환성은 추가 확인이 필요합니다.</p>{selected.bundle.candidates.map(c => <div key={c.id}><a href={c.url} target="_blank" rel="noreferrer">{c.name}</a><span>, {c.sourceEvidence.status === 'verified' ? '원본 확인' : '원본을 확인하지 못해 추천에서 제외'}</span>{c.sourceEvidence.status === 'unverified' && <p>{c.sourceEvidence.warning}</p>}<ul>{c.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul></div>)}</details>
        <details className="coach-method"><summary>분석 근거와 확인 범위</summary><p>{selected.bundle.activityCount ? `선택한 사례 ${selected.bundle.activityCount}개의 로컬 요약을 포함했습니다. 원문과 전체 호출 이력은 저장하지 않았습니다.` : '실제 대화 기록과 스킬 호출 이력은 수집하지 않았습니다.'}</p><ul>{selected.bundle.evidence.map(e => <li key={e.id}><strong>{e.id}</strong>, {e.kind === 'observed' ? '자료 확인' : e.kind === 'inferred' ? '사례 요약에서 추정' : '자기 응답'}: {e.detail}</li>)}</ul></details>
        <div className="integration-section"><h3>확인 범위와 한계</h3><ul className="agent-report-list">{[...selected.bundle.warnings, ...selected.narrative.limitations].map((item, i) => <li key={i}>{item}</li>)}</ul></div>
      </section>
    </> : <section className="surface agent-empty"><Sparkles size={32}/><h3>나의 작업에 맞는 추천을 받아보세요.</h3><p>활용 진단을 작성하면 보고서와 적용 가이드가 여기에 나타납니다.</p><button className="primary-button" onClick={() => setTab('diagnosis')}>활용 진단 시작 <ArrowRight size={15}/></button></section>)}
  </>;
}
function CopyPrompt({ text }: { text: string }) {
  const [message, setMessage] = useState('');
  return <div className="coach-prompt"><p>{text}</p><button className="text-button" onClick={async () => { try { await navigator.clipboard.writeText(text); setMessage('복사했어요'); } catch { setMessage('텍스트를 직접 선택해 복사하세요'); } }}>{message === '복사했어요' ? <Check size={14}/> : <Clipboard size={14}/>} {message || '요청 복사'}</button></div>;
}
function SkillRecommendation({ candidate: c, recommendation: r, feedback, busy, save }: { candidate: CoachCandidate; recommendation: CoachReport['narrative']['recommendations'][number]; feedback?: CoachReport['feedback'][string]; busy: boolean; save: (outcome: 'helpful' | 'not_helpful' | 'not_tried', note: string) => Promise<void> }) {
  const [outcome, setOutcome] = useState(feedback?.outcome ?? 'not_tried');
  const [note, setNote] = useState(feedback?.note ?? '');
  return <article className="coach-recommendation"><div className="section-heading"><h3><a href={c.url} target="_blank" rel="noreferrer">{c.name} ↗</a></h3><span className="coach-badge">{c.relation === 'use_existing' ? '기존 스킬 먼저 활용' : '적합성 검토 후보'}</span></div><p>{r.reason}</p><p className="field-hint">원본 확인, 실행 호환성 미확인, 라이선스 {c.sourceEvidence.license ?? '확인 필요'}</p><div className="coach-guide"><div><h4>적용 방법</h4><ol>{r.steps.map((s, i) => <li key={i}>{s}</li>)}</ol><h4>필요한 준비</h4><ul>{r.prerequisites.map((s, i) => <li key={i}>{s}</li>)}</ul></div><div><h4>적용 후 기대하는 변화</h4><ul>{r.expectedBenefits.map((s, i) => <li key={i}>{s}</li>)}</ul><h4>작은 실습과 확인 기준</h4><p>{r.exercise}</p><ul>{r.checks.map((s, i) => <li key={i}>{s}</li>)}</ul></div></div><CopyPrompt text={r.examplePrompt}/><details className="coach-method"><summary>확인한 소스와 버전</summary><a className="text-button" href={c.sourceEvidence.url!} target="_blank" rel="noreferrer">SKILL.md 원본 ↗</a><p>{c.sourceEvidence.kind === 'skills_sh_snapshot' ? `공개 원문 ${c.sourceEvidence.checkedAt ? date(c.sourceEvidence.checkedAt) : ''} KST 확인, SHA256 ${c.sourceEvidence.hash?.slice(0, 12)}` : `커밋 ${c.sourceEvidence.revision}`}</p><p>{c.sourceEvidence.warning}</p></details><div className="coach-feedback"><label>실습 후 어땠나요?<select value={outcome} onChange={e => setOutcome(e.target.value as typeof outcome)}><option value="not_tried">아직 사용하지 않았어요</option><option value="helpful">도움이 됐어요</option><option value="not_helpful">효과를 느끼지 못했어요</option></select></label><textarea aria-label={`${c.name} 실습 메모`} placeholder="확인한 결과나 다시 작업한 이유를 남겨보세요." maxLength={1000} rows={2} value={note} onChange={e => setNote(e.target.value)}/><button className="secondary-button" disabled={busy} onClick={() => void save(outcome, note)}>평가 저장</button>{feedback && <span className="field-hint">저장된 자기 평가입니다. 실행 및 효과 자동 검증은 아닙니다.</span>}</div></article>;
}
