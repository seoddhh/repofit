'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, Check, CircleAlert, Clock3, FileText, Lightbulb, RefreshCw, ShieldCheck, Star, TrendingUp } from 'lucide-react';
import { compactNumber } from '@/lib/repository-types';
import { explanationPath, type BriefResponse } from '@/lib/brief-types';
import { GithubIcon } from './github-icon';
import { uiCopy, uiText } from '@/lib/ui-copy';

function checkedAt(value: string) {
  return new Date(value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function RepositoryExplanation({ repository, embedded = false }: { repository: string; embedded?: boolean }) {
  const [data, setData] = useState<BriefResponse | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [section, setSection] = useState('overview');
  useEffect(() => {
    const refresh = () => setAttempt(n => n + 1);
    window.addEventListener('repofit-brief-updated', refresh);
    return () => window.removeEventListener('repofit-brief-updated', refresh);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/brief?repository=${encodeURIComponent(repository)}`, { signal: controller.signal }).then(async response => {
      const body = await response.json() as BriefResponse & { error?: string };
      if (!response.ok) throw new Error(body.error || '해설을 불러오지 못했습니다.');
      if (!controller.signal.aborted) { setData(body); setError(''); }
    }).catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [repository, attempt]);
  const evidence = data?.evidence;
  const article = data?.article ? { ...data.article, content: uiCopy(data.article.content) } : null;
  return <>
    {!embedded && <Link href="/" className="text-button explanation-back"><ArrowLeft size={15}/> 트렌딩 목록</Link>}
    {!data && !error && <div className="explanation-loading" role="status"><RefreshCw size={22} className="spin"/><p>공식 자료와 해설을 불러오고 있어요.</p></div>}
    {error && <div className="inline-notice warning" role="alert"><CircleAlert size={18}/><div><p>{error}</p><button className="text-button" onClick={() => { setError(''); setAttempt(n => n + 1); }}>다시 시도 <RefreshCw size={14}/></button></div></div>}
    {evidence && <article className={`explanation-page ${embedded ? 'embedded' : ''}`}>
      <header className="explanation-hero">
        <div className="explanation-eyebrow"><span className="explanation-label"><BookOpen size={14}/> 오픈소스 해설</span>{evidence.trending && <span>GitHub Trending #{evidence.trending.rank}, 수집 시점 기준</span>}</div>
        <p className="explanation-owner">{evidence.id.split('/')[0]}</p>
        <h1>{evidence.id.split('/')[1]}</h1>
        <p className="explanation-tagline">{uiText(article?.content.tagline || evidence.description || '공식 저장소의 자료를 확인해 보세요.')}</p>
        <div className="explanation-metadata"><span><Star size={14}/>{compactNumber(evidence.stars)} stars</span>{evidence.language && <span>{evidence.language}</span>}<span>{evidence.license ?? '라이선스 미확인'}</span></div>
        <div className="explanation-actions"><a href={`https://github.com/${evidence.id}`} target="_blank" rel="noreferrer" className="secondary-button"><GithubIcon size={16}/> GitHub 원본 <ArrowUpRight size={14}/></a><Link href={`/project?mode=agent&candidate=${encodeURIComponent(evidence.id)}`} className="primary-button">내 프로젝트에 도입 검토 <ArrowRight size={15}/></Link></div>
      </header>
      <div className="explanation-update"><Clock3 size={14}/><span>{article ? `${checkedAt(article.generatedAt)} KST 해설 갱신` : `${checkedAt(evidence.fetchedAt)} KST 자료 확인`}</span><span className="explanation-update-label">{article ? 'AI가 공식 자료를 읽고 정리한 해설' : '공식 자료'}</span></div>
      {data.stale && <p className="explanation-notice"><CircleAlert size={15}/> 최근 갱신이 지연되어 이전 해설을 표시합니다. 최신 내용은 원본에서 확인해 주세요.</p>}
      {!article && <div className="explanation-pending"><BookOpen size={20}/><div><h2>쉬운 한국어 해설을 준비하고 있어요.</h2><p>자동 정리는 오늘의 상위 10개를 대상으로 합니다. 아직 해설이 없는 레포는 확인한 공식 자료를 먼저 보여드립니다.</p></div></div>}
      <div className="explanation-section-tabs" role="tablist" aria-label="오픈소스 해설 내용">{[{ id: 'overview', label: '어떤 도구인가요?' }, { id: 'trending', label: '왜 주목받나요?' }, { id: 'sources', label: '출처와 시작하기' }].map((item, index, items) => <button key={item.id} id={`tab-${item.id}`} type="button" role="tab" aria-selected={section === item.id} aria-controls={`panel-${item.id}`} tabIndex={section === item.id ? 0 : -1} onClick={() => setSection(item.id)} onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length;
        setSection(items[next].id); document.getElementById(`tab-${items[next].id}`)?.focus();
      }}>{item.label}</button>)}</div>
      <section id="panel-overview" role="tabpanel" aria-labelledby="tab-overview" hidden={section !== 'overview'} tabIndex={0} className="explanation-panel">
        <div className="explanation-section"><h2><Lightbulb size={20}/>쉽게 말하면</h2><p className="explanation-lead">{uiText(article?.content.summary || evidence.description || '공식 저장소에 프로젝트 설명이 등록되지 않았습니다.')}</p></div>
        {article && <><div className="explanation-section"><h2>이럴 때 활용할 수 있어요</h2><ol className="explanation-usecases">{article.content.useCases.map((text, index) => <li key={text}><span>{String(index + 1).padStart(2, '0')}</span><p>{text}</p></li>)}</ol></div><div className="explanation-comparison"><div><h2><Check size={18}/>기대할 수 있는 점</h2><ul>{article.content.strengths.map(text => <li key={text}>{uiText(text)}</li>)}</ul></div><div><h2><ShieldCheck size={18}/>도입 전에 확인하세요</h2><ul>{article.content.limitations.map(text => <li key={text}>{uiText(text)}</li>)}</ul></div></div></>}
        {!article && evidence.readme && <details className="explanation-readme"><summary>공식 README 원문 살펴보기</summary><pre>{evidence.readme}</pre></details>}
      </section>
      <section id="panel-trending" role="tabpanel" aria-labelledby="tab-trending" hidden={section !== 'trending'} tabIndex={0} className="explanation-panel">
        <div className="explanation-section"><h2><TrendingUp size={20}/>관심이 모이고 있다는 신호</h2>{evidence.trending ? <div className="explanation-trend-stats"><div><span>전체 언어 트렌딩 순위</span><strong>#{evidence.trending.rank}</strong></div><div><span>오늘 받은 스타</span><strong>{evidence.trending.today === null ? '미확인' : `+${evidence.trending.today.toLocaleString()}`}</strong></div><p>{evidence.trendingFetchedAt && `${checkedAt(evidence.trendingFetchedAt)} KST 수집`}{evidence.trendingStale ? ', 이전 수집 결과' : ''}</p></div> : <p>자료 수집 시점의 오늘 트렌딩 목록에는 없습니다.</p>}<p className="explanation-caveat">순위와 스타 증가는 관심의 신호입니다. 인기의 구체적인 원인이나 내 프로젝트와의 적합성을 입증하지는 않습니다.</p></div>
        <div className="explanation-section"><h2>어떤 점이 주목받을 수 있나요?</h2>{article ? <div className="explanation-reasons">{article.content.trendReasons.map((reason, index) => <div key={index}><span className={`explanation-reason-kind ${reason.kind}`}>{reason.kind === 'fact' ? '확인한 사실' : '근거를 바탕으로 한 추정'}</span><p>{reason.text}</p><div>{reason.sourceUrls.map((url, n) => <a key={url} href={url} target="_blank" rel="noreferrer">{uiText(evidence.sources.find(s => s.url === url)?.title ?? `근거 ${n + 1}`)} <ArrowUpRight size={12}/></a>)}</div></div>)}</div> : <p>트렌딩에 오른 구체적인 원인은 아직 확인되지 않았습니다. 스타 수치만으로 원인을 추정해 표시하지 않습니다.</p>}</div>
        {evidence.release && <div className="explanation-release"><span>확인한 공식 릴리스</span><a href={evidence.release.url} target="_blank" rel="noreferrer">{uiText(evidence.release.name)} <ArrowUpRight size={14}/></a><p>{checkedAt(evidence.release.publishedAt)} KST 발표. 발표와 트렌딩 사이의 인과관계는 별도 확인이 필요합니다.</p></div>}
      </section>
      <section id="panel-sources" role="tabpanel" aria-labelledby="tab-sources" hidden={section !== 'sources'} tabIndex={0} className="explanation-panel">
        <div className="explanation-section"><h2>시작하는 방법</h2><p>{article?.content.gettingStarted || '공식 README에서 설치 조건과 사용 예시를 먼저 확인하세요. 아직 설치 방법을 검토하지 않았습니다.'}</p></div>
        <div className="explanation-section"><h2><FileText size={19}/>해설의 근거</h2><div className="explanation-sources">{evidence.sources.map(source => <a href={source.url} key={source.url} target="_blank" rel="noreferrer"><FileText size={18}/><span>{uiText(source.title)}<small>{new URL(source.url).hostname}</small></span><ArrowUpRight size={15}/></a>)}</div><p className="explanation-caveat">{checkedAt(evidence.fetchedAt)} KST 공식 자료 확인{evidence.readmeSha ? `, README ${evidence.readmeSha.slice(0, 7)}` : ''}. 실제 설치와 코드 실행은 검증하지 않았습니다.</p></div>
        {evidence.warnings.length > 0 && <div className="explanation-notice"><CircleAlert size={16}/><ul>{evidence.warnings.map(text => <li key={text}>{uiText(text)}</li>)}</ul></div>}
        {evidence.readme && <details className="explanation-readme"><summary>확인한 README 원문</summary><pre>{evidence.readme}</pre></details>}
      </section>
    </article>}
  </>;
}

type BriefListItem = { id: string; tagline: string; language: string | null; generatedAt: string; rank: number | null };
export function ExplanationLibrary() {
  const [articles, setArticles] = useState<BriefListItem[] | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/brief', { signal: controller.signal }).then(async response => {
      const body = await response.json() as { articles: BriefListItem[]; error?: string };
      if (!response.ok) throw new Error(body.error);
      if (!controller.signal.aborted) { setArticles(body.articles); setError(''); }
    }).catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [attempt]);
  return <><Link href="/" className="text-button explanation-back"><ArrowLeft size={15}/> 트렌딩 목록</Link><div className="page-heading"><div><h1>오픈소스, 쉽게 이해하기</h1><p>무엇을 하는 도구인지, 왜 주목받는지. 공식 자료를 읽고 한국어로 정리했어요.</p></div></div><div className="explanation-library-note"><RefreshCw size={15}/><p>오늘의 트렌딩 상위 10개를 자동 정리합니다. 각 해설에 확인한 출처와 갱신 시각을 표시합니다.</p></div>
    {error && <div className="inline-notice warning" role="alert"><CircleAlert size={18}/><div><p>{error}</p><button className="text-button" onClick={() => { setError(''); setAttempt(n => n + 1); }}>다시 시도 <RefreshCw size={14}/></button></div></div>}
    {!articles && !error && <div className="explanation-loading" role="status"><RefreshCw size={22} className="spin"/>해설 목록을 불러오고 있어요.</div>}
    {articles && articles.length > 0 && <div className="explanation-library">{articles.map(item => <Link href={explanationPath(item.id)} className="explanation-library-item" key={item.id}><div><span className="explanation-label">{item.rank ? `수집 당시 Trending #${item.rank}` : '오픈소스 해설'}</span><BookOpen size={19}/></div><p>{item.id.split('/')[0]}</p><h2>{item.id.split('/')[1]}</h2><p className="explanation-library-tagline">{uiText(item.tagline)}</p><footer><span>{item.language ?? '언어 미표시'}</span><span>자세히 읽기 <ArrowRight size={14}/></span></footer><small>{checkedAt(item.generatedAt)} KST 갱신</small></Link>)}</div>}
    {articles?.length === 0 && <div className="empty-state"><BookOpen size={30}/><h2>첫 해설을 준비하고 있어요.</h2><p>트렌딩 목록에서 레포를 선택하고 ‘자세히 알아보기’를 누르면 공식 자료를 먼저 확인할 수 있어요.</p><Link href="/" className="secondary-button">트렌딩 둘러보기 <ArrowRight size={15}/></Link></div>}
  </>;
}
