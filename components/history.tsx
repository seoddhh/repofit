'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight, Clock3, FileText, Trash2, FolderGit2 } from 'lucide-react';
import { useWorkspace } from './workspace-provider';
import { useDemo } from './demo-provider';
import { useAgentWorkspace } from './agent-provider';
import { projectLabel, taskStatusLabels } from '@/lib/agent-review';
import { isFinished, type DemoRun } from '@/lib/demo-agent';
const labels = { running: '진행 중', paused: '일시 중단', completed: '완료', partial: '일부 완료', canceled: '취소됨' };

export function History() {
  const { reviews, removeReview } = useWorkspace();
  const { tasks, selectTask } = useAgentWorkspace();
  const { runs, ready, remove, notify } = useDemo();
  const [deleting, setDeleting] = useState<{ id: string; demo: boolean } | null>(null);
  const [filter, setFilter] = useState('전체');
  const visible = runs.filter(run => filter === '전체' || filter === '완료' && isFinished(run) || filter === '진행 중' && ['running', 'paused'].includes(run.status) || filter === '취소됨' && run.status === 'canceled');
  return <>
    <div className="page-heading"><div><div className="eyebrow">작업 공간</div><h1>분석 기록</h1><p>내 프로젝트와 함께 검토한 오픈소스, 다시 살펴볼 적용 계획.</p></div><Link href="/project" className="secondary-button">프로젝트 열기 <ArrowRight size={15}/></Link></div>
    <section className="history-panel agent-history"><div className="section-heading"><div><h2>내 에이전트 검토 <span className="count-badge">{tasks.length}</span></h2><p>사용자 에이전트에 전달한 요청과 제출된 결과</p></div><Link href="/agent" className="text-button">새 검토 <ArrowRight size={15}/></Link></div>{tasks.length ? <div className="history-list">{tasks.map(task => <article className="history-row" key={task.id}><Link className="history-main" href={`/agent?task=${task.id}`} onClick={() => selectTask(task.id)}><span className="history-icon"><FileText size={20}/></span><div><h3>{task.candidate}</h3><p>{projectLabel(task)} · {task.goal}</p></div></Link><span className={`agent-task-status ${task.status}`}>{taskStatusLabels[task.status]}</span></article>)}</div> : <div className="agent-empty"><FileText size={28} strokeWidth={1.3}/><h3>사용자 에이전트와 첫 검토를 시작하세요.</h3><p>후보와 목표를 정하고 에이전트가 작성한 결과를 여기에서 다시 열 수 있어요.</p><Link href="/agent" className="secondary-button">내 에이전트로 검토 <ArrowRight size={15}/></Link></div>}<div className="history-foot">현재 탭에 보관됩니다. 필요한 결과는 Markdown으로 내려받아 주세요.</div></section>
    <section className="history-panel"><div className="section-heading"><div><h2>적용 검토 <span className="count-badge">{reviews.length}</span></h2><p>현재 탭에서 확인한 실제 GitHub 자료 기반 검토</p></div><Clock3 size={18}/></div>{reviews.length ? <div className="history-list">{reviews.map(review => <article key={review.id} className="history-row"><Link className="history-main" href={`/project?review=${review.id}`}><span className="history-icon"><FileText size={20}/></span><div><h3>{review.candidate.id}</h3><p>{review.project.id} · 적용 계획</p></div></Link><time dateTime={review.createdAt}>{new Date(review.createdAt).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}</time><span className="status-label">초기 검토</span><div className="history-row-actions"><Link className="icon-button" href={`/project?review=${review.id}`} aria-label={`${review.candidate.id} 적용 계획 열기`}><ArrowUpRight size={17}/></Link><button className="icon-button danger-icon" onClick={() => setDeleting({ id: review.id, demo: false })} aria-label={`${review.candidate.id} 검토 삭제`}><Trash2 size={16}/></button></div></article>)}</div> : <div className="empty-state large"><FolderGit2 size={34} strokeWidth={1.3}/><h2>첫 번째 적용 계획을 만들어보세요.</h2><p>내 레포를 연결하고 오픈소스를 검토하면<br/>프로젝트별 적용 계획을 여기에서 다시 열 수 있어요.</p><Link href="/project" className="primary-button">내 프로젝트 연결 <ArrowRight size={15}/></Link></div>}<div className="history-foot">검토 결과는 현재 탭의 메모리에만 보관됩니다. 새로고침 전 적용 계획을 Markdown으로 내려받아 주세요.</div></section>
    {ready && runs.length > 0 && <details className="demo-archive"><summary>이전 UI 데모 기록 ({runs.length})</summary><section className="history-panel"><div className="section-heading"><div><h2>이전 데모</h2><p>예시 데이터로 만든 보고서입니다. 실제 분석 결과가 아닙니다.</p></div><label className="select-field"><span className="sr-only">데모 상태 필터</span><select value={filter} onChange={event => setFilter(event.target.value)}>{['전체', '완료', '진행 중', '취소됨'].map(value => <option key={value}>{value}</option>)}</select></label></div><div className="history-list">{visible.map((run: DemoRun) => <article className="history-row" key={run.id}><Link className="history-main" href={`/analysis/${run.id}`}><span className="history-icon"><FileText size={20}/></span><div><h3>Today 분석 예시</h3><p>{run.date} 스냅샷 · 데모</p></div></Link><span className={`status-label ${run.status}`}>{labels[run.status]}</span><div className="history-row-actions"><Link className="icon-button" href={`/analysis/${run.id}`} aria-label="데모 보고서 열기"><ArrowUpRight size={17}/></Link><button className="icon-button danger-icon" disabled={run.status === 'running'} onClick={() => setDeleting({ id: run.id, demo: true })} aria-label="데모 기록 삭제"><Trash2 size={16}/></button></div></article>)}</div></section></details>}
    {deleting && <DeleteDialog onClose={() => setDeleting(null)} onConfirm={() => { if (deleting.demo) remove(deleting.id); else removeReview(deleting.id); setDeleting(null); notify('검토 기록을 삭제했습니다.'); }}/>} 
  </>;
}
function DeleteDialog({ onClose, onConfirm }: { onClose: () => void; onConfirm: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.showModal();
    cancelRef.current?.focus();
    return () => { dialog?.close(); if (opener?.isConnected) opener.focus(); };
  }, []);
  return <dialog ref={ref} className="center-dialog" aria-labelledby="delete-title" aria-describedby="delete-description" onCancel={onClose}><span className="dialog-symbol"><Trash2 size={26} strokeWidth={1.5}/></span><h2 id="delete-title">이 기록을 삭제할까요?</h2><p id="delete-description">필요한 적용 계획은 먼저 다운로드해 주세요.<br/>삭제한 기록은 다시 열 수 없습니다.</p><div className="dialog-actions"><button ref={cancelRef} className="secondary-button" onClick={onClose}>취소</button><button className="danger-button" onClick={onConfirm}>기록 삭제</button></div></dialog>;
}
