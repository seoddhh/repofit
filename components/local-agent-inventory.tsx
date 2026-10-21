'use client';
import { useCallback, useEffect, useState } from 'react';
import { Check, Clipboard, FolderGit2, Laptop, LoaderCircle, PlugZap, RefreshCw, Search, Unplug } from 'lucide-react';
import { chatGPTSignInPath } from '@/lib/chatgpt-auth-paths';
import type { LocalDevice, LocalDeviceList, LocalPairing, LocalSkill } from '@/lib/local-agent-types';

const agentNames = { codex: 'Codex', claude: 'Claude Code' };
const scopes = { project: '프로젝트', user: '개인', plugin: '플러그인', system: '시스템' };
const statuses: Record<LocalSkill['status'], string> = { recognized: '에이전트 인식', configured: '설정 확인', disabled: '비활성', shadowed: '다른 스킬 우선', unverified: '인식 미확인' };
const shellQuote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
const time = (value: string) => new Date(value).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
async function api<T>(method = 'GET', data?: unknown): Promise<T> {
  const response = await fetch('/api/local-agent', { method, cache: 'no-store', headers: data ? { 'Content-Type': 'application/json' } : {}, ...(data ? { body: JSON.stringify(data) } : {}) });
  const result = await response.json() as T & { error?: string };
  if (!response.ok) throw Object.assign(new Error(result.error ?? '기기 목록을 조회하지 못했습니다.'), { status: response.status });
  return result;
}

