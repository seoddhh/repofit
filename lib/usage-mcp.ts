import { z } from 'zod';
import instructions from '../public/skills/repofit-usage-analysis/SKILL.md?raw';
import analysisSchema from '../public/skills/repofit-usage-analysis/analysis.schema.json';
import reportSchema from '../public/skills/repofit-usage-analysis/report.schema.json';
import { LocalAgentError } from './local-agent-store';
import { claimUsageRun, createUsageRun, getUsageRun, listUsageRuns, searchUsageSkills, updateUsageRun } from './usage-store';

type Definition = { name: string; description: string; inputSchema: { type: string; properties: Record<string, unknown>; required?: string[]; additionalProperties: boolean }; annotations: { readOnlyHint: boolean; destructiveHint: boolean; idempotentHint: boolean; untrustedContentHint: boolean } };
const object = (properties: Record<string, unknown>, required: string[] = []) => ({ type: 'object', properties, required, additionalProperties: false });
const uuid = { type: 'string', format: 'uuid' };
const define = (name: string, description: string, inputSchema: Definition['inputSchema'], readOnlyHint = true): Definition => ({ name, description, inputSchema, annotations: { readOnlyHint, destructiveHint: false, idempotentHint: readOnlyHint, untrustedContentHint: true } });
export const usageTools = [
  define('get_usage_analysis_instructions', 'RepoFit 에이전트 활용 분석 스킬과 두 단계의 출력 스키마를 읽습니다. 최근 대화 접근은 사용자 요청과 로컬 연결 프로그램의 동의 범위에 한정됩니다.', object({})),
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
  if (name === 'get_usage_analysis_instructions') { z.object({}).strict().parse(args); return { instructions, analysisSchema, reportSchema, historyScope: 'recent-10', version: 2 }; }
  if (name === 'search_usage_skills') return searchUsageSkills(args);
  if (name === 'claim_usage_analysis' || name === 'update_usage_analysis') {
    if (!context.deviceToken) throw new LocalAgentError('기기 인증이 필요합니다.', 401);
    if (name === 'claim_usage_analysis') { z.object({}).strict().parse(args); return claimUsageRun(context.deviceToken); }
    return updateUsageRun(context.deviceToken, args);
  }
  if (!context.userId) throw new LocalAgentError('로그인 후 본인의 분석을 조회해 주세요.', 401);
  if (name === 'request_usage_analysis') return createUsageRun(context.userId, args);
  if (name === 'list_usage_analyses') { z.object({}).strict().parse(args); return { runs: await listUsageRuns(context.userId) }; }
  if (name === 'get_usage_analysis') { const { id } = z.object({ id: z.string().uuid() }).strict().parse(args); return getUsageRun(context.userId, id); }
  throw new LocalAgentError('지원하지 않는 분석 도구입니다.', 404);
}
export const usageServerInstructions = 'RepoFit 활용 분석은 사용자가 선택한 후보와 관찰한 사용 방식에서 필요한 기능을 연결합니다. request_usage_analysis는 명시적 실행 요청과 동의가 있을 때만 사용하세요. 최근 대화 원문은 사이트에 보내지 않습니다. get_usage_analysis_instructions로 분석 절차를 읽고, 인증된 사용자 본인의 요청과 결과만 조회하세요. 설치 목록을 실제 사용이나 효과로 판단하지 마세요.';
