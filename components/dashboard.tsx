'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, ArrowRight, Search, Star, RefreshCw, FolderGit2, ChevronRight, X, CircleAlert, FileText, Check } from 'lucide-react';
import { compactNumber, type TrendingSnapshot, type TrendingRepo } from '@/lib/repository-types';
import { useWorkspace } from './workspace-provider';
import { GithubIcon } from './github-icon';

async function requestTrending(signal: AbortSignal) {
  const response = await fetch('/api/trending', { signal });
  const data = await response.json() as TrendingSnapshot & { error?: string };
  if (!response.ok) throw new Error(data.error);
  return data;
}

export function Dashboard() {
  const [snapshot, setSnapshot] = useState<TrendingSnapshot | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [language, setLanguage] = useState('전체 언어');
  const [selected, setSelected] = useState<TrendingRepo | null>(null);
  const { project, reviews } = useWorkspace();
  const controller = useRef<AbortController | null>(null);
  async function load() {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    try {
      const data = await requestTrending(current.signal);
      setSnapshot(data); setError('');
    } catch (error) { if (!current.signal.aborted) setError(error instanceof Error ? error.message : '목록을 불러오지 못했습니다.'); }
    finally { if (!current.signal.aborted) setLoading(false); }
  }
  useEffect(() => {
    const current = new AbortController();
    controller.current = current;
    requestTrending(current.signal).then(data => {
      if (!current.signal.aborted) setSnapshot(data);
    }).catch(error => {
      if (!current.signal.aborted) setError(error instanceof Error ? error.message : '목록을 불러오지 못했습니다.');
    }).finally(() => { if (!current.signal.aborted) setLoading(false); });
    return () => current.abort();
  }, []);
  const repositories = snapshot?.repositories ?? [];
  const languages = [...new Set(repositories.map(repo => repo.language).filter((value): value is string => Boolean(value)))].sort();
  const filtered = repositories.filter(repo => (language === '전체 언어' || repo.language === language) && `${repo.id} ${repo.description}`.toLowerCase().includes(search.toLowerCase()));
  const fetched = snapshot ? new Date(snapshot.fetchedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : null;
  return <>
    <div className="page-heading"><div><div className="eyebrow">오픈소스 탐색</div><h1>오늘의 트렌딩</h1><p>지금 주목받는 오픈소스에서, 내 프로젝트의 다음 변화를 찾아보세요.</p></div><a className="text-button" href="https://github.com/trending?since=daily" target="_blank" rel="noreferrer">GitHub에서 보기 <ArrowUpRight size={15}/></a></div>
    <Link href="/project" className="project-invitation"><span className="invitation-icon"><FolderGit2 size={26} strokeWidth={1.5}/></span><div><h2>{project ? `${project.id.split('/')[1]}에 적용할 도구를 찾아보세요.` : '내 프로젝트에는 어떻게 적용할 수 있을까요?'}</h2><p>{project ? '트렌딩에서 후보를 선택하고, 내 코드의 구조와 함께 검토하세요.' : '레포를 연결하면 기술 스택과 파일 구조를 바탕으로 적용할 위치를 살펴볼 수 있어요.'}</p></div><span className="invitation-action">{project ? '프로젝트 열기' : '프로젝트 추가'} <ArrowRight size={16}/></span></Link>
    <div className="discovery-layout"><section className="repo-section" aria-labelledby="trending-heading">
      <div className="section-heading"><div><h2 id="trending-heading">GitHub Trending <span className="count-badge">{snapshot ? repositories.length : '—'}</span></h2><p>Today · 전체 언어 기준 원본 순위</p></div><button className="icon-button" disabled={loading} onClick={() => { setLoading(true); void load(); }} aria-label="트렌딩 새로고침"><RefreshCw size={17} className={loading ? 'spin' : ''}/></button></div>
      <div className="list-toolbar"><label className="search-field"><Search size={17}/><input aria-label="레포 검색" placeholder="이름 또는 키워드로 검색" value={search} onChange={event => setSearch(event.target.value)}/>{search && <button className="clear-search" onClick={() => setSearch('')} aria-label="검색 지우기"><X size={14}/></button>}</label><label className="select-field"><span className="sr-only">언어 필터</span><select value={language} onChange={event => setLanguage(event.target.value)}><option>전체 언어</option>{languages.map(value => <option key={value}>{value}</option>)}</select></label></div>
      {(error || snapshot?.stale) && <div className="inline-notice warning" role="status"><CircleAlert size={17}/><div>{error || '새 목록을 불러오지 못해 이전 수집 결과를 표시합니다.'}{!snapshot && <button className="text-button" onClick={() => void load()}>다시 시도 <RefreshCw size={14}/></button>}</div></div>}
      <div className="list-column-head"><span>레포지토리</span><span>오늘 받은 스타</span></div>
      {loading && !snapshot ? <div role="status" aria-label="GitHub Trending 불러오는 중" className="repo-skeletons">{[1, 2, 3, 4, 5].map(n => <div key={n} className="skeleton-row"><span/><div><i/><i/></div></div>)}</div> : <ol className="repo-list">{filtered.map(repo => <li key={repo.id} className="repo-row"><span className="repo-rank">{String(repo.rank).padStart(2, '0')}</span><button className="repo-main" onClick={() => setSelected(repo)} aria-label={`${repo.id} 상세 보기`}><span className="repo-avatar" aria-hidden="true">{repo.id.split('/')[0].slice(0, 1).toUpperCase()}</span><div className="repo-copy"><h3><span>{repo.id.split('/')[0]} / </span>{repo.id.split('/')[1]}</h3><p>{repo.description || 'GitHub에 등록된 설명이 없습니다.'}</p><div className="repo-tags">{repo.language && <span><i style={{ background: repo.color ?? 'var(--muted)' }}/>{repo.language}</span>}<span><Star size={12}/>{compactNumber(repo.stars)}</span></div></div></button><div className="repo-metrics"><strong>{repo.today === null ? '—' : `+${repo.today.toLocaleString()}`}</strong><small>stars today</small></div><button className="icon-button repo-chevron" onClick={() => setSelected(repo)} aria-label={`${repo.id} 상세 보기`}><ChevronRight size={17}/></button></li>)}</ol>}
      {!loading && snapshot && filtered.length === 0 && <div className="empty-state"><Search size={26}/><h3>일치하는 레포가 없어요</h3><p>다른 키워드나 언어를 선택해 주세요.</p><button className="secondary-button" onClick={() => { setSearch(''); setLanguage('전체 언어'); }}>필터 초기화</button></div>}
      {!snapshot && !loading && <div className="empty-state"><GithubIcon size={28}/><h3>잠시 연결이 어려워요</h3><p>실제 순위를 확인할 수 있을 때 목록을 표시합니다.</p><a className="secondary-button" href="https://github.com/trending?since=daily" target="_blank" rel="noreferrer">GitHub 원본 열기 <ArrowUpRight size={15}/></a></div>}
      <div className="list-footnote"><span className={`status-dot ${snapshot?.stale ? 'stale' : ''}`}/><span>{fetched ? `${fetched} KST 수집${snapshot?.stale ? ' · 이전 자료' : ''}` : loading ? 'GitHub 원본에 연결 중' : '수집 결과 없음'}</span>{snapshot && <span>5분 캐시</span>}</div>
      {(search || language !== '전체 언어') && <p className="filter-note">{filtered.length}개 표시 · 순위는 전체 언어 원본 기준으로 유지됩니다.</p>}
    </section><aside className="discovery-aside">
      <section className="project-context"><div className="section-heading"><h2>내 프로젝트</h2><FolderGit2 size={18}/></div>{project ? <><span className="context-repo">{project.id}</span><p>{project.description || '프로젝트 자료를 확인했습니다.'}</p><div className="stack-tags"><span>{project.language ?? '언어 미확인'}</span><span>{Object.keys(project.dependencies).length}개 의존성</span></div><Link className="text-button" href="/project">구조와 적용 계획 보기 <ArrowRight size={15}/></Link></> : <><p>기술 스택과 구조를 먼저 확인하고, 필요한 오픈소스를 선택하세요.</p><Link href="/project" className="secondary-button full-width"><span>＋</span> 공개 레포 연결</Link></>}</section>
      <section className="quiet-section"><span className="section-kicker">발견에서 적용까지</span><ol className="purpose-steps"><li><span>1</span><div><strong>내 코드 이해하기</strong><p>README, 의존성, 파일 구조 확인</p></div></li><li><span>2</span><div><strong>오픈소스 검토하기</strong><p>용도와 기존 구성의 차이 비교</p></div></li><li><span>3</span><div><strong>적용 위치 찾기</strong><p>변경할 구조와 검증할 항목 정리</p></div></li></ol></section>
      {reviews.length > 0 && <section className="quiet-section"><div className="section-heading"><h2>최근 검토</h2><Link href="/history" aria-label="분석 기록 보기"><ArrowUpRight size={16}/></Link></div>{reviews.slice(0, 2).map(review => <Link className="recent-run" href={`/project?review=${review.id}`} key={review.id}><FileText size={17}/><div><strong>{review.candidate.id.split('/')[1]}</strong><span>{review.project.id.split('/')[1]} 적용 검토</span></div><ChevronRight size={15}/></Link>)}</section>}
      <div className="capability-note"><Check size={15}/><p>트렌딩은 실제 GitHub 자료입니다.<br/>적용 계획은 초기 검토이며, AI 심층 분석은 연결 준비 중입니다.</p></div>
    </aside></div>
    {selected && <TrendingDetail repo={selected} onClose={() => setSelected(null)}/>}
  </>;
}
function TrendingDetail({ repo, onClose }: { repo: TrendingRepo; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} className="detail-dialog" aria-labelledby="live-detail-title" onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }}><div className="detail-inner"><div className="detail-topline"><span>GitHub Trending · #{repo.rank}</span><button className="icon-button" aria-label="상세 닫기" onClick={onClose}><X size={20}/></button></div><div className="detail-repo-icon"><GithubIcon size={30}/></div><p className="detail-owner">{repo.id.split('/')[0]}</p><h2 id="live-detail-title" className="detail-title">{repo.id.split('/')[1]}</h2><p className="detail-description">{repo.description || '등록된 설명이 없습니다.'}</p><div className="detail-stats"><div><span>전체 스타</span><strong>{compactNumber(repo.stars)}</strong></div><div><span>오늘 받은 스타</span><strong>{repo.today === null ? '—' : `+${repo.today.toLocaleString()}`}</strong></div><div><span>주요 언어</span><strong>{repo.language ?? '미표시'}</strong></div></div><div className="detail-section"><h3>내 프로젝트에 적용하기</h3><p>프로젝트 구조와 이 오픈소스의 README·의존성을 함께 확인하고, 적용할 위치와 확인할 항목을 정리합니다.</p><Link href={`/project?candidate=${encodeURIComponent(repo.id)}`} className="primary-button full-width" onClick={onClose}>적용 검토 시작 <ArrowRight size={16}/></Link></div><a href={`https://github.com/${repo.id}`} target="_blank" rel="noreferrer" className="secondary-button full-width">GitHub에서 원본 보기 <ArrowUpRight size={15}/></a><p className="detail-footnote">순위와 수치는 수집 시점 기준입니다. 인기도가 프로젝트 적합성을 의미하지는 않습니다.</p></div></dialog>;
}
