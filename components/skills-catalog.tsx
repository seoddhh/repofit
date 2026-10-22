'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight, ArrowUpRight, Bot, Download, LoaderCircle, Puzzle, Search } from 'lucide-react';
import { skillSearchQuery, type SkillSearchResult } from '@/lib/skills-types';

const topics = [{ label: '에이전트', query: 'agent' }, { label: '프론트엔드', query: 'react' }, { label: '코드 리뷰', query: 'code review' }, { label: '디자인', query: 'design' }, { label: '테스트', query: 'testing' }, { label: '문서', query: 'documentation' }];
export function SkillsCatalog({ initialQuery }: { initialQuery: string }) {
  const [input, setInput] = useState(initialQuery);
  const [query, setQuery] = useState(initialQuery);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<SkillSearchResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    const valid = skillSearchQuery.safeParse(query);
    if (!valid.success) { setError(valid.error.issues[0].message); setLoading(false); return () => controller.abort(); }
    setLoading(true); setError(''); setResult(null);
    void (async () => {
      try {
        const response = await fetch(`/api/skills?q=${encodeURIComponent(valid.data)}`, { signal: controller.signal, cache: 'no-store' });
        const data = await response.json() as SkillSearchResult & { error?: string };
        if (!response.ok) throw new Error(data.error ?? '검색 결과를 불러오지 못했습니다.');
        if (!controller.signal.aborted) setResult(data);
      } catch (error) { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : '검색 결과를 불러오지 못했습니다.'); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [query, attempt]);
  function search(value: string) {
    const valid = skillSearchQuery.safeParse(value);
    if (!valid.success) { setError(valid.error.issues[0].message); return; }
    setInput(valid.data); setQuery(valid.data); setAttempt(current => current + 1);
  }
  return <>
    <div className="page-heading"><div><div className="eyebrow">AGENT SKILLS</div><h1>스킬</h1><p>에이전트가 더 잘할 수 있는 일을 찾아보세요.<br/>skills.sh에서 설치 가능한 스킬을 검색합니다.</p></div><Link href="/agent" className="secondary-button"><Bot size={16}/> 내 에이전트 <ArrowRight size={15}/></Link></div>
    <div className="discovery-layout skills-layout"><section className="skills-main" aria-label="스킬 탐색">
      <form className="skills-search-form" onSubmit={event => { event.preventDefault(); search(input); }}><label className="skills-search-field"><Search size={19}/><input aria-label="찾을 스킬" placeholder="스킬 이름이나 하고 싶은 작업을 검색하세요" value={input} maxLength={100} onChange={event => setInput(event.target.value)}/></label><button className="primary-button" type="submit" disabled={loading}>{loading ? <LoaderCircle className="spin" size={16}/> : <Search size={16}/>} 검색</button></form>
      <div className="skills-topics" role="group" aria-label="스킬 주제">{topics.map(topic => <button key={topic.query} type="button" aria-pressed={query === topic.query} className={query === topic.query ? 'selected' : ''} onClick={() => search(topic.query)}>{topic.label}</button>)}</div>
      <div className="skills-results-heading"><h2>{query} <span>검색 결과</span></h2><span>출처 skills.sh</span></div>
      <div className="repo-list skills-results" aria-busy={loading}>
        {loading && <div className="empty-state" role="status"><LoaderCircle className="spin" size={24}/><h3>스킬을 찾고 있습니다.</h3><p>skills.sh의 검색 결과를 가져옵니다.</p></div>}
        {!loading && error && <div className="empty-state" role="alert"><Search size={26}/><h3>검색을 완료하지 못했어요.</h3><p>{error}</p><button className="secondary-button" onClick={() => search(input)}>다시 검색</button><a className="text-button" href={`https://skills.sh/?q=${encodeURIComponent(query)}`} target="_blank" rel="noreferrer">skills.sh에서 확인 <ArrowUpRight size={14}/></a></div>}
        {!loading && !error && result && <>
          {result.stale && <p className="skills-stale" role="status">현재 조회에 실패해 이전 검색 결과를 표시합니다.</p>}
          {result.skills.length ? <ul className="skills-list">{result.skills.map(skill => <li key={skill.id}><div className="skill-catalog-icon"><Puzzle size={21} strokeWidth={1.6}/></div><div className="skill-catalog-copy"><a className="skill-catalog-name" href={skill.url} target="_blank" rel="noreferrer">{skill.name} <ArrowUpRight size={14}/></a><p>{skill.source}</p><div className="skill-catalog-links"><a href={skill.url} target="_blank" rel="noreferrer">설명·설치 방법 <ArrowUpRight size={12}/></a>{skill.repositoryUrl && <a href={skill.repositoryUrl} target="_blank" rel="noreferrer">소스 저장소 <ArrowUpRight size={12}/></a>}</div></div><div className="skill-catalog-installs"><strong>{skill.installs.toLocaleString('ko-KR')}</strong><span><Download size={11}/> 설치 집계</span></div></li>)}</ul> : <div className="empty-state"><Search size={26}/><h3>일치하는 스킬이 없어요.</h3><p>다른 작업이나 기술 이름으로 검색해 보세요.</p></div>}
          <div className="list-footnote"><span className={`status-dot ${result.stale ? 'stale' : ''}`}/><span>{new Date(result.fetchedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} KST 확인 · 최대 {result.limit}개 검색 결과</span></div>
        </>}
      </div>
    </section><aside className="discovery-aside skills-aside">
      <section className="project-context"><div className="section-heading"><h2>내 에이전트에 더하기</h2><Bot size={19}/></div><p>관심 있는 스킬의 설명과 설치 방법을 확인하고, 내 구성과 함께 살펴보세요.</p><Link href="/agent" className="secondary-button full-width">내 스킬 구성 보기 <ArrowRight size={15}/></Link></section>
      <section className="quiet-section"><h2>스킬은 무엇인가요?</h2><p>에이전트에게 작업 절차와 도구 사용법을 알려주는 지침입니다. 코드 라이브러리와 별도로 에이전트에 추가해 사용합니다.</p><p>설치 집계는 skills.sh가 제공한 수치이며 실제 사용 횟수나 내 에이전트의 호환성을 의미하지 않습니다.</p><a className="text-button" href="https://skills.sh/docs" target="_blank" rel="noreferrer">스킬 사용 가이드 <ArrowUpRight size={14}/></a></section>
      <div className="capability-note"><Puzzle size={16}/><p>스킬 이름과 출처는 검색 API 자료입니다. 자세한 설명과 지원 에이전트는 원문에서 확인하세요.</p></div>
    </aside></div>
  </>;
}
