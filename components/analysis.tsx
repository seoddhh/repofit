'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Download, RefreshCw, Check, Pause, Play, X, FileText, ChevronRight, CircleAlert } from 'lucide-react';
import { useDemo } from './demo-provider';
import { demoSteps, isFinished, reportMarkdown } from '@/lib/demo-agent';
import { repos, deepDiveIds, type Repo } from '@/lib/fixtures';
import { RepoDetail, RepoTile } from './repo-detail';
const statusNames = { running: '진행 중', paused: '일시 중단', completed: '완료', partial: '일부 완료', canceled: '취소됨' };

export function Analysis({ runId }: { runId: string }) {
  const { runs, ready, pause, resume, cancel, start, notify } = useDemo();
  const router = useRouter();
  const run = runs.find(item => item.id === runId);
  const [selected, setSelected] = useState<Repo | null>(null);
  const [deepOnly, setDeepOnly] = useState(false);
  if (!ready) return <div className="page-loading" role="status"><RefreshCw size={20} className="spin"/> 기록 불러오는 중</div>;
  if (!run) return <div className="empty-state large"><FileText size={32}/><h1>기록을 찾을 수 없어요</h1><p>다른 브라우저에서 만들었거나 삭제된 데모 기록일 수 있어요.</p><Link href="/history" className="primary-button">분석 기록으로 <ArrowRight size={15}/></Link></div>;
  const finished = isFinished(run);
  const failed = run.status === 'partial' ? 'firecrawl/firecrawl' : null;
  function download() {
    if (!run) return;
    const url = URL.createObjectURL(new Blob([reportMarkdown(run, repos)], { type: 'text/markdown;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `repofit-demo-${run.date}.md`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); notify('데모 보고서를 다운로드했습니다.');
  }
  return <>
    <Link href="/history" className="back-link"><ArrowLeft size={15}/> 분석 기록</Link>
    <div className="report-heading"><div><div className="eyebrow">이전 UI 데모</div><h1>Today 분석 보고서</h1><p>{run.date} 예시 스냅샷 <span className={`status-label ${run.status}`}>{statusNames[run.status]}</span></p></div><div className="report-actions">{finished ? <button className="primary-button" onClick={download}><Download size={16}/> 보고서 다운로드</button> : run.status === 'running' ? <><button className="secondary-button" onClick={() => pause(runId)}><Pause size={15}/> 일시 중단</button><button className="icon-button" aria-label="분석 취소" onClick={() => cancel(runId)}><X size={18}/></button></> : run.status === 'paused' ? <><button className="primary-button" onClick={() => resume(runId)}><Play size={15}/> 이어서 보기</button><button className="secondary-button" onClick={() => cancel(runId)}>취소</button></> : <button className="secondary-button" onClick={() => router.push(`/analysis/${start()}`)}><RefreshCw size={15}/> 데모 다시 보기</button>}</div></div>
    <div className="demo-report-notice"><CircleAlert size={17}/><p>예시 데이터로 만든 이전 UI 데모입니다. 실제 GitHub 조회, 모델 분석, 크레딧 사용은 없으며, 현재 트렌딩 순위와 다릅니다.</p></div>
    {!finished ? <section className="progress-panel"><div className="progress-main"><h2>{run.status === 'running' ? '분석 과정을 미리 보고 있어요.' : run.status === 'paused' ? '잠시 멈춰두었어요.' : '데모가 취소되었어요.'}</h2><div className="steps-list">{demoSteps.map((step, index) => <div key={step.title} className={`step-item ${index < run.step ? 'done' : index === run.step && run.status === 'running' ? 'current' : ''}`}><span className="step-symbol">{index < run.step ? <Check size={13}/> : index === run.step && run.status === 'running' ? <span className="small-spinner"/> : index + 1}</span><div><strong>{step.title}</strong><p>{index < run.step ? step.result : index === run.step && run.status === 'running' ? step.detail : '대기 중'}</p></div></div>)}</div></div><aside className="activity-panel"><h3>진행 기록 / 데모</h3><div role="log" aria-live="polite">{demoSteps.slice(0, run.step).map(step => <p key={step.title}>{step.result}</p>)}</div><strong>{run.step} / {demoSteps.length}</strong><p>실제로 자료를 조사하지 않는<br/>화면 체험용 시뮬레이션입니다.</p></aside></section> : <>
      {failed && <div className="inline-notice warning"><CircleAlert size={17}/><p>firecrawl/firecrawl의 자료 확인 실패를 시뮬레이션했습니다. 나머지 9개의 예시 결과를 유지했습니다.</p></div>}
      <section className="report-overview"><div className="eyebrow">전체 요약 (예시)</div><h2>AI 개발부터 환경 관리까지.</h2><p>모델 연결, Python 개발 환경, 데이터 인프라의 서로 다른 역할을 비교하는 예시 보고서입니다. 새로운 도구를 도입하기 전에 현재 해결할 문제와 기존 의존성을 함께 확인하세요.</p><div className="overview-bottom"><span>기본 요약 {failed ? 9 : 10}개</span><span>심층 예시 3개</span><span>실제 자료 확인 없음</span></div></section>
      <div className="section-heading"><h2>레포별 보고서</h2><div className="segmented-control" role="group" aria-label="분석 깊이 필터"><button className={!deepOnly ? 'selected' : ''} aria-pressed={!deepOnly} onClick={() => setDeepOnly(false)}>전체</button><button className={deepOnly ? 'selected' : ''} aria-pressed={deepOnly} onClick={() => setDeepOnly(true)}>심층 예시</button></div></div><div className="report-repo-list">{repos.slice(0, 10).filter(repo => !deepOnly || deepDiveIds.includes(repo.id)).map(repo => <button className="report-repo-row" key={repo.id} onClick={() => setSelected(repo)}><RepoTile repo={repo} small/><div><h3>{repo.id}<span className={`analysis-depth ${repo.id === failed ? 'failed' : ''}`}>{repo.id === failed ? '미확인' : deepDiveIds.includes(repo.id) ? '심층 예시' : '요약 예시'}</span></h3><p>{repo.id === failed ? '자료 확인 실패 예시입니다.' : repo.summary}</p></div><ChevronRight size={17}/></button>)}</div><div className="report-disclaimer"><CircleAlert size={16}/><p>레포의 순위, 수치, 요약은 예시입니다. 실제 자료 기반 검토는 내 프로젝트에서 시작하세요.</p></div>
    </>}
    {selected && <RepoDetail repo={selected} onClose={() => setSelected(null)} analyzed={finished} failed={selected.id === failed}/>}
  </>;
}
