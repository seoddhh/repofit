import { z } from 'zod';
import { SNAPSHOT_DATE } from './fixtures';

export const demoSteps = [
  { title:'Today 목록 확인', detail:'예시 스냅샷의 레포 12개를 불러옵니다.', result:'예시 레포 12개 확인', duration:700 },
  { title:'프로젝트 자료 확인', detail:'상위 10개 레포의 README 확인을 시뮬레이션합니다.', result:'README 확인 10/10 · 데모', duration:1200 },
  { title:'기본 요약 작성', detail:'용도와 사용 사례를 정리합니다.', result:'기본 요약 10/10 · 데모', duration:1200 },
  { title:'심층 후보 선정', detail:'분야가 다른 후보 3개를 선택합니다.', result:'AI · 개발 도구 · 인프라 후보 선정', duration:900 },
  { title:'심층 분석', detail:'선택한 3개 레포의 상세 보고서를 구성합니다.', result:'심층 보고서 3개 구성 · 데모', duration:1400 },
  { title:'보고서 정리', detail:'전체 요약과 근거 링크를 구성합니다.', result:'예시 보고서 저장', duration:900 },
];
const runSchema = z.object({
  id:z.string().min(1).max(100), date:z.literal(SNAPSHOT_DATE), createdAt:z.string().datetime(),
  status:z.enum(['running','paused','completed','partial','canceled']),
  step:z.number().int().min(0).max(demoSteps.length),
  scenario:z.enum(['success','partial']),
});
export type DemoRun = z.infer<typeof runSchema>;
export const STORAGE_KEY = 'repofit-ui-demo-v1';
export function createDemoRun(scenario:DemoRun['scenario']):DemoRun {
  return { id:crypto.randomUUID(), date:SNAPSHOT_DATE, createdAt:new Date().toISOString(), status:'running', step:0, scenario };
}
export function advanceDemoRun(run:DemoRun):DemoRun {
  if(run.status!=='running') return run;
  const step = Math.min(run.step+1,demoSteps.length);
  return {...run, step, status:step===demoSteps.length?(run.scenario==='partial'?'partial':'completed'):'running'};
}
export function parseDemoRuns(raw:string):DemoRun[] {
  const result=z.array(runSchema).max(50).safeParse(JSON.parse(raw));
  if(!result.success) throw new Error('Invalid demo history');
  return result.data.map(run=>run.status==='running'?{...run,status:'paused' as const}:run);
}
export const isFinished = (run:DemoRun) => run.status==='completed'||run.status==='partial';
export function reportMarkdown(run:DemoRun, entries:typeof import('./fixtures').repos):string {
  const failed=run.scenario==='partial'?'firecrawl/firecrawl':null;
  return [`# RepoFit · Today 분석 예시`, '', '> 데모 보고서입니다. 실제 GitHub Today 순위나 AI 분석 결과가 아닙니다.', '', `- 예시 스냅샷: ${run.date}`, '- 범위: 기본 10개 · 심층 3개', '', '## 전체 요약', 'AI 앱 개발, 개발 환경 표준화, 백엔드 구성에 사용할 수 있는 도구를 비교하는 예시입니다.', ...entries.slice(0,10).map(repo=>repo.id===failed?`\n## ${repo.id}\n\n자료 확인 실패를 시뮬레이션했습니다.\n`:`\n## ${repo.id}\n\n${repo.summary}\n\n### 활용 상황\n${repo.useCases.map(s=>'- '+s).join('\n')}\n\n### 장점\n${repo.strengths.map(s=>'- '+s).join('\n')}\n\n### 확인할 점\n${repo.limitations.map(s=>'- '+s).join('\n')}\n\n### 시작하기\n${repo.gettingStarted}\n\n[README 참고 링크](https://github.com/${repo.id}#readme)\n\n실제 자료 조회와 코드 실행 검증은 수행하지 않았습니다.\n`)].join('\n');
}
