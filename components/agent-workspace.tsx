'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight, ArrowUpRight, Bot, Check, CircleAlert, Clipboard, Download, FileText, GitBranch, LoaderCircle, PlugZap, X } from 'lucide-react';
import { z } from 'zod';
import { projectLabel, taskLabel, resultMarkdown, taskPrompt, taskStatusLabels, verdictLabels, type AgentTask } from '@/lib/agent-review';
import { repositoryId } from '@/lib/repository-types';
import { useAgentWorkspace } from './agent-provider';
import { useWorkspace } from './workspace-provider';
import { LocalAgentInventory } from './local-agent-inventory';

export function downloadText(name: string, text: string, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function messageFor(error: unknown) {
  if (error instanceof SyntaxError) return 'JSON 형식을 읽지 못했습니다. 에이전트가 반환한 전체 JSON을 붙여넣어 주세요.';
  return error instanceof z.ZodError ? error.issues[0]?.message ?? '입력 내용을 확인해 주세요.' : error instanceof Error ? error.message : '요청을 처리하지 못했습니다.';
}

export function AgentWorkspace({ initialCandidate, initialTaskId, purpose = 'skills' }: { initialCandidate: string; initialTaskId: string; purpose?: 'project' | 'skills' }) {
  const skillsMode = purpose === 'skills';
  const { project, goal } = useWorkspace();
  const { tasks, selectedId, selectTask, createTask, cancelTask, importResult, connection } = useAgentWorkspace();
  const [sourceKind, setSourceKind] = useState<'github' | 'local'>('github');
  const [projectInput, setProjectInput] = useState(project?.id ?? '');
  const [localLabel, setLocalLabel] = useState('');
  const [candidateInput, setCandidateInput] = useState(repositoryId(initialCandidate) ?? '');
  const [reviewGoal, setReviewGoal] = useState(skillsMode ? '내 에이전트에 도입하면 유용한 오픈소스 스킬을 찾아 활용 방법을 알려 주세요.' : goal);
  const [agentName, setAgentName] = useState('Codex');
  const [currentSkills, setCurrentSkills] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState('');
  const [missingRequest, setMissingRequest] = useState(false);
  const task = missingRequest ? undefined : tasks.find(task => task.id === selectedId && task.purpose === purpose);
  useEffect(() => {
    if (initialTaskId) { try { selectTask(initialTaskId, purpose); } catch { setMissingRequest(true); } }
  }, [initialTaskId, selectTask, purpose]);
  async function copyPrompt() {
    if (!task) return;
    try { await navigator.clipboard.writeText(taskPrompt(task, window.location.origin)); setNotice('실행 요청을 복사했습니다. 사용자 에이전트의 대화에 붙여넣어 주세요.'); }
    catch { setNotice('복사할 수 없습니다. 아래 실행 요청을 직접 선택하거나 내려받아 주세요.'); }
  }
  function create(event: React.FormEvent) {
    event.preventDefault(); setError(''); setNotice(''); setImportText(''); setImportError('');
    try {
      const sha = project && project.id.toLowerCase() === repositoryId(projectInput)?.toLowerCase() && /^[a-f0-9]{40}$/i.test(project.sha) ? project.sha : undefined;
      if (skillsMode) createTask({ purpose: 'skills', agentProfile: { name: agentName, currentSkills: currentSkills.split('\n').map(value => value.trim()).filter(Boolean) }, ...(candidateInput.trim() ? { candidate: candidateInput } : {}), goal: reviewGoal });
      else createTask({ purpose: 'project', project: sourceKind === 'github' ? { kind: 'github', repository: projectInput, ...(sha ? { sha } : {}) } : { kind: 'local', label: localLabel }, candidate: candidateInput, goal: reviewGoal });
      setMissingRequest(false);
    } catch (error) { setError(messageFor(error)); }
  }
  const visibleTasks = tasks.filter(item => item.purpose === purpose);
  const connectionLabel = { checking: '페이지 도구 확인 중', available: '페이지 도구 사용 가능', unsupported: '이 브라우저는 페이지 도구를 지원하지 않습니다', error: '페이지 도구를 등록하지 못했습니다' }[connection];
  return <>
    <div className="page-heading"><div><h1>{skillsMode ? '내 에이전트' : '프로젝트 검토'}</h1><p>{skillsMode ? '에이전트에 추가할 스킬을 찾고 활용 방법을 살펴보세요.' : '프로젝트와 오픈소스를 비교하고 적용할 위치를 살펴보세요.'}</p></div><a className="secondary-button" href="/skills/repofit-review/SKILL.md" download="SKILL.md"><Download size={16}/> RepoFit 스킬</a></div>
    {skillsMode && <LocalAgentInventory/>}
    {missingRequest && <div className="inline-notice" role="status"><CircleAlert size={17}/><p>이 탭에서 해당 요청을 찾지 못했습니다. 요청과 결과는 새로고침 후 복원되지 않습니다. 새 검토 요청을 만들어 주세요.</p></div>}
    <div className="agent-layout"><div className="agent-main">
      <section className="surface agent-request" aria-labelledby="agent-request-title"><div className="section-heading"><div><h2 id="agent-request-title">{skillsMode ? '스킬 탐색 설정' : '검토 설정'}</h2></div><GitBranch size={20}/></div>
        <form onSubmit={create}>
          {skillsMode ? <>
            <label className="field-label" htmlFor="agent-name">사용할 에이전트</label><input className="agent-input" id="agent-name" placeholder="예: Codex, Claude Code" value={agentName} onChange={event => setAgentName(event.target.value)} maxLength={100} required/>
            <label className="field-label" htmlFor="agent-skills">사용 중인 스킬 <span>선택</span></label><textarea id="agent-skills" aria-describedby="agent-skills-hint" placeholder="예: pdf — PDF 읽기와 생성 (한 줄에 하나씩)" value={currentSkills} onChange={event => setCurrentSkills(event.target.value)} maxLength={15000} rows={3}/><p id="agent-skills-hint" className="field-hint">입력하면 기존 스킬과 중복되는지도 확인합니다.</p>
          </> : <>
            <Link className="text-button" href="/project">프로젝트 구조로 돌아가기 <ArrowUpRight size={14}/></Link>
            <fieldset className="agent-source"><legend className="field-label">대상 프로젝트</legend><div className="agent-source-options"><label><input type="radio" name="project-source" checked={sourceKind === 'github'} onChange={() => setSourceKind('github')}/> GitHub 레포</label><label><input type="radio" name="project-source" checked={sourceKind === 'local'} onChange={() => setSourceKind('local')}/> 에이전트에서 열린 프로젝트</label></div></fieldset>
            {sourceKind === 'github' ? <><label className="field-label" htmlFor="agent-project">내 프로젝트 주소</label><input className="agent-input" id="agent-project" placeholder="owner/my-project" value={projectInput} onChange={event => setProjectInput(event.target.value)} maxLength={300} required spellCheck={false}/></> : <><label className="field-label" htmlFor="agent-local">프로젝트 이름</label><input className="agent-input" id="agent-local" placeholder="예: 지금 에이전트에서 열어 둔 웹 앱" value={localLabel} onChange={event => setLocalLabel(event.target.value)} maxLength={120} required/><p className="field-hint">실제 폴더는 에이전트에서 선택하고 접근을 허용해 주세요.</p></>}
          </>}
          <label className="field-label" htmlFor="agent-candidate">{skillsMode ? <>스킬 후보 <span>선택</span></> : '검토할 오픈소스'}</label><input className="agent-input" id="agent-candidate" placeholder={skillsMode ? '비워 두면 관심 작업에 맞는 후보를 탐색합니다' : 'owner/open-source'} value={candidateInput} onChange={event => setCandidateInput(event.target.value)} maxLength={300} required={!skillsMode} spellCheck={false}/>
          <label className="field-label" htmlFor="agent-goal">{skillsMode ? '관심 작업과 얻고 싶은 도움' : '해결하고 싶은 문제'}</label><textarea id="agent-goal" placeholder={skillsMode ? '예: 문서 작업, 코드 리뷰, 디자인을 더 잘하고 싶어요. 활용 예시와 추가 방법도 알려 주세요.' : '예: 테스트 설정이 복잡해요. 기존 구성보다 나은지 검토해 주세요.'} value={reviewGoal} onChange={event => setReviewGoal(event.target.value)} maxLength={1000} rows={3} required/>
          {error && <p className="field-error" role="alert">{error}</p>}
          <div className="form-bottom"><button className="primary-button" type="submit">검토 요청 만들기 <ArrowRight size={16}/></button></div>
        </form>
      </section>

      <section className="surface agent-handoff" aria-labelledby="agent-handoff-title"><div className="section-heading"><div><h2 id="agent-handoff-title">에이전트에 요청하기</h2></div><PlugZap size={20}/></div>
        {task ? <>
          <div className="agent-task-header"><div><strong>{taskLabel(task)}</strong><p>{projectLabel(task)}</p></div><span className={`agent-task-status ${task.status}`}>{taskStatusLabels[task.status]}</span></div>
          <div className="agent-progress" role="status">{task.status === 'running' ? <LoaderCircle size={17} className="spin"/> : <Bot size={17}/>}<span>{task.message}</span></div>
          {task.status === 'queued' && <p className="agent-help">요청을 복사해 에이전트 대화에 보내세요. 이 페이지를 열어 두면 진행 상황과 결과를 받을 수 있습니다.</p>}
          <div className="agent-actions"><button className="primary-button" type="button" onClick={() => void copyPrompt()}><Clipboard size={15}/> 실행 요청 복사</button><button className="secondary-button" type="button" onClick={() => downloadText(`repofit-request-${task.id}.txt`, taskPrompt(task, window.location.origin))}><Download size={15}/> 요청 다운로드</button>{['queued', 'running'].includes(task.status) && <button className="text-button" type="button" onClick={() => cancelTask(task.id)}><X size={15}/> 요청 취소</button>}</div>
          {notice && <p className="agent-notice" role="status">{notice}</p>}
          <details className="agent-disclosure"><summary>에이전트에 전달할 내용 보기</summary><pre>{taskPrompt(task, typeof window === 'undefined' ? 'https://repofit.fizzybean4.chatgpt.site' : window.location.origin)}</pre></details>
          {['queued', 'running'].includes(task.status) && <details className="agent-disclosure"><summary>다른 브라우저에서 결과 가져오기</summary><p>페이지 도구를 사용할 수 없다면 스킬 형식의 결과 JSON을 에이전트에게 받아 붙여넣으세요. 이 요청의 ID는 <code>{task.id}</code>, revision은 <code>{task.revision}</code>입니다.</p><label htmlFor="agent-result-json" className="field-label">에이전트가 반환한 JSON</label><textarea id="agent-result-json" rows={7} value={importText} onChange={event => setImportText(event.target.value)} placeholder='{"taskId":"…","expectedRevision":0,"result":{…}}' maxLength={100000}/>{importError && <p className="field-error" role="alert">{importError}</p>}<button className="secondary-button" disabled={!importText.trim()} onClick={() => { try { const input = JSON.parse(importText); if (input?.taskId !== task.id) throw new Error('선택한 요청과 결과의 taskId가 다릅니다.'); importResult(input); setImportError(''); setImportText(''); } catch (error) { setImportError(messageFor(error)); } }}>결과 표시 <ArrowRight size={15}/></button></details>}
          <p className="field-hint">요청 취소는 사이트의 결과 접수를 닫습니다. 실행 중인 에이전트의 중단은 해당 에이전트에서 요청해 주세요.</p>
        </> : <div className="agent-empty"><Bot size={32} strokeWidth={1.3}/><h3>검토할 내용을 입력해 주세요.</h3><p>{skillsMode ? '스킬 목록이나 후보 없이 관심 작업만으로 시작할 수 있습니다.' : '프로젝트와 오픈소스를 선택하면 요청을 만들 수 있습니다.'}</p></div>}
      </section>
      {task?.result && <AgentReport task={task}/>}
    </div><aside className="agent-aside">
      <section className="surface agent-setup"><h2>사용 방법</h2><ol className="purpose-steps"><li><span>1</span><div><strong>RepoFit 스킬 추가</strong><p>파일을 내려받아 스킬 폴더에 저장하세요.</p><a className="text-button" href="/skills/repofit-review/SKILL.md" download="SKILL.md">스킬 다운로드 <Download size={14}/></a></div></li><li><span>2</span><div><strong>내장 브라우저에서 열기</strong><p>에이전트의 브라우저에서 이 사이트를 여세요.</p></div></li><li><span>3</span><div><strong>검토 요청 보내기</strong><p>요청을 대화에 보내 검토를 시작하세요.</p></div></li></ol><details className="agent-disclosure"><summary>Codex 스킬 설치 위치</summary><p><code>~/.codex/skills/repofit-review/SKILL.md</code>로 저장한 뒤 스킬이 나타나지 않으면 새 대화에서 확인하세요. 다른 에이전트는 해당 도구의 스킬 설치 방식을 따릅니다.</p></details></section>
      <details className="agent-disclosure agent-guidance"><summary>실행과 저장 안내</summary><p>버튼으로 요청을 준비한 뒤 에이전트 대화에서 실행합니다. 브라우저가 페이지 도구를 지원하지 않으면 결과 JSON을 가져올 수 있습니다.</p><p>로컬 스킬은 자동으로 읽지 않습니다. 요청과 결과는 새로고침하면 사라지므로 필요한 결과는 내려받으세요.</p><span className={`agent-connection ${connection === 'available' ? 'ready' : ''}`} role="status"><span className="status-dot"/>{connectionLabel}</span></details>
      {visibleTasks.length > 0 && <section className="quiet-section"><div className="section-heading"><h2>이 탭의 요청 <span className="count-badge">{visibleTasks.length}</span></h2><Link href="/history" aria-label="분석 기록 열기"><ArrowUpRight size={16}/></Link></div><div className="agent-task-list">{visibleTasks.map(item => <button type="button" className={`agent-task-option ${selectedId === item.id ? 'selected' : ''}`} key={item.id} onClick={() => { selectTask(item.id); setMissingRequest(false); setImportError(''); setImportText(''); setNotice(''); }} aria-pressed={selectedId === item.id}><strong>{taskLabel(item)}</strong><span>{taskStatusLabels[item.status]}</span></button>)}</div></section>}
    </aside></div>
  </>;
}

export function AgentReport({ task }: { task: AgentTask }) {
  const result = task.result;
  if (!result) return null;
  return <section className="surface agent-report" aria-labelledby="agent-report-title"><div className="section-heading"><div><h2 id="agent-report-title">{taskLabel(task)}</h2></div><button className="icon-button" aria-label="에이전트 검토 Markdown 다운로드" onClick={() => downloadText(`repofit-review-${task.id}.md`, resultMarkdown(task), 'text/markdown;charset=utf-8')}><Download size={18}/></button></div>
    <span className={`agent-verdict ${result.verdict}`}>{verdictLabels[result.verdict]}</span><p className="agent-report-summary">{result.summary}</p><p className="field-hint">{result.agent}가 작성한 결과입니다. 사이트에서 별도로 검증하지 않았습니다.</p>
    {result.skillFit && <>
      <div className="integration-section"><h3>도입할 만한 오픈소스 스킬</h3>{result.skillFit.recommendations.length ? result.skillFit.recommendations.map((item, index) => <a className="evidence-link" key={index} href={`https://github.com/${item.repository}`} target="_blank" rel="noreferrer"><Bot size={17}/><div><strong>{item.skill}</strong><small>{item.repository}</small><p>{item.benefit}</p></div><ArrowUpRight size={15}/></a>) : <p>근거를 갖춰 추천할 스킬을 찾지 못했습니다.</p>}</div>
      <ReportList title="새로 할 수 있는 일과 활용 예시" items={result.skillFit.addedCapabilities}/>
      <div className="agent-report-columns"><ReportList title="기존 스킬과 비교" items={result.skillFit.overlaps}/><ReportList title="충돌 가능성과 제약" items={result.skillFit.conflicts}/></div>
      <ReportList title="내 에이전트에 추가하는 방법" items={result.skillFit.integrationSteps}/>
    </>}
    <ReportList title="판단 근거" items={result.reasons}/>
    <div className="agent-report-columns"><ReportList title="기대 효과" items={result.benefits}/><ReportList title="도입 부담과 주의점" items={result.risks}/></div>
    <div className="integration-section"><h3>{task.purpose === 'skills' ? '스킬 구성 변경 제안' : '어디를 바꾸면 좋을까요?'}</h3>{result.changes.length ? <ul className="path-candidates">{result.changes.map((change, index) => <li key={index}><FileText size={17}/><div><code>{change.path}</code><span>{change.proposal}</span></div></li>)}</ul> : <p>구체적인 파일 변경 제안이 없습니다.</p>}</div>
    <div className="integration-section"><h3>검증 보고</h3><p>아래 상태는 에이전트의 보고입니다. 이 사이트에서 코드를 실행하지 않습니다.</p>{result.validation.length ? <ul className="agent-validation">{result.validation.map((item, index) => <li key={index}>{item.status === 'passed' ? <Check size={16}/> : <CircleAlert size={16}/>}<div><strong>{item.check}</strong><span className={`agent-validation-status ${item.status}`}>{{ not_run: '미실행', passed: '통과 보고', failed: '실패 보고' }[item.status]}</span><p>{item.detail}</p></div></li>)}</ul> : <p>보고된 검증 항목이 없습니다.</p>}</div>
    <div className="integration-section"><h3>확인한 출처</h3>{result.evidence.length ? result.evidence.map((item, index) => <a key={index} className="evidence-link" href={item.url} target="_blank" rel="noreferrer"><FileText size={17}/><div><strong>{item.label}</strong><small>{item.url}</small></div><ArrowUpRight size={15}/></a>) : <p>제출된 출처 링크가 없습니다.</p>}</div>
    <ReportList title="확인 범위와 한계" items={result.limitations}/>
  </section>;
}
function ReportList({ title, items }: { title: string; items: string[] }) {
  return <div className="integration-section"><h3>{title}</h3>{items.length ? <ul className="agent-report-list">{items.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p>제출된 항목이 없습니다.</p>}</div>;
}
