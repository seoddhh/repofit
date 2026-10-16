'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight, FolderGit2, FileText, Check, CircleAlert, GitBranch, LoaderCircle, ChevronRight, Download, Unplug, Search } from 'lucide-react';
import { repositoryId, type RepositoryOverview } from '@/lib/repository-types';
import { integrationPlan } from '@/lib/integration-plan';
import { useWorkspace } from './workspace-provider';
import { useDemo } from './demo-provider';

export function ProjectWorkspace({ initialCandidate = '', reviewId = '' }: { initialCandidate?: string; reviewId?: string }) {
  const { project, setProject, goal, setGoal, saveReview, reviews } = useWorkspace();
  const { notify } = useDemo();
  const [input, setInput] = useState(project?.id ?? '');
  const [candidateInput, setCandidateInput] = useState(repositoryId(initialCandidate) ? initialCandidate : '');
  const [candidate, setCandidate] = useState<RepositoryOverview | null>(null);
  const [showSavedReview, setShowSavedReview] = useState(true);
  const savedReview = showSavedReview ? reviews.find(review => review.id === reviewId) : null;
  const [error, setError] = useState('');
  const [candidateError, setCandidateError] = useState('');
  const [busy, setBusy] = useState<'project' | 'candidate' | null>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  async function inspect(event: React.FormEvent, target: 'project' | 'candidate') {
    event.preventDefault();
    const value = target === 'project' ? input : candidateInput;
    const setMessage = target === 'project' ? setError : setCandidateError;
    setMessage('');
    if (!repositoryId(value)) { setMessage('https://github.com/owner/repository 또는 owner/repository를 입력해 주세요.'); return; }
    if (target === 'candidate' && repositoryId(value)?.toLowerCase() === project?.id.toLowerCase()) { setMessage('내 프로젝트와 다른 오픈소스를 입력해 주세요.'); return; }
    abort.current?.abort();
    const controller = new AbortController(); abort.current = controller;
    setBusy(target);
    try {
      const response = await fetch('/api/repository', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ repository: value }), signal: controller.signal });
      const data = await response.json() as RepositoryOverview & { error?: string };
      if (!response.ok) throw new Error(data.error);
      if (target === 'project') { setProject(data); setCandidate(null); setShowSavedReview(false); }
      else { setCandidate(data); saveReview(data); }
    } catch (error) { if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : '자료를 불러오지 못했습니다.'); }
    finally { if (!controller.signal.aborted) setBusy(null); }
  }
  if (savedReview) return <><div className="page-heading"><div><div className="eyebrow">저장된 검토</div><h1>적용 계획</h1><p>{savedReview.project.id}에 {savedReview.candidate.id} 적용 검토</p></div><Link className="secondary-button" href="/project">프로젝트로 돌아가기</Link></div><IntegrationReview project={savedReview.project} candidate={savedReview.candidate} goal={savedReview.goal}/></>;
  return <>
    <div className="page-heading"><div><div className="eyebrow">프로젝트 작업 공간</div><h1>내 프로젝트</h1><p>코드의 구조를 이해하고, 오픈소스를 적용할 위치를 찾아보세요.</p></div><div className="agent-actions"><Link href={`/agent${repositoryId(candidateInput) ? `?candidate=${encodeURIComponent(repositoryId(candidateInput)!)}` : ''}`} className="secondary-button">내 에이전트로 검토 <ArrowRight size={15}/></Link>{project && <button className="text-button" onClick={() => { setProject(null); setCandidate(null); setInput(''); }}><Unplug size={15}/> 연결 해제</button>}</div></div>
    <div className="project-layout"><div className="project-main-column">
      <section className="surface project-form-section"><div className="section-heading"><div><h2><FolderGit2 size={19}/> 프로젝트 연결</h2><p>분석할 공개 GitHub 레포를 입력하세요.</p></div><span className="subtle-badge">읽기 전용</span></div>
        <form onSubmit={event => void inspect(event, 'project')}><label className="field-label" htmlFor="repository-url">GitHub 레포지토리</label><div className={`repository-input ${error ? 'invalid' : ''}`}><GitBranch size={18}/><input id="repository-url" placeholder="https://github.com/owner/repository" value={input} onChange={event => setInput(event.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? 'repository-error' : 'repository-hint'} autoCapitalize="none" spellCheck={false} maxLength={300}/></div>{error && <p id="repository-error" className="field-error" role="alert">{error}</p>}<p id="repository-hint" className="field-hint">현재는 공개 레포만 지원합니다. 코드를 실행하거나 변경하지 않습니다.</p><label className="field-label" htmlFor="project-goal">어떤 부분을 개선하고 싶나요? <span>선택</span></label><textarea id="project-goal" placeholder="예: 반복되는 데이터 요청을 정리하고 싶어요." rows={2} value={goal} onChange={event => setGoal(event.target.value)} maxLength={500}/><div className="form-bottom"><span>README · 의존성 · 파일 구조</span><button className="primary-button" disabled={busy !== null || !input.trim()}>{busy === 'project' ? <><LoaderCircle size={16} className="spin"/> 자료 확인 중</> : <>{project ? '다시 확인' : '프로젝트 살펴보기'}<ArrowRight size={16}/></>}</button></div></form>
      </section>
      {busy === 'project' && <div className="inline-notice" role="status"><LoaderCircle className="spin" size={18}/><p>GitHub에서 커밋을 확인하고 README, 의존성, 파일 경로를 읽고 있습니다.</p></div>}
      {project ? <>
        <RepositorySummary repo={project}/>
        <section className="surface candidate-section"><div className="section-heading"><div><h2>적용할 오픈소스</h2><p>트렌딩에서 고르거나, 검토하고 싶은 레포를 직접 입력하세요.</p></div><Link href="/" className="text-button">트렌딩 <ArrowUpRight size={14}/></Link></div><form onSubmit={event => void inspect(event, 'candidate')}><label className="field-label" htmlFor="candidate-url">오픈소스 레포지토리</label><div className={`repository-input ${candidateError ? 'invalid' : ''}`}><Search size={17}/><input id="candidate-url" placeholder="owner/repository" value={candidateInput} onChange={event => setCandidateInput(event.target.value)} aria-invalid={Boolean(candidateError)} aria-describedby={candidateError ? 'candidate-error' : undefined} maxLength={300} autoCapitalize="none" spellCheck={false}/><button className="primary-button" disabled={busy !== null || !candidateInput.trim()}>{busy === 'candidate' ? <LoaderCircle size={16} className="spin"/> : '적용 검토'}<ArrowRight size={15}/></button></div>{candidateError && <p id="candidate-error" className="field-error" role="alert">{candidateError}</p>}</form></section>
        {busy === 'candidate' && <div className="inline-notice" role="status"><LoaderCircle size={17} className="spin"/><p>오픈소스 자료와 내 프로젝트 구조를 함께 확인하고 있습니다.</p></div>}
        {candidate && <IntegrationReview project={project} candidate={candidate} goal={goal}/>}
      </> : <section className="workspace-empty"><div className="workspace-outline"><FolderGit2 size={34} strokeWidth={1.2}/><span><FileText size={16}/></span></div><h2>좋은 적용은, 내 코드를 이해하는 것부터.</h2><p>레포를 연결하면 기술 스택과 구조가 여기에 표시됩니다.<br/>그다음 오픈소스를 선택해 적용할 위치를 검토할 수 있어요.</p><div className="empty-flow"><span>프로젝트 구조</span><ChevronRight size={14}/><span>오픈소스 검토</span><ChevronRight size={14}/><span>적용 계획</span></div></section>}
    </div><aside className="project-aside"><section className="quiet-section"><span className="section-kicker">어떻게 살펴보나요?</span><ol className="purpose-steps"><li><span>1</span><div><strong>프로젝트 파악</strong><p>커밋 기준으로 README와 루트 의존성, 파일 경로를 읽습니다.</p></div></li><li><span>2</span><div><strong>도입 전 비교</strong><p>후보 자료와 기존 의존성의 중복을 확인합니다.</p></div></li><li><span>3</span><div><strong>변경 계획 정리</strong><p>구조에 따른 경로 후보와 검증할 항목을 제시합니다.</p></div></li></ol></section><div className="capability-note"><CircleAlert size={16}/><p>현재는 자료와 규칙에 기반한 초기 검토입니다. 소스까지 살펴보려면 내 에이전트 검토에서 요청해 주세요.</p></div><div className="capability-note"><Check size={16}/><p>프로젝트와 검토 결과는 현재 탭의 메모리에만 보관됩니다. 새로고침하면 사라지므로 필요한 계획은 내려받아 주세요.</p></div>{project && <button className="text-button" onClick={() => notify(`확인한 커밋: ${project.sha}`)}>분석 기준 확인 <GitBranch size={14}/></button>}</aside></div>
  </>;
}

