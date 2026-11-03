'use client';
import { useState } from 'react';
import { ArrowDown, ArrowRight, ArrowUpRight, BookOpen, Check, CheckCircle2, ChevronDown, Clipboard, Clock3, Download, FileText, Layers3, LoaderCircle, ScanText, ShieldCheck, Sparkles } from 'lucide-react';
import type { UsageRun, UsageCandidate, UsageAnalysis, UsageReport as Report } from '@/features/usage/usage-types';
import { downloadText } from '@/lib/download-text';

const date = (value: string) => new Date(value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const preview = (text: string, size = 100) => text.length > size ? `${text.slice(0, size).trim()}…` : text;
const findingId = (run: UsageRun, id: string) => `usage-finding-${run.id}-${id}`;
const criteria = { goal_context: '목표와 문맥', continuity: '문맥과 작업 연속성', scope: '작업 범위와 진행', verification: '검증과 완료', reuse: '반복 작업과 도구' };
const statuses = { confirmed_issue: '문제 확인', opportunity: '개선 가능성', insufficient_evidence: '판단 자료 부족', working_well: '잘 작동한 방식', not_applicable: '해당 없음' };
const attributions = { user: '사용자 요청', agent: '에이전트 행동', environment: '도구·실행 환경', shared: '여러 구간', unknown: '원인 미확인' };
const kinds = { user_request: '사용자 요청', agent_response: '에이전트 응답', command: '명령 실행', tool: '도구 호출' };
const sourceLabel = (id: string) => { const [, c, , item] = id.split('-'); return `사례 ${c} · 항목 ${Number(item) + 1}`; };
const verificationNote = (run: UsageRun) => run.executor === 'agent' ? '근거 유형과 요약은 사용자 에이전트가 보고한 내용이며, 서버가 대화 원문과 대조한 결과는 아닙니다.' : '근거의 유형은 로컬 항목과 대조하지만 요약과 원인 추정의 정확성을 독립적으로 검증한 결과는 아닙니다.';

export function reportMarkdown(run: UsageRun) {
  return [`# 에이전트 활용 분석 보고서`, `작성: ${date(run.createdAt)} KST`, `확인 범위: ${run.coverage?.threadsRead ?? 0}개 대화, ${run.coverage?.itemsRead ?? 0}개 항목`, '', run.report?.summary ?? run.analysis?.summary ?? run.message,
    '', '## 관찰한 활용 방식', ...(run.analysis?.patterns.flatMap((p, i) => [`### ${i + 1}. ${p.observation}`, `해석: ${p.interpretation}`, ...(p.assessment ? [
      `판단 기준: ${criteria[p.assessment.criterion]} · ${statuses[p.assessment.status]}`,
      `원인과 관련된 구간 (추정): ${attributions[p.assessment.attribution]}`, `원인 추정: ${p.assessment.cause}`, `확인한 영향과 미확인 사항: ${p.assessment.impact}`,
      `다른 해석과 판단 한계: ${p.assessment.alternativeExplanation}`, `다음 작업에서 확인할 것: ${p.assessment.nextCheck}`,
      '대표 근거:', ...p.assessment.evidence.map(e => `- ${sourceLabel(e.sourceId)} · ${kinds[e.kind]}: ${e.summary}`),
    ] : ['이전 형식의 보고서로, 판단 상태와 대표 근거 요약은 포함하지 않습니다.']), `필요한 기능: ${p.need}`, `근거 식별자: ${p.sourceIds.join(', ')}`, '']) ?? []),
    '', '## 유지하면 좋은 방식', ...(run.analysis?.strengths.map(s => `- ${s}`) ?? []),
    '', '## 추천 스킬과 적용 가이드', ...(run.report?.recommendations.flatMap((r, i) => { const c = run.candidates.find(c => c.id === r.catalogSkillId); return [`### ${i + 1}. ${c?.name ?? r.catalogSkillId}`, r.reason, `출처: ${c?.url ?? '미확인'}`, `원문 확인: ${c?.checkedAt ?? '미확인'}`, `기존 구성과의 관계: ${r.overlap}`, '준비 사항:', ...r.prerequisites.map(s => `- ${s}`), '적용 순서:', ...r.steps.map((s, n) => `${n + 1}. ${s}`), '요청 예시:', r.examplePrompt, '기대 변화 (예상):', ...r.expectedBenefits.map(s => `- ${s}`), '확인 기준:', ...r.checks.map(s => `- ${s}`), '']; }) ?? []),
    '', '## 현재 구성으로 시도할 방법', ...(run.report?.habits.flatMap(h => [`- ${h.action}`, `  예시: ${h.examplePrompt}`]) ?? []),
    '', '## 추가 확인이 필요한 기능', ...(run.report?.unmetNeeds.map(s => `- ${s}`) ?? []),
    '', '## 확인 범위와 한계', `판단 기준: ${run.analysis?.rubricVersion ?? '이전 형식 (기준 버전 미기록)'}`, `${verificationNote(run)} 실행 호환성과 기대 효과는 별도 확인이 필요합니다.`, ...[...(run.coverage?.warnings ?? []), ...(run.analysis?.limitations ?? []), ...(run.report?.limitations ?? [])].map(s => `- ${s}`)].join('\n');
}
function Finding({ pattern: p, run, index }: { pattern: UsageAnalysis['patterns'][number]; run: UsageRun; index: number }) {
  const cases = new Set(p.sourceIds.map(id => id.split('-')[1]));
  const related = run.report?.recommendations.filter(r => r.patternIds.includes(p.id)) ?? [];
  const a = p.assessment;
  return <details className="usage-report-finding" id={findingId(run, p.id)}>
    <summary><span className="usage-report-number">{String(index + 1).padStart(2, '0')}</span><div><span className="usage-report-overline">{cases.size}개 사례의 근거 연결{a ? ` · ${criteria[a.criterion]}` : ''}</span><h4>{preview(p.observation, 100)}</h4>{a && <span className={`usage-finding-status ${a.status}`}>{statuses[a.status]}</span>}</div><ChevronDown size={18}/></summary>
    <div className="usage-report-finding-body">
      <div><h5>관찰한 사실</h5><p>{p.observation}</p></div><div><h5>이렇게 해석했어요</h5><p>{p.interpretation}</p></div>
      {a ? <div className="usage-report-assessment"><div><h5>원인과 관련된 구간 · 추정</h5><span className="usage-report-chip">{attributions[a.attribution]}</span><p>{a.cause}</p></div><div><h5>확인한 영향과 미확인 사항</h5><p>{a.impact}</p></div><div><h5>다른 해석과 판단 한계</h5><p>{a.alternativeExplanation}</p></div><div><h5>다음 작업에서 확인할 것</h5><p>{a.nextCheck}</p></div></div> : <p className="usage-report-legacy">이전 형식의 보고서입니다. 판단 상태와 대표 근거 요약은 포함하지 않습니다.</p>}
      <div className="usage-report-need"><h5><ArrowDown size={14}/> 필요한 기능</h5><p>{p.need}</p>{related.length > 0 && <div className="usage-report-related">{related.map(r => <span key={r.catalogSkillId}><BookOpen size={13}/>{run.candidates.find(c => c.id === r.catalogSkillId)?.name}</span>)}</div>}</div>
      <details className="usage-report-sources"><summary>{a ? `대표 근거 ${a.evidence.length}개와 항목 유형` : `확인한 근거 항목 ${p.sourceIds.length}개`} <ChevronDown size={13}/></summary>
        {a ? <ol className="usage-report-evidence">{a.evidence.map(e => <li key={e.sourceId}><div><strong>{kinds[e.kind]}</strong><span>{sourceLabel(e.sourceId)}</span></div><p>{e.summary}</p></li>)}</ol> : <div>{p.sourceIds.map(id => <span key={id}>{sourceLabel(id)}</span>)}</div>}
        <p>분석에서 사용한 임시 항목 식별자입니다. 원문으로 이동하는 링크가 아니며, 요약과 원인 추정은 모델의 해석입니다.</p>
      </details>
    </div>
  </details>;
}
function CopyRequest({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  return <div className="usage-report-prompt"><div><span>에이전트에게 이렇게 요청하세요</span><button type="button" onClick={async () => { try { await navigator.clipboard.writeText(text); setCopied(true); setError(''); } catch { setError('요청문을 선택해 직접 복사해 주세요.'); } }}>{copied ? <Check size={15}/> : <Clipboard size={15}/>} {copied ? '복사됨' : '요청 복사'}</button></div><p>{text}</p>{error && <small role="status">{error}</small>}</div>;
}
function SectionTitle({ number, title, description }: { number: string; title: string; description: string }) {
  return <div className="usage-report-section-title"><span>{number}</span><div><h3>{title}</h3><p>{description}</p></div></div>;
}
function Recommendation({ recommendation: r, candidate: c, run, index }: { recommendation: Report['recommendations'][number]; candidate: UsageCandidate; run: UsageRun; index: number }) {
  const [reasonExpanded, setReasonExpanded] = useState(false);
  function showFinding(id: string) {
    const detail = document.getElementById(findingId(run, id));
    detail?.setAttribute('open', ''); detail?.scrollIntoView({ block: 'start' }); detail?.querySelector('summary')?.focus();
  }
  return <article className="usage-skill-card">
    <div className="usage-skill-card-heading"><span className="usage-report-number">{String(index + 1).padStart(2, '0')}</span><div><span className="usage-report-overline">{c.source}</span><h4>{c.name}</h4></div><span className="usage-report-chip"><BookOpen size={13}/> 적합성 검토 후보</span></div>
    <div className="usage-skill-reason"><p>{reasonExpanded ? r.reason : preview(r.reason, 240)}</p>{r.reason.length > 240 && <button type="button" className="text-button" aria-expanded={reasonExpanded} onClick={() => setReasonExpanded(!reasonExpanded)}>{reasonExpanded ? '추천 근거 접기' : '추천 근거 더보기'} <ChevronDown size={14}/></button>}</div>
    <div className="usage-skill-evidence"><span>이 사용 방식과 연결됩니다</span><div>{r.patternIds.map(id => { const i = run.analysis!.patterns.findIndex(p => p.id === id); return <button type="button" key={id} onClick={() => showFinding(id)}>관찰 {String(i + 1).padStart(2, '0')} <ArrowUpRight size={13}/></button>; })}</div></div>
    <div className="usage-report-two-columns"><div className="usage-report-outcome"><h5><Sparkles size={15}/> 기대하는 변화</h5><ul>{r.expectedBenefits.map((s, i) => <li key={i}>{s}</li>)}</ul></div><div className="usage-report-outcome"><h5><Layers3 size={15}/> 기존 구성과의 관계</h5><p>{r.overlap}</p></div></div>
    <CopyRequest text={r.examplePrompt}/>
    <details className="usage-report-disclosure"><summary><span><Clipboard size={16}/> 적용 순서와 준비 사항</span><ChevronDown size={16}/></summary><div className="usage-report-guide"><h5>시작 전 확인</h5><ul>{r.prerequisites.map((s, i) => <li key={i}>{s}</li>)}</ul><h5>작게 적용하는 순서</h5><ol>{r.steps.map((s, i) => <li key={i}><span>{i + 1}</span><p>{s}</p></li>)}</ol><h5>효과를 확인할 기준</h5><ul className="usage-report-checks">{r.checks.map((s, i) => <li key={i}><CheckCircle2 size={16}/><span>{s}</span></li>)}</ul></div></details>
    <footer className="usage-skill-footer"><span><Clock3 size={13}/> {date(c.checkedAt)} KST 원문 확인</span><a href={c.url} target="_blank" rel="noreferrer">원문과 설치 안내 <ArrowUpRight size={14}/></a></footer>
  </article>;
}
export function UsageReport({ run, busy, onCancel, onNew }: { run: UsageRun; busy: boolean; onCancel: () => void; onNew: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const running = ['queued', 'running'].includes(run.status);
  const complete = run.status === 'completed';
  const summary = run.report?.summary ?? run.analysis?.summary;
  const patterns = run.analysis?.patterns ?? [];
  const recommendations = run.report?.recommendations ?? [];
  const steps = [{ title: '분석 스킬 실행', note: '접근 가능한 작업 기록 확인' }, { title: '사용 방식 분석', note: '관찰과 필요한 기능 도출' }, { title: '보고서 작성', note: '후보 적합성과 활용 가이드 작성' }];
  const currentStep = complete ? 3 : run.analysis ? 2 : run.status === 'running' ? 0 : -1;
  return <article className="usage-report" aria-labelledby="usage-report-title">
    <header className="usage-report-header"><div className="usage-report-topline"><span><FileText size={15}/> REPOFIT · AGENT REPORT</span><span className={`usage-report-status ${complete ? 'complete' : ''}`}>{complete ? <CheckCircle2 size={14}/> : running ? <LoaderCircle size={14} className="spin"/> : <Clock3 size={14}/>}{{ queued: '분석 대기', running: '분석 중', completed: '분석 완료', failed: '분석 중단', canceled: '취소됨' }[run.status]}</span></div>
      <h2 id="usage-report-title">나의 에이전트<br/>{run.analysis ? '활용 분석 보고서' : '활용 분석 요청'}</h2><p className="usage-report-subtitle">{run.status === 'queued' && run.executor === 'agent' ? '요청 준비 완료 · 에이전트가 실행 요청을 받으면 시작됩니다.' : '사용 방식에서 찾은 필요한 기능과 스킬 활용 가이드'}</p>
      <div className="usage-report-meta"><span>{date(run.createdAt)} KST</span><span>{run.executor === 'agent' ? '내 에이전트 실행' : '내 Codex 작성'}</span></div>
      <div className="usage-report-actions">{run.analysis && <button type="button" className="secondary-button" onClick={() => downloadText(`repofit-usage-${run.id}.md`, reportMarkdown(run), 'text/markdown;charset=utf-8')}><Download size={15}/> 보고서 내려받기</button>}<button type="button" className="text-button" onClick={onNew}>{running ? '분석 안내 보기' : '새 분석 만들기'} <ArrowRight size={15}/></button></div>
    </header>
    <div className="usage-report-body">
      <div className="usage-report-metrics" aria-label="분석 범위와 결과"><div><span><ScanText size={15}/> 확인한 대화</span><strong>{run.coverage?.threadsRead ?? '—'}<small> / 최대 10개</small></strong></div><div><span><Layers3 size={15}/> 활용 방식 관찰</span><strong>{run.analysis ? patterns.length : '—'}<small>개</small></strong></div><div><span><BookOpen size={15}/> 추천 스킬</span><strong>{run.report ? recommendations.length : '—'}<small>개</small></strong></div></div>
      {summary && <section className="usage-report-summary"><span className="usage-report-overline">핵심 요약</span><p>{expanded ? summary : preview(summary, 360)}</p>{summary.length > 360 && <button type="button" className="text-button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? '요약 접기' : '전체 요약 읽기'} <ChevronDown size={15}/></button>}</section>}
      {!complete && <section className="usage-report-progress" aria-label="분석 진행 상황"><ol>{steps.map((step, i) => <li key={step.title} className={i < currentStep ? 'done' : i === currentStep ? 'current' : ''}><span>{i < currentStep ? <Check size={14}/> : i + 1}</span><div><strong>{step.title}</strong><p>{step.note}</p></div></li>)}</ol><p role="status">{run.message}</p>{running ? <button type="button" className="text-button" disabled={busy} onClick={onCancel}>분석 취소</button> : <button type="button" className="secondary-button" onClick={onNew}>연결 확인 후 다시 분석 <ArrowRight size={14}/></button>}</section>}
      {run.analysis && <>
        <section className="usage-report-section"><SectionTitle number="01" title="에이전트를 이렇게 사용하고 있어요" description="판단별로 대표 근거를 연결했습니다. 펼치면 원인 추정과 판단 한계를 확인할 수 있어요."/>
          <div className="usage-report-findings">{patterns.map((p, i) => <Finding key={p.id} pattern={p} run={run} index={i}/>)}</div>
        </section>
        {run.analysis.strengths.length > 0 && <section className="usage-report-strengths"><h3><CheckCircle2 size={18}/> 이 방식은 계속 활용하세요</h3><ul>{run.analysis.strengths.map((s, i) => <li key={i}><Check size={15}/><span>{s}</span></li>)}</ul></section>}
      </>}
      {run.report && <>
        <section className="usage-report-section"><SectionTitle number="02" title="이런 스킬을 살펴보세요" description="관찰한 사용 방식과 필요한 기능을 연결한 후보입니다."/>
          {recommendations.length ? <div className="usage-report-skills">{recommendations.map((r, i) => <Recommendation key={r.catalogSkillId} recommendation={r} candidate={run.candidates.find(c => c.id === r.catalogSkillId)!} run={run} index={i}/>)}</div> : <div className="usage-report-empty"><ShieldCheck size={24}/><h4>추가 스킬이 꼭 필요한 것은 아니에요.</h4><p>이번 자료에서는 새 스킬을 추천할 충분한 근거를 찾지 못했습니다. 현재 구성으로 시도할 방법부터 확인해 보세요.</p></div>}
        </section>
        {run.report.habits.length > 0 && <section className="usage-report-section"><SectionTitle number="03" title="지금 구성으로 먼저 시도해 보세요" description="설치 없이도 적용할 수 있는 요청과 진행 방식입니다."/><div className="usage-report-habits">{run.report.habits.map((h, i) => <article key={i}><span className="usage-report-overline">실천 {String(i + 1).padStart(2, '0')}</span><h4>{h.action}</h4><CopyRequest text={h.examplePrompt}/></article>)}</div></section>}
        {run.report.unmetNeeds.length > 0 && <section className="usage-report-unmet"><h3>아직 답을 찾지 못한 부분</h3><ul>{run.report.unmetNeeds.map((s, i) => <li key={i}>{s}</li>)}</ul></section>}
      </>}
      {run.analysis && <details className="usage-report-method"><summary><span><ShieldCheck size={17}/> 분석 근거와 확인 범위</span><ChevronDown size={16}/></summary><div><dl><div><dt>확인한 자료</dt><dd>{run.coverage?.threadsRead}개 대화, {run.coverage?.itemsRead}개 항목</dd></div><div><dt>분석 시점</dt><dd>{run.coverage ? date(run.coverage.observedAt) : date(run.createdAt)} KST</dd></div><div><dt>분석 범위</dt><dd>{run.coverage?.truncated ? '길이 제한과 조회 가능 범위에 따른 일부 항목' : '확인 가능한 대화 항목'}</dd></div><div><dt>판단 기준</dt><dd>{run.analysis.rubricVersion === 'workflow-evidence-v1' ? '작업 흐름 근거 v1 · 주요 판단 최대 5개, 대표 근거 각 최대 3개' : '이전 형식 · 기준 버전 미기록'}</dd></div></dl><p>사용자 에이전트가 작성한 분석입니다. 전체 사용 이력에 대한 판정이나 숙련도 점수가 아닙니다. {verificationNote(run)} 스킬의 실행 호환성과 기대 효과도 별도로 확인해야 합니다.</p><ul>{[...new Set([...(run.coverage?.warnings ?? []), ...run.analysis.limitations, ...(run.report?.limitations ?? [])])].map((s, i) => <li key={i}>{s}</li>)}</ul><button type="button" className="text-button" onClick={() => downloadText(`repofit-usage-${run.id}.json`, JSON.stringify(run, null, 2), 'application/json')}>분석 데이터 JSON 내려받기 <Download size={14}/></button></div></details>}
    </div>
    <footer className="usage-report-footer"><span><ShieldCheck size={14}/> 본인 계정의 분석 기록 · 30일 보관</span><span>RepoFit</span></footer>
  </article>;
}