export function LocalAgentInventory() {
  const [devices, setDevices] = useState<LocalDevice[]>([]);
  const [selected, setSelected] = useState('');
  const [agentId, setAgentId] = useState<'codex' | 'claude'>('codex');
  const [pairing, setPairing] = useState<LocalPairing | null>(null);
  const [projectPath, setProjectPath] = useState('');
  const [origin, setOrigin] = useState('');
  const [error, setError] = useState('');
  const [loginRequired, setLoginRequired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [limit, setLimit] = useState(50);
  const [copied, setCopied] = useState('');
  const [now, setNow] = useState(0);
  const refresh = useCallback(async () => {
    try {
      const data = await api<LocalDeviceList>();
      setDevices(data.devices); setLoginRequired(false); setError('');
      setSelected(current => data.devices.some(device => device.id === current) ? current : data.devices.find(device => device.inventory)?.id ?? data.devices[0]?.id ?? '');
      setNow(Date.now());
    } catch (error) {
      setError(error instanceof Error ? error.message : '목록 조회에 실패했습니다.');
      if ((error as { status?: number }).status === 401) { setLoginRequired(true); setDevices([]); setPairing(null); }
    } finally { setLoading(false); }
  }, []);
  useEffect(() => {
    setOrigin(window.location.origin);
    void refresh();
    const timer = setInterval(() => { if (!document.hidden) void refresh(); }, 10000);
    return () => clearInterval(timer);
  }, [refresh]);
  useEffect(() => {
    if (pairing && devices.some(device => device.id === pairing.id && device.lastSeenAt)) { setSelected(pairing.id); setPairing(null); }
  }, [devices, pairing]);
  async function connect() {
    setBusy(true); setError('');
    try { const next = await api<LocalPairing>('POST'); setPairing(next); await refresh(); }
    catch (error) { setError(error instanceof Error ? error.message : '연결 코드를 만들지 못했습니다.'); }
    finally { setBusy(false); }
  }
  async function disconnect(id: string) {
    setBusy(true); setError('');
    try { await api('DELETE', { id }); if (pairing?.id === id) setPairing(null); await refresh(); }
    catch (error) { setError(error instanceof Error ? error.message : '연결을 해제하지 못했습니다.'); }
    finally { setBusy(false); }
  }
  async function copy(value: string, key: string) {
    try { await navigator.clipboard.writeText(value); setCopied(key); }
    catch { setError('복사할 수 없습니다. 표시된 내용을 직접 선택해 복사해 주세요.'); }
  }
  const device = devices.find(item => item.id === selected);
  const inventory = device?.inventory;
  const agent = inventory?.agents.find(item => item.id === agentId);
  const active = (skill: LocalSkill) => !['disabled', 'shadowed'].includes(skill.status);
  const skills = (agent?.skills ?? []).filter(skill => (showInactive || active(skill)) && `${skill.name} ${skill.description} ${skill.plugin ?? ''}`.toLowerCase().includes(query.toLowerCase()));
  const online = device?.lastSeenAt && now - Date.parse(device.lastSeenAt) < 150000;
  const command = `npm run local-agent -- --site ${shellQuote(origin)} --project ${shellQuote(projectPath.trim() || '/프로젝트/절대/경로')}`;

  return <section className="surface local-inventory" aria-labelledby="local-inventory-title">
    <div className="section-heading"><div><div className="eyebrow">내 Mac의 실제 구성</div><h2 id="local-inventory-title"><Laptop size={20}/> 연결된 스킬 목록</h2></div><div className="local-toolbar"><button className="icon-button" aria-label="기기 목록 다시 조회" onClick={() => void refresh()} disabled={loading || busy}><RefreshCw size={16}/></button><button className="primary-button" onClick={() => void connect()} disabled={loading || busy || loginRequired || Boolean(pairing && now < Date.parse(pairing.expiresAt))}>{busy ? <LoaderCircle size={16} className="spin"/> : <PlugZap size={16}/>} Mac 연결</button></div></div>
    <p className="local-intro">선택한 프로젝트에서 사용할 수 있는 스킬을 확인하세요. 로컬 연결 프로그램이 켜져 있는 동안 60초마다 갱신합니다.</p>
    {error && <p className="field-error" role="alert">{error}</p>}
    {loginRequired && <a className="secondary-button" href={chatGPTSignInPath('/agent')} target="_top">로그인하고 Mac 연결하기</a>}
    {loading && <p role="status"><LoaderCircle size={16} className="spin"/> 연결된 기기를 확인하고 있습니다.</p>}
    {pairing && <div className="local-pairing">
      <div className="section-heading"><h3>Mac에서 연결 프로그램 실행</h3><button className="text-button" disabled={busy} onClick={() => void disconnect(pairing.id)}>연결 취소</button></div>
      <ol><li>Mac 터미널에서 RepoFit 소스 폴더를 열고 <code>npm ci</code>를 실행하세요.</li><li>조회할 프로젝트의 절대 경로를 입력하고 아래 명령을 실행하세요.</li><li>터미널이 연결 코드를 요청하면 아래 코드를 붙여넣으세요.</li></ol>
      <label className="field-label" htmlFor="local-project-path">조회할 프로젝트 폴더</label><input className="agent-input" id="local-project-path" placeholder="예: /Users/me/Desktop/my-project" value={projectPath} maxLength={1000} onChange={event => setProjectPath(event.target.value)}/>
      <div className="local-copy-row"><pre>{command}</pre><button className="icon-button" aria-label="실행 명령 복사" onClick={() => void copy(command, 'command')}>{copied === 'command' ? <Check size={16}/> : <Clipboard size={16}/>}</button></div>
      <div className="local-copy-row"><code className="local-pair-code">{pairing.code}</code><button className="icon-button" aria-label="일회용 연결 코드 복사" onClick={() => void copy(pairing.code, 'code')}>{copied === 'code' ? <Check size={16}/> : <Clipboard size={16}/>}</button></div>
      <p className="field-hint">{now >= Date.parse(pairing.expiresAt) ? '연결 코드가 만료됐습니다. 새 코드를 만들어 주세요.' : `${time(pairing.expiresAt)}까지 한 번 사용할 수 있습니다. 연결 코드는 다른 사람에게 공유하지 마세요.`}</p>
      <p className="field-hint">비공개 Sites는 별도의 서비스 접근 토큰이 필요합니다. 연결 프로그램의 <code>--help</code>와 로컬 연결 안내 문서를 확인하세요.</p>
    </div>}
    {!loading && !loginRequired && !devices.length && !error && <div className="local-empty"><Laptop size={30} strokeWidth={1.4}/><h3>내 Mac을 연결해 시작하세요.</h3><p>기기와 프로젝트를 연결하면 Codex·Claude Code의 목록이 여기에 표시됩니다.</p></div>}
    {devices.length > 0 && <>
      <div className="local-selection"><div><label className="field-label" htmlFor="local-device">기기 · 프로젝트</label><select id="local-device" className="agent-input" value={selected} onChange={event => { setSelected(event.target.value); setLimit(50); }}>{devices.map(item => <option key={item.id} value={item.id}>{item.name}{item.inventory ? ` · ${item.inventory.project.name}` : ' · 목록 대기 중'}</option>)}</select></div><button className="text-button" disabled={!device || busy} onClick={() => device && void disconnect(device.id)}><Unplug size={14}/> 연결 해제</button></div>
      {device && <div className="local-device-meta"><span className={`local-presence ${online ? 'online' : ''}`}>{device.lastSeenAt ? online ? '연결됨' : '오프라인 · 마지막 목록' : '연결 대기'}</span>{inventory && <span><FolderGit2 size={14}/>{inventory.project.name}{inventory.project.branch ? ` · ${inventory.project.branch}` : ''}</span>}{device.lastSeenAt && <span>수신 {time(device.lastSeenAt)}</span>}</div>}
      {!inventory && <p className="field-hint">Mac에서 연결 프로그램을 실행하면 목록이 자동으로 나타납니다.</p>}
      {inventory && <>
        <div className="local-agent-tabs" role="group" aria-label="스킬을 조회할 에이전트">{inventory.agents.map(item => <button key={item.id} className={agentId === item.id ? 'selected' : ''} aria-pressed={agentId === item.id} onClick={() => { setAgentId(item.id); setLimit(50); setQuery(''); }}><strong>{agentNames[item.id]}</strong><span>{item.skills.filter(active).length}개</span></button>)}</div>
        <div className="local-version"><span>{agent?.version ?? 'CLI 실행 불가'}</span><span>검사 {time(inventory.observedAt)}</span></div>
        {agent && <div className="local-warnings" role="note">{agent.warnings.map((warning, index) => <p key={index}>{warning}</p>)}</div>}
        <div className="local-filter"><label className="local-search"><Search size={16}/><input aria-label="스킬 검색" placeholder="이름, 설명, 플러그인 검색" value={query} onChange={event => { setQuery(event.target.value); setLimit(50); }}/></label><label><input type="checkbox" checked={showInactive} onChange={event => { setShowInactive(event.target.checked); setLimit(50); }}/> 비활성·중복 포함</label></div>
        <p className="field-hint">{skills.length}개 표시 대상 · 설치·인식 상태이며 실제 호출 이력은 수집하지 않습니다.</p>
        {skills.length ? <ul className="local-skill-list">{skills.slice(0, limit).map(skill => <li key={skill.id}><div className="local-skill-heading"><strong>{skill.name}</strong><span className={`local-skill-status ${skill.status}`}>{statuses[skill.status]}</span></div><p>{skill.description || '등록된 설명이 없습니다.'}</p><details><summary>{scopes[skill.scope]}{skill.plugin ? ` · ${skill.plugin}` : ''} · 확인 근거</summary><code>{skill.source}</code><p>{skill.evidence}</p></details></li>)}</ul> : <div className="local-empty"><p>{query ? '검색 조건과 일치하는 스킬이 없습니다.' : agent?.status === 'unavailable' ? '에이전트를 설치하고 PATH를 확인해 주세요.' : '이 범위에서 확인한 스킬이 없습니다. 경고와 비활성 목록을 확인해 주세요.'}</p></div>}
        {skills.length > limit && <button className="secondary-button" onClick={() => setLimit(current => current + 50)}>50개 더 보기</button>}
      </>}
    </>}
    <details className="local-privacy"><summary>조회 범위와 개인정보</summary><p>터미널에서 지정한 프로젝트와 표준 에이전트 스킬·플러그인 경로를 조회합니다. 사이트에는 기기명, 프로젝트명·브랜치, 스킬 이름·설명·출처·상태가 저장됩니다. 스킬 본문, 설정 원문, 인증 파일, 대화 기록은 전송하지 않습니다.</p><p>Codex는 별도 App Server의 조회 결과이며 열려 있는 대화와 다를 수 있습니다. Claude는 설치·설정 확인이며 런타임 인식은 미확인입니다. 연결 해제 시 저장 목록과 기기 토큰을 삭제합니다. 프로그램을 종료하면 마지막 목록이 남고, 다시 실행할 때 새 연결 코드가 필요합니다.</p></details>
  </section>;
}