export function RepositorySummary({ repo }: { repo: RepositoryOverview }) {
  const stack = ['next', 'react', 'vue', 'svelte', 'expo', 'typescript', 'vite', 'drizzle-orm'].filter(name => name in repo.dependencies);
  const roots = repo.paths.filter(path => !path.includes('/')).slice(0, 14);
  return <section className="surface repository-summary"><div className="section-heading"><div><div className="eyebrow">확인한 프로젝트</div><h2 className="repo-summary-name">{repo.id}</h2></div><a className="icon-button" href={`https://github.com/${repo.id}/tree/${repo.sha}`} target="_blank" rel="noreferrer" aria-label="분석 기준 커밋 GitHub에서 보기"><ArrowUpRight size={18}/></a></div><p className="summary-description">{repo.description || '등록된 설명이 없습니다.'}</p><div className="stack-tags">{repo.language && <span>{repo.language}</span>}{stack.map(name => <span key={name}>{name} <small>{repo.dependencies[name]}</small></span>)}</div><div className="project-details-grid"><div><h3>파일 구조 <span>{repo.truncated ? '일부 경로' : `${repo.paths.length}개 경로`}</span></h3><ul className="file-tree">{roots.map(path => <li key={path}>{repo.paths.some(item => item.startsWith(`${path}/`)) ? <FolderGit2 size={15}/> : <FileText size={15}/>}<span>{path}</span></li>)}</ul>{repo.truncated && <p className="field-hint">최대 500개 경로만 확인했습니다.</p>}</div><div><h3>프로젝트 정보</h3><dl className="metadata-list"><div><dt>주요 언어</dt><dd>{repo.language ?? '미확인'}</dd></div><div><dt>루트 의존성</dt><dd>{Object.keys(repo.dependencies).length}개</dd></div><div><dt>라이선스</dt><dd>{repo.license === 'NOASSERTION' ? '확인 필요' : repo.license ?? '미확인'}</dd></div><div><dt>기준 커밋</dt><dd><code>{repo.sha.slice(0, 7)}</code></dd></div></dl>{repo.readme && <details className="readme-disclosure"><summary>README 읽기 <ChevronRight size={15}/></summary><pre>{repo.readme.slice(0, 12000)}{repo.readme.length > 12000 ? '\n…이후 내용은 원본에서 확인하세요.' : ''}</pre></details>}</div></div>{repo.warnings.length > 0 && <details className="coverage-details"><summary>확인하지 못한 자료 {repo.warnings.length}건</summary><ul>{repo.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul></details>}</section>;
}

export function IntegrationReview({ project, candidate, goal }: { project: RepositoryOverview; candidate: RepositoryOverview; goal: string }) {
  const plan = integrationPlan(project, candidate);
  function download() {
    const text = [`# ${candidate.id} 적용 검토`, `대상: ${project.id} @ ${project.sha}`, `후보: ${candidate.id} @ ${candidate.sha}`, `목표: ${goal || '미지정'}`, '', '> 자료와 규칙 기반 초기 검토. AI 추론·소스 내부 분석·실행 검증 미수행.', '', plan.headline, plan.description, '', '## 구조 기반 경로 후보', ...plan.paths.map(path => `- ${path}`), '', '## 적용 순서', ...plan.steps.map((step, i) => `${i + 1}. ${step.title}\n${step.body}`), '', `프로젝트: https://github.com/${project.id}/tree/${project.sha}`, `후보: https://github.com/${candidate.id}/tree/${candidate.sha}`].join('\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `repofit-${candidate.id.replace('/', '-')}.md`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section className="surface integration-review"><div className="section-heading"><div><div className="eyebrow">적용 계획 · 초기 검토</div><h2>{candidate.id}</h2></div><button className="icon-button" onClick={download} aria-label="적용 계획 Markdown 다운로드"><Download size={18}/></button></div><p className="summary-description">{candidate.description}</p><div className="review-context"><span>{project.id.split('/')[1]}</span><ArrowRight size={14}/><span>{candidate.id.split('/')[1]}</span><span className="subtle-badge">구조·의존성 기준</span></div>{goal && <div className="goal-note"><span>개선 목표</span><p>{goal}</p></div>}<div className="review-verdict"><h3>{plan.headline}</h3><p>{plan.description}</p></div><div className="integration-section"><h3>어디부터 살펴볼까요?</h3><p>실제로 확인한 파일 경로 중 구조에 따라 고른 후보입니다.</p>{plan.paths.length ? <ul className="path-candidates">{plan.paths.map(path => <li key={path}><FileText size={17}/><div><code>{path}</code><span>현재 역할을 읽고 후보의 기능과 연결할 경계 확인</span></div><a className="icon-button" href={`https://github.com/${project.id}/blob/${project.sha}/${path.split('/').map(encodeURIComponent).join('/')}`} target="_blank" rel="noreferrer" aria-label={`${path} 원본 보기`}><ArrowUpRight size={16}/></a></li>)}</ul> : <div className="inline-notice"><CircleAlert size={16}/><p>확인한 경로만으로 적용 위치를 고르기 어렵습니다. 저장소 구조를 직접 살펴봐 주세요.</p></div>}</div><div className="integration-section"><h3>적용 순서</h3><ol className="plan-steps">{plan.steps.map((step, index) => <li key={step.title}><span>{index + 1}</span><div><h4>{step.title}</h4><p>{step.body}</p></div></li>)}</ol></div>{plan.overlap.length > 0 && <div className="integration-section"><h3>공통 의존성</h3><p>역할 중복과 버전 충돌은 별도 확인이 필요합니다.</p><div className="stack-tags">{plan.overlap.map(name => <span key={name}>{name}</span>)}</div></div>}<div className="integration-section"><h3>확인한 근거</h3><div className="evidence-grid">{[project, candidate].map((repo, index) => <a key={`${index}-${repo.id}`} href={`https://github.com/${repo.id}/tree/${repo.sha}`} target="_blank" rel="noreferrer" className="evidence-link"><GitBranch size={17}/><div><strong>{index === 0 ? '내 프로젝트' : '오픈소스'} · {repo.id}</strong><small>{repo.sha.slice(0, 7)} · {repo.readme ? 'README 확인' : 'README 미확인'} · 루트 의존성 {Object.keys(repo.dependencies).length}개</small></div><ArrowUpRight size={15}/></a>)}</div><details className="readme-disclosure"><summary>후보 README {candidate.readme ? '읽기' : '미확인'} <ChevronRight size={15}/></summary><pre>{candidate.readme?.slice(0, 12000) ?? 'README를 읽지 못했습니다. GitHub 원본에서 확인해 주세요.'}</pre></details>{candidate.warnings.length > 0 && <ul className="review-warnings">{candidate.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>}</div><div className="report-disclaimer"><CircleAlert size={16}/><p>자동 생성한 설치 명령이나 호환성 보장은 제공하지 않습니다. 실제 적용 전 공식 문서, 버전, 라이선스와 대상 코드를 확인해 주세요. 내 에이전트 검토에서 실제 프로젝트에 대한 추가 검토를 요청할 수 있습니다.</p></div></section>;
}
