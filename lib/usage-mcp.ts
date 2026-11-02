import { z } from 'zod';
import instructions from '../public/skills/repofit-usage-analysis/SKILL.md?raw';
import analysisSchema from '../public/skills/repofit-usage-analysis/analysis.schema.json';
import reportSchema from '../public/skills/repofit-usage-analysis/report.schema.json';
import { LocalAgentError } from './local-agent-store';
import { claimUsageRun, createUsageRun, getUsageRun, listUsageRuns, searchUsageSkills, startAgentUsageRun, updateAgentUsageRun, updateUsageRun } from './usage-store';

type Definition = { name: string; description: string; inputSchema: { type: string; properties: Record<string, unknown>; required?: string[]; additionalProperties: boolean }; annotations: { readOnlyHint: boolean; destructiveHint: boolean; idempotentHint: boolean; untrustedContentHint: boolean } };
const object = (properties: Record<string, unknown>, required: string[] = []) => ({ type: 'object', properties, required, additionalProperties: false });
const uuid = { type: 'string', format: 'uuid' };
const define = (name: string, description: string, inputSchema: Definition['inputSchema'], readOnlyHint = true): Definition => ({ name, description, inputSchema, annotations: { readOnlyHint, destructiveHint: false, idempotentHint: readOnlyHint, untrustedContentHint: true } });
const coverageSchema = object({ observedAt: { type: 'string', format: 'date-time' }, threadsRead: { type: 'integer', minimum: 1, maximum: 10 }, itemsRead: { type: 'integer', minimum: 1, maximum: 400 }, truncated: { type: 'boolean' }, warnings: { type: 'array', maxItems: 15, items: { type: 'string', maxLength: 500 } } }, ['observedAt', 'threadsRead', 'itemsRead', 'truncated', 'warnings']);
const skillBundle = () => ({ instructions, analysisSchema, reportSchema, historyScope: 'accessible-up-to-10', version: 3 });
export const usageTools = [
  define('get_usage_analysis_instructions', '사용자 조건 입력 없이 작업 기록에서 활용 방식·개선 기회·필요한 스킬을 도출하는 RepoFit 분석 스킬과 출력 스키마를 읽습니다. 접근할 수 있는 자료만 사용하세요.', object({})),
  define('start_usage_analysis', '사용자가 에이전트 활용 분석을 요청하면 실행하세요. 본인 분석을 시작하고 RepoFit 스킬과 스키마를 받습니다. 설문·목표·후보·Mac 연결은 필요하지 않습니다. 에이전트가 접근 허용된 작업 기록을 최대 10개 읽고 직접 분석하세요. 원문은 제출하지 않고 요약과 보고서를 30일 보관합니다. 웹에서 준비한 요청이 있으면 id를 지정하세요. consent는 사용자가 분석과 요약 보관을 요청한 경우에만 true입니다.', object({ id: uuid, consent: { type: 'boolean', const: true } }, ['consent']), false),
  define('submit_usage_analysis', 'start_usage_analysis로 시작한 본인 보고서를 제출합니다. prepare로 RepoFit 스킬 기반 분석과 실제 확인 범위를 보내 후보를 받고, complete로 해당 후보에 근거한 최종 보고서를 제출하세요. 반환된 최신 revision을 사용하세요. 과거 기록에 접근할 수 없으면 현재 확인 범위만 분석하며 원문·개인정보를 전송하지 마세요. 자료가 없거나 실패하면 fail을 사용하세요.', object({ id: uuid, expectedRevision: { type: 'integer', minimum: 0 }, action: { type: 'string', enum: ['prepare', 'complete', 'fail'] }, analysis: analysisSchema, coverage: coverageSchema, report: reportSchema, reason: { type: 'string', enum: ['no_history', 'history_unavailable', 'model_failed'] } }, ['id', 'expectedRevision', 'action']), false),
  define('search_usage_skills', '저장된 RepoFit 스킬 설명을 검색합니다. query 또는 사용자가 선택한 ids를 지정하세요. 원문 설명과 확인 시점을 반환하며 설치나 호환성 검증을 하지 않습니다.', object({ query: { type: 'string', maxLength: 100 }, ids: { type: 'array', maxItems: 5, items: { type: 'string', maxLength: 600 } }, limit: { type: 'integer', minimum: 1, maximum: 12 } })),
  define('list_usage_analyses', '인증된 사용자 본인의 활용 분석 요청과 결과를 조회합니다. 대화 원문은 저장하거나 반환하지 않습니다.', object({})),
  define('get_usage_analysis', '인증된 사용자 본인의 분석 상태, 사용 방식의 근거 요약, 스킬 추천을 조회합니다.', object({ id: uuid }, ['id'])),
  define('request_usage_analysis', '사용자가 요청한 경우에만 연결된 Mac에서 최근 최대 10개 Codex 대화를 새 Codex 실행으로 분석합니다. 원문 일부가 사용자의 Codex 모델 서비스에 전달되며 분석 결과는 30일 보관됩니다. 기기 연결과 실행 동의가 필요합니다.', object({ deviceId: uuid, goal: { type: 'string', maxLength: 1000 }, selectedSkillIds: { type: 'array', maxItems: 5, items: { type: 'string', maxLength: 600 } }, consent: { const: true, type: 'boolean' }, historyScope: { const: 'recent-10', type: 'string' } }, ['deviceId', 'consent', 'historyScope']), false),
];
export const usageDeviceTools = [
  define('claim_usage_analysis', '연결 프로그램 전용. 인증한 기기에 배정된 분석 한 건을 원자적으로 가져옵니다.', object({}), false),
  define('update_usage_analysis', '연결 프로그램 전용. 현재 작업의 lease로 진행 상태, 검증한 근거 요약 또는 최종 보고서를 제출합니다. 대화 원문은 보내지 마세요.', object({ action: { type: 'string', enum: ['heartbeat', 'prepare', 'complete', 'fail'] }, id: uuid, lease: { type: 'string', pattern: '^[a-f0-9]{48}$' }, analysis: analysisSchema, coverage: object({ observedAt: { type: 'string', format: 'date-time' }, threadsRead: { type: 'integer', minimum: 1, maximum: 10 }, itemsRead: { type: 'integer', minimum: 1, maximum: 400 }, truncated: { type: 'boolean' }, warnings: { type: 'array', maxItems: 15, items: { type: 'string', maxLength: 500 } } }, ['observedAt', 'threadsRead', 'itemsRead', 'truncated', 'warnings']), report: reportSchema, reason: { type: 'string', enum: ['no_history', 'history_unavailable', 'model_failed'] } }, ['action', 'id', 'lease']), false),
];
export async function callUsageTool(name: string, args: unknown, context: { userId?: string; deviceToken?: string }) {
  if (name === 'get_usage_analysis_instructions') { z.object({}).strict().parse(args); return skillBundle(); }
  if (name === 'search_usage_skills') return searchUsageSkills(args);
  if (name === 'claim_usage_analysis' || name === 'update_usage_analysis') {
    if (!context.deviceToken) throw new LocalAgentError('기기 인증이 필요합니다.', 401);
    if (name === 'claim_usage_analysis') { z.object({}).strict().parse(args); return claimUsageRun(context.deviceToken); }
    return updateUsageRun(context.deviceToken, args);
  }
  if (!context.userId) throw new LocalAgentError('로그인 후 본인의 분석을 조회해 주세요.', 401);
  if (name === 'start_usage_analysis') return { run: await startAgentUsageRun(context.userId, args), ...skillBundle() };
  if (name === 'submit_usage_analysis') return updateAgentUsageRun(context.userId, args);
  if (name === 'request_usage_analysis') return createUsageRun(context.userId, args);
  if (name === 'list_usage_analyses') { z.object({}).strict().parse(args); return { runs: await listUsageRuns(context.userId) }; }
  if (name === 'get_usage_analysis') { const { id } = z.object({ id: z.string().uuid() }).strict().parse(args); return getUsageRun(context.userId, id); }
  throw new LocalAgentError('지원하지 않는 분석 도구입니다.', 404);
}
export const usageServerInstructions = '사용자가 에이전트 활용 분석을 요청하면 start_usage_analysis로 RepoFit 분석 스킬을 받고 실행하세요. 사용자에게 목표·분석 조건·후보·Mac 페어링을 요구하지 마세요. 접근 허용된 최근 작업 기록을 최대 10개 사용하며 한 개만 있어도 그 범위로 분석합니다. 접근하지 못한 기록을 읽었다고 주장하지 마세요. RepoFit 스킬의 기준으로 관찰·원인 추정·대표 근거·필요 기능을 작성하고 submit_usage_analysis prepare로 후보를 받은 뒤 complete로 보고서를 제출하세요. 원문은 보내지 않고 요약과 보고서를 30일 저장합니다. request_usage_analysis는 기존 로컬 실행기 전용 대안입니다.';
