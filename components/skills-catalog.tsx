'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, BookOpen, Check, Clock3, Download, ListFilter, LoaderCircle, Puzzle, Search, X, Sparkles, ShieldCheck } from 'lucide-react';
import { categoryLabels, type CatalogEntry, type CatalogSnapshot } from '@/lib/catalog-types';
import { useModalDialog } from './use-modal-dialog';

const checked = (date: string) => new Date(date).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
export function SkillsCatalog({ initialQuery, initialSkill = '' }: { initialQuery: string; initialSkill?: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState('all');
  const [snapshot, setSnapshot] = useState<CatalogSnapshot | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState(initialSkill);
  const [limit, setLimit] = useState(30);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/skill-catalog', { signal: controller.signal }).then(async response => {
      const body = await response.json() as CatalogSnapshot & { error?: string }; if (!response.ok) throw new Error(body.error ?? '스킬 목록을 불러오지 못했습니다.');
      if (!controller.signal.aborted) { setSnapshot(body); setError(''); }
    }).catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [attempt]);
  const skills = snapshot?.skills ?? [];
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const filtered = skills.filter(skill => {
    const e = skill.explanation;
    return (category === 'all' || e.category === category) && words.every(word => [skill.name, skill.source, e.tagline, e.summary, ...e.capabilities, ...e.problems].join(' ').toLowerCase().includes(word));
  });
  const current = skills.find(skill => skill.id === selected);
  const close = () => setSelected('');
  const choose = (skill: CatalogEntry) => setSelected(skill.id);
  return <>
    <div className="page-heading catalog-heading"><div><div className="eyebrow">SKILLS, EXPLAINED</div><h1>스킬을 알고, 내 작업에 맞게.</h1><p>많이 설치된 스킬 300개를 용도부터 적용 방법까지 정리했어요.</p></div><Link href="/agent" className="secondary-button">내 에이전트와 비교 <ArrowRight size={16}/></Link></div>
    <section className="catalog-overview" aria-label="스킬 목록 안내"><div><span className="catalog-kicker"><BookOpen size={15}/> 한국어 스킬 가이드</span><h2>어떤 일을 맡길 수 있을까요?</h2><p>하고 싶은 일을 검색하거나 작업 분류로 살펴보세요.<br/>설치는 그다음에, 먼저 내게 필요한 기능인지 확인해요.</p></div><div className="catalog-overview-stats"><div><strong>{snapshot ? skills.length : '—'}</strong><span>누적 설치 상위 스킬</span></div><div><strong>매주 금요일</strong><span>{snapshot ? `${checked(snapshot.checkedAt)} KST 확인` : '저장된 자료를 읽고 있어요'}</span></div></div></section>
    <div className="catalog-layout"><aside className="catalog-sidebar"><div className="catalog-filter-title"><ListFilter size={16}/><h2>어떤 작업인가요?</h2></div><nav aria-label="스킬 작업 분류"><button aria-pressed={category === 'all'} className={category === 'all' ? 'selected' : ''} onClick={() => { setCategory('all'); setLimit(30); }}>전체 스킬 <span>{skills.length}</span></button>{Object.entries(categoryLabels).map(([key, label]) => { const count = skills.filter(s => s.explanation.category === key).length; return <button key={key} aria-pressed={category === key} className={category === key ? 'selected' : ''} onClick={() => { setCategory(key); setLimit(30); }}>{label}<span>{count}</span></button>; })}</nav><div className="catalog-sidebar-note"><ShieldCheck size={18}/><p>설치 수는 인기도의 신호예요. 내 작업과 환경에 맞는지는 별도로 비교해 보세요.</p></div></aside>
    <section className="catalog-main" aria-label="스킬 목록"><label className="catalog-search"><Search size={19}/><span className="sr-only">스킬 이름이나 하고 싶은 작업 검색</span><input value={query} onChange={e => { setQuery(e.target.value); setLimit(30); }} placeholder="이름 또는 하고 싶은 작업을 검색하세요" maxLength={100}/>{query && <button className="icon-button" onClick={() => { setQuery(''); setLimit(30); }} aria-label="검색 지우기"><X size={16}/></button>}</label>
      <div className="catalog-results-heading"><h2>{category === 'all' ? '전체 스킬' : categoryLabels[category as keyof typeof categoryLabels]} <span>{filtered.length}</span></h2><span>누적 설치 순위 기준</span></div>
      {error && <div className="inline-notice warning" role="alert"><p>{error}</p><button className="text-button" onClick={() => setAttempt(n => n + 1)}>다시 불러오기</button></div>}
      {!snapshot && !error && <div className="empty-state" role="status"><LoaderCircle className="spin" size={26}/><p>저장된 스킬 설명을 불러오고 있어요.</p></div>}
      {snapshot && <ol className="catalog-list">{filtered.slice(0, limit).map(skill => <li key={skill.id} value={skill.rank}><button className="catalog-row" onClick={() => choose(skill)}><span className="catalog-rank">{String(skill.rank).padStart(2, '0')}</span><div className="catalog-row-copy"><div className="catalog-row-title"><h3>{skill.name}</h3>{skill.availability === 'deprecated' && <span className="catalog-category">대체 항목 확인</span>}{skill.availability === 'moved' && <span className="catalog-category">출처 이동</span>}<span className="catalog-category">{categoryLabels[skill.explanation.category]}</span></div><p>{skill.explanation.tagline}</p><small>{skill.source}</small></div><div className="catalog-installs"><strong>{skill.installs.toLocaleString('ko-KR')}</strong><span><Download size={11}/> 누적 설치</span></div><ArrowRight className="catalog-row-arrow" size={17}/></button></li>)}</ol>}
      {snapshot && filtered.length === 0 && <div className="empty-state"><Search size={27}/><h3>일치하는 스킬이 없어요.</h3><p>다른 표현을 사용하거나 작업 분류를 바꿔보세요.</p><button className="secondary-button" onClick={() => { setQuery(''); setCategory('all'); }}>전체 스킬 보기</button></div>}
      {filtered.length > limit && <button className="secondary-button catalog-more" onClick={() => setLimit(n => n + 30)}>30개 더 보기 <span>{Math.min(limit, filtered.length)} / {filtered.length}</span></button>}
      {snapshot && <div className="list-footnote"><Clock3 size={14}/><span>{checked(snapshot.checkedAt)} KST 확인. 분류와 검색 결과에서도 원래 전체 순위를 유지합니다.</span><a href={snapshot.sourceUrl} target="_blank" rel="noreferrer">skills.sh 원본 <ArrowUpRight size={13}/></a></div>}
    </section></div>
    {current && <SkillDetail skill={current} onClose={close}/>}
  </>;
}
function SkillDetail({ skill, onClose }: { skill: CatalogEntry; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null); useModalDialog(ref);
  const e = skill.explanation;
  return <dialog ref={ref} className="detail-dialog catalog-dialog" aria-labelledby="skill-detail-title" onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }}><div className="catalog-detail">
    <div className="catalog-detail-top"><span><Puzzle size={15}/> 스킬 가이드</span><button className="icon-button" onClick={onClose} aria-label="스킬 설명 닫기"><X size={21}/></button></div>
    <div className="catalog-detail-labels"><span className="catalog-category">{categoryLabels[e.category]}</span><span>누적 설치 #{skill.rank}</span></div><p className="explanation-owner">{skill.source}</p><h2 id="skill-detail-title">{skill.name}</h2><p className="catalog-detail-tagline">{e.tagline}</p>
    <div className="catalog-detail-actions"><a href={`/agent?skill=${encodeURIComponent(skill.id)}`} className="primary-button">내 활용과 비교하기 <ArrowRight size={16}/></a><a href={skill.url} target="_blank" rel="noreferrer" className="secondary-button">원문과 설치 안내 <ArrowUpRight size={15}/></a></div>
    <div className="catalog-detail-date"><Clock3 size={14}/><span>{checked(skill.checkedAt)} KST 원문 확인 · {checked(skill.writtenAt)} KST 설명 작성</span></div>
    <section><h3><BookOpen size={19}/> 쉽게 말하면</h3><p>{e.summary}</p><div className="catalog-capabilities">{e.capabilities.map(text => <span key={text}>{text}</span>)}</div></section>
    <section><h3>이런 문제에 살펴보세요</h3><ul className="catalog-check-list">{e.problems.map(text => <li key={text}><Check size={16}/><span>{text}</span></li>)}</ul></section>
    <section><h3>이렇게 적용해요</h3><ol className="catalog-steps">{e.steps.map((text, index) => <li key={text}><span>{String(index + 1).padStart(2, '0')}</span><p>{text}</p></li>)}</ol></section>
    <section className="catalog-detail-pair"><div><h3><Sparkles size={18}/> 기대하는 변화</h3><ul>{e.benefits.map(text => <li key={text}>{text}</li>)}</ul><small>원문을 바탕으로 정리한 예상입니다. 실제 효과는 적용 후 확인하세요.</small></div><div><h3><ShieldCheck size={18}/> 먼저 확인하세요</h3><ul>{[...e.requirements, ...e.limitations].map(text => <li key={text}>{text}</li>)}</ul></div></section>
    <div className="catalog-personal-note"><div><h3>내 에이전트에서는 어떨까요?</h3><p>목표와 기존 스킬을 함께 비교해 필요한 이유와 적용 조건을 보고서로 확인하세요.</p></div><a href={`/agent?skill=${encodeURIComponent(skill.id)}`} className="text-button">나에게 맞게 살펴보기 <ArrowRight size={15}/></a></div>
    <footer className="catalog-detail-source"><a href={skill.url} target="_blank" rel="noreferrer">설명의 근거와 원문 <ArrowUpRight size={14}/></a><p>skills.sh 공개 원문을 읽고 한국어로 정리했습니다. 실제 설치와 실행 호환성은 검증하지 않았습니다.</p></footer>
  </div></dialog>;
}
