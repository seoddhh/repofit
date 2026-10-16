'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight, ArrowUpRight, Bot, Check, CircleAlert, Clipboard, Download, FileText, GitBranch, LoaderCircle, PlugZap, X } from 'lucide-react';
import { z } from 'zod';
import { projectLabel, resultMarkdown, taskPrompt, taskStatusLabels, verdictLabels, type AgentTask } from '@/lib/agent-review';
import { repositoryId } from '@/lib/repository-types';
import { useAgentWorkspace } from './agent-provider';
import { useWorkspace } from './workspace-provider';

export function downloadText(name: string, text: string, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function messageFor(error: unknown) {
  if (error instanceof SyntaxError) return 'JSON 형식을 읽지 못했습니다. 에이전트가 반환한 전체 JSON을 붙여넣어 주세요.';
  return error instanceof z.ZodError ? error.issues[0]?.message ?? '입력 내용을 확인해 주세요.' : error instanceof Error ? error.message : '요청을 처리하지 못했습니다.';
}

export function AgentWorkspace({ initialCandidate, initialTaskId }: { initialCandidate: string; initialTaskId: string }) {
  const { project, goal } = useWorkspace();
  const { tasks, selectedId, selectTask, createTask, cancelTask, importResult, connection } = useAgentWorkspace();
  const [sourceKind, setSourceKind] = useState<'github' | 'local'>('github');
  const [projectInput, setProjectInput] = useState(project?.id ?? '');
  const [localLabel, setLocalLabel] = useState('');
  const [candidateInput, setCandidateInput] = useState(repositoryId(initialCandidate) ?? '');
  const [reviewGoal, setReviewGoal] = useState(goal);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState('');
  const [missingRequest, setMissingRequest] = useState(false);
  const task = missingRequest ? undefined : tasks.find(task => task.id === selectedId);
  useEffect(() => {
    if (initialTaskId) { try { selectTask(initialTaskId); } catch { setMissingRequest(true); } }
  }, [initialTaskId, selectTask]);
  async function copyPrompt() {
    if (!task) return;
    try { await navigator.clipboard.writeText(taskPrompt(task, window.location.origin)); setNotice('실행 요청을 복사했습니다. 사용자 에이전트의 대화에 붙여넣어 주세요.'); }
    catch { setNotice('복사할 수 없습니다. 아래 실행 요청을 직접 선택하거나 내려받아 주세요.'); }
  }
  function create(event: React.FormEvent) {
    event.preventDefault(); setError(''); setNotice(''); setImportText(''); setImportError('');
    try {
      const sha = project && project.id.toLowerCase() === repositoryId(projectInput)?.toLowerCase() && /^[a-f0-9]{40}$/i.test(project.sha) ? project.sha : undefined;
      createTask({ project: sourceKind === 'github' ? { kind: 'github', repository: projectInput, ...(sha ? { sha } : {}) } : { kind: 'local', label: localLabel }, candidate: candidateInput, goal: reviewGoal });
      setMissingRequest(false);
    } catch (error) { setError(messageFor(error)); }
  }
  const connectionLabel = { checking: '페이지 도구 확인 중', available: '페이지 도구 사용 가능', unsupported: '이 브라우저는 페이지 도구를 지원하지 않습니다', error: '페이지 도구를 등록하지 못했습니다' }[connection];
  return <>
    <div className="page-heading"><div><div className="eyebrow">나의 도구, 나의 에이전트</div><h1>내 에이전트로 검토</h1><p>마음에 드는 오픈소스를 고르고, 지금 쓰는 에이전트와 도입 여부를 판단하세요.</p></div><a className="secondary-button" href="/skills/repofit-review/SKILL.md" download="SKILL.md"><Download size={16}/> RepoFit 스킬</a></div>
    {missingRequest && <div className="inline-notice" role="status"><CircleAlert size={17}/><p>이 탭에서 해당 요청을 찾지 못했습니다. 요청과 결과는 새로고침 후 복원되지 않습니다. 새 검토 요청을 만들어 주세요.</p></div>}
    <div className="agent-intro"><span className="agent-symbol"><Bot size={29} strokeWidth={1.5}/></span><div><h2>발견은 여기서. 판단은 내 에이전트와.</h2><p>프로젝트를 읽고, 후보를 비교하고, 결과를 이 화면에 남깁니다. 모델 실행에는 사용자 에이전트의 계정과 사용량이 적용됩니다.</p></div><span className={`agent-connection ${connection === 'available' ? 'ready' : ''}`} role="status"><span className="status-dot"/>{connectionLabel}</span></div>
    <div className="agent-layout"><div className="agent-main">
      <section className="surface agent-request" aria-labelledby="agent-request-title"><div className="section-heading"><div><div className="eyebrow">01 · 검토 요청</div><h2 id="agent-request-title">어떤 변화를 살펴볼까요?</h2></div><GitBranch size={20}/></div>
        <form onSubmit={create}>
          <fieldset className="agent-source"><legend className="field-label">대상 프로젝트</legend><div className="agent-source-options"><label><input type="radio" name="project-source" checked={sourceKind === 'github'} onChange={() => setSourceKind('github')}/> GitHub 레포</label><label><input type="radio" name="project-source" checked={sourceKind === 'local'} onChange={() => setSourceKind('local')}/> 에이전트에서 열린 프로젝트</label></div></fieldset>
          {sourceKind === 'github' ? <><label className="field-label" htmlFor="agent-project">내 프로젝트 주소</label><input className="agent-input" id="agent-project" placeholder="owner/my-project" value={projectInput} onChange={event => setProjectInput(event.target.value)} maxLength={300} required spellCheck={false}/></> : <><label className="field-label" htmlFor="agent-local">프로젝트 이름</label><input className="agent-input" id="agent-local" placeholder="예: 지금 Codex에서 열어 둔 웹 앱" value={localLabel} onChange={event => setLocalLabel(event.target.value)} maxLength={120} required/><p className="field-hint">이름만 전달합니다. 실제 폴더는 에이전트에서 선택하고 접근을 허용해 주세요.</p></>}
          <label className="field-label" htmlFor="agent-candidate">검토할 오픈소스</label><input className="agent-input" id="agent-candidate" placeholder="owner/open-source" value={candidateInput} onChange={event => setCandidateInput(event.target.value)} maxLength={300} required spellCheck={false}/>
          <label className="field-label" htmlFor="agent-goal">해결하고 싶은 문제</label><textarea id="agent-goal" placeholder="예: 테스트 설정이 복잡해요. 이 도구가 기존 구성보다 나은지 검토해 주세요." value={reviewGoal} onChange={event => setReviewGoal(event.target.value)} maxLength={1000} rows={3} required/>
          {error && <p className="field-error" role="alert">{error}</p>}
          <div className="form-bottom"><span>설치와 코드 변경 없이 검토부터</span><button className="primary-button" type="submit">검토 요청 만들기 <ArrowRight size={16}/></button></div>
        </form>
      </section>

      <section className="surface agent-handoff" aria-labelledby="agent-handoff-title"><div className="section-heading"><div><div className="eyebrow">02 · 사용자 에이전트</div><h2 id="agent-handoff-title">에이전트에 이어 주세요</h2></div><PlugZap size={20}/></div>
        {task ? <>
          <div className="agent-task-header"><div><strong>{task.candidate}</strong><p>{projectLabel(task)}에 적용 검토</p></div><span className={`agent-task-status ${task.status}`}>{taskStatusLabels[task.status]}</span></div>
          <div className="agent-progress" role="status">{task.status === 'running' ? <LoaderCircle size={17} className="spin"/> : <Bot size={17}/>}<span>{task.message}</span></div>
          {task.status === 'queued' && <p className="agent-help">요청을 만든 뒤 사용자 에이전트의 대화에 아래 내용을 보내 주세요. 이 페이지를 열어 두면 에이전트가 진행 상황과 결과를 표시할 수 있습니다.</p>}
          <div className="agent-actions"><button className="primary-button" type="button" onClick={() => void copyPrompt()}><Clipboard size={15}/> 실행 요청 복사</button><button className="secondary-button" type="button" onClick={() => downloadText(`repofit-request-${task.id}.txt`, taskPrompt(task, window.location.origin))}><Download size={15}/> 요청 다운로드</button>{['queued', 'running'].includes(task.status) && <button className="text-button" type="button" onClick={() => cancelTask(task.id)}><X size={15}/> 요청 취소</button>}</div>
          {notice && <p className="agent-notice" role="status">{notice}</p>}
          <details className="agent-disclosure"><summary>에이전트에 전달할 내용 보기</summary><pre>{taskPrompt(task, typeof window === 'undefined' ? 'https://repofit.fizzybean4.chatgpt.site' : window.location.origin)}</pre></details>
          {['queued', 'running'].includes(task.status) && <details className="agent-disclosure"><summary>다른 브라우저에서 결과 가져오기</summary><p>페이지 도구를 사용할 수 없다면 스킬 형식의 결과 JSON을 에이전트에게 받아 붙여넣으세요. 이 요청의 ID는 <code>{task.id}</code>, revision은 <code>{task.revision}</code>입니다.</p><label htmlFor="agent-result-json" className="field-label">에이전트가 반환한 JSON</label><textarea id="agent-result-json" rows={7} value={importText} onChange={event => setImportText(event.target.value)} placeholder='{"taskId":"…","expectedRevision":0,"result":{…}}' maxLength={100000}/>{importError && <p className="field-error" role="alert">{importError}</p>}<button className="secondary-button" disabled={!importText.trim()} onClick={() => { try { const input = JSON.parse(importText); if (input?.taskId !== task.id) throw new Error('선택한 요청과 결과의 taskId가 다릅니다.'); importResult(input); setImportError(''); setImportText(''); } catch (error) { setImportError(messageFor(error)); } }}>결과 표시 <ArrowRight size={15}/></button></details>}
          <p className="field-hint">요청 취소는 사이트의 결과 접수를 닫습니다. 실행 중인 에이전트의 중단은 해당 에이전트에서 요청해 주세요.</p>
        </> : <div className="agent-empty"><Bot size={32} strokeWidth={1.3}/><h3>첫 검토 요청을 만들어 주세요.</h3><p>대상과 후보를 정하면 에이전트에 전달할 내용이 준비됩니다.</p></div>}
      </section>
      {task?.result && <AgentReport task={task}/>}
    </div><aside className="agent-aside">
      <section className="surface agent-setup"><div className="eyebrow">한 번만 준비하세요</div><h2>익숙한 에이전트로 시작</h2><ol className="purpose-steps"><li><span>1</span><div><strong>RepoFit 스킬 추가</strong><p>스킬 파일을 내려받아 에이전트의 스킬 폴더에 추가하세요.</p><a className="text-button" href="/skills/repofit-review/SKILL.md" download="SKILL.md">스킬 다운로드 <Download size={14}/></a></div></li><li><span>2</span><div><strong>내장 브라우저에서 열기</strong><p>페이지 도구를 지원하는 ChatGPT·Codex 브라우저에서 이 사이트를 열어 주세요.</p></div></li><li><span>3</span><div><strong>검토 요청 보내기</strong><p>복사한 요청을 대화에 보내면 에이전트가 검토하고 결과를 돌려줍니다.</p></div></li></ol><details className="agent-disclosure"><summary>Codex 스킬 설치 위치</summary><p><code>~/.codex/skills/repofit-review/SKILL.md</code>로 저장한 뒤 스킬이 나타나지 않으면 새 대화에서 확인하세요. 다른 에이전트는 해당 도구의 스킬 설치 방식을 따릅니다.</p></details></section>
      <div className="capability-note"><CircleAlert size={16}/><p>버튼만으로 에이전트가 자동 실행되지는 않습니다. 에이전트 대화에서 실행 요청이 필요합니다. 페이지 도구 지원은 앱·모델·설정에 따라 달라집니다.</p></div>
      <div className="capability-note"><FileText size={16}/><p>요청과 결과는 현재 탭에서만 보관됩니다. 새로고침하거나 계정을 바꾸기 전에 필요한 내용을 내려받으세요.</p></div>
      {tasks.length > 0 && <section className="quiet-section"><div className="section-heading"><h2>이 탭의 요청 <span className="count-badge">{tasks.length}</span></h2><Link href="/history" aria-label="분석 기록 열기"><ArrowUpRight size={16}/></Link></div><div className="agent-task-list">{tasks.map(item => <button type="button" className={`agent-task-option ${selectedId === item.id ? 'selected' : ''}`} key={item.id} onClick={() => { selectTask(item.id); setImportError(''); setImportText(''); setNotice(''); }} aria-pressed={selectedId === item.id}><strong>{item.candidate}</strong><span>{taskStatusLabels[item.status]}</span></button>)}</div></section>}
    </aside></div>
  </>;
}

export function AgentReport({ task }: { task: AgentTask }) {
  const result = task.result;
  if (!result) return null;
  return <section className="surface agent-report" aria-labelledby="agent-report-title"><div className="section-heading"><div><div className="eyebrow">03 · 에이전트의 검토</div><h2 id="agent-report-title">{task.candidate}</h2></div><button className="icon-button" aria-label="에이전트 검토 Markdown 다운로드" onClick={() => downloadText(`repofit-review-${task.id}.md`, resultMarkdown(task), 'text/markdown;charset=utf-8')}><Download size={18}/></button></div>
    <span className={`agent-verdict ${result.verdict}`}>{verdictLabels[result.verdict]}</span><p className="agent-report-summary">{result.summary}</p><p className="field-hint">{result.agent}가 제출한 결과 · 사이트는 내용을 독립적으로 검증하지 않았습니다.</p>
    <ReportList title="판단 근거" items={result.reasons}/>
    <div className="agent-report-columns"><ReportList title="기대 효과" items={result.benefits}/><ReportList title="도입 부담과 주의점" items={result.risks}/></div>
    <div className="integration-section"><h3>어디를 바꾸면 좋을까요?</h3>{result.changes.length ? <ul className="path-candidates">{result.changes.map((change, index) => <li key={index}><FileText size={17}/><div><code>{change.path}</code><span>{change.proposal}</span></div></li>)}</ul> : <p>구체적인 파일 변경 제안이 없습니다.</p>}</div>
    <div className="integration-section"><h3>검증 보고</h3><p>아래 상태는 에이전트의 보고입니다. 이 사이트에서 코드를 실행하지 않습니다.</p>{result.validation.length ? <ul className="agent-validation">{result.validation.map((item, index) => <li key={index}>{item.status === 'passed' ? <Check size={16}/> : <CircleAlert size={16}/>}<div><strong>{item.check}</strong><span className={`agent-validation-status ${item.status}`}>{{ not_run: '미실행', passed: '통과 보고', failed: '실패 보고' }[item.status]}</span><p>{item.detail}</p></div></li>)}</ul> : <p>보고된 검증 항목이 없습니다.</p>}</div>
    <div className="integration-section"><h3>확인한 출처</h3>{result.evidence.length ? result.evidence.map((item, index) => <a key={index} className="evidence-link" href={item.url} target="_blank" rel="noreferrer"><FileText size={17}/><div><strong>{item.label}</strong><small>{item.url}</small></div><ArrowUpRight size={15}/></a>) : <p>제출된 출처 링크가 없습니다.</p>}</div>
    <ReportList title="확인 범위와 한계" items={result.limitations}/>
  </section>;
}
function ReportList({ title, items }: { title: string; items: string[] }) {
  return <div className="integration-section"><h3>{title}</h3>{items.length ? <ul className="agent-report-list">{items.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p>제출된 항목이 없습니다.</p>}</div>;
}
