'use client';
import { GithubIcon as Github } from './github-icon';
import { useEffect, useRef } from 'react';
import { X, ArrowUpRight, Star, ArrowRight, Check, FileText, ShieldCheck, CircleHelp, Code2, Sparkles } from 'lucide-react';
import { number, type Repo } from '@/lib/fixtures';

export function RepoTile({repo,small=false}:{repo:Repo;small?:boolean}) {
  return <span className={`repo-tile tile-${repo.tile} ${small?'small':''}`} aria-hidden="true">{repo.monogram}</span>;
}
export function RepoDetail({repo,onClose,analyzed=false,failed=false}:{repo:Repo;onClose:()=>void;analyzed?:boolean;failed?:boolean}) {
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const dialog=ref.current;dialog?.showModal();return()=>dialog?.close();},[]);
  return <dialog ref={ref} className="detail-dialog" aria-labelledby="detail-title" onCancel={onClose} onClick={e=>{if(e.target===e.currentTarget) onClose();}}>
    <div className="detail-inner">
      <div className="detail-topline"><span><Code2 size={15}/> REPOSITORY DETAIL</span><button className="icon-button" onClick={onClose} aria-label="상세 닫기"><X size={20}/></button></div>
      <RepoTile repo={repo}/><h2 id="detail-title" className="detail-title"><span>{repo.id.split('/')[0]} /</span>{repo.id.split('/')[1]}</h2>
      <p className="detail-description">{repo.description}</p>
      <div className="detail-meta"><span><i style={{background:repo.color}}/>{repo.language}</span><span><Star size={14}/>{number(repo.stars)}</span><span className="category-badge">{repo.category}</span></div>
      <a className="secondary-button full-width" href={`https://github.com/${repo.id}`} target="_blank" rel="noreferrer"><Github size={16}/> GitHub에서 보기 <ArrowUpRight size={15}/></a>
      <div className="detail-demo"><Sparkles size={15}/> {analyzed&&!failed?'아래는 예시 분석입니다. 실제 자료 조회·코드 검증은 수행하지 않았어요.':failed?'자료 확인 실패를 시뮬레이션한 항목입니다.':'예시 레포 정보입니다. 분석 보고서에서 활용 방법을 살펴보세요.'}</div>
      {analyzed&&!failed&&repo.summary?<>
        <section className="detail-section"><h3><FileText size={17}/> 어떤 프로젝트인가요?</h3><p>{repo.summary}</p></section>
        <section className="detail-section"><h3><ArrowRight size={17}/> 이런 상황에 살펴보세요</h3>{repo.useCases.map(text=><div className="detail-list" key={text}><Check size={15}/><span>{text}</span></div>)}</section>
        <section className="detail-section"><h3><ShieldCheck size={17}/> 기대할 수 있는 점</h3>{repo.strengths.map(text=><div className="detail-list" key={text}><Check size={15}/><span>{text}</span></div>)}</section>
        <section className="detail-section"><h3><CircleHelp size={17}/> 도입 전에 확인할 점</h3>{repo.limitations.map(text=><p className="check-point" key={text}>{text}</p>)}</section>
        <section className="detail-section"><h3><Code2 size={17}/> 시작하는 방법</h3><p>{repo.gettingStarted}</p></section>
      </>:<section className="detail-section"><h3>{failed?'자료를 확인하지 못했어요':'아직 분석하지 않은 레포예요'}</h3><p>{failed?'다른 레포의 결과는 보고서에서 확인할 수 있습니다.':'Today 목록의 상위 10개가 데모 분석 대상입니다. 나머지 레포는 원본 정보만 제공합니다.'}</p></section>}
      <section className="detail-section"><h3>참고 자료</h3><a className="evidence-link" href={`https://github.com/${repo.id}#readme`} target="_blank" rel="noreferrer"><FileText size={17}/><span>프로젝트 README<small>공식 레포 링크 · 실제 조회하지 않음</small></span><ArrowUpRight size={15}/></a><div className="license-note">라이선스 예시: {repo.license}<br/>실제 적용 시 최신 라이선스를 직접 확인하세요.</div></section>
    </div>
  </dialog>;
}
