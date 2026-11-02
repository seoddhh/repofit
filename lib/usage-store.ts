import { and, desc, eq, gt, inArray, isNull, lt, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../db';
import { agentUsageRuns as runs, localAgentDevices as devices } from '../db/schema';
import { authenticateLocalDevice, listLocalDevices, LocalAgentError } from './local-agent-store';
import { readSkillCatalog } from './catalog-store';
import type { CatalogSnapshot } from './catalog-types';
import { agentUsageRequestSchema, usageAnalysisSchema, usageCoverageSchema, usageRequestSchema, validateUsageReport, type UsageAnalysis, type UsageCoverage, type UsageCandidate, type UsageRun } from './usage-types';

const now = () => new Date().toISOString();
const hash = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2, '0')).join('');
const secret = () => Array.from(crypto.getRandomValues(new Uint8Array(24)), b => b.toString(16).padStart(2, '0')).join('');
function publicRun(row: typeof runs.$inferSelect): UsageRun {
  const { userId: _owner, leaseHash: _hash, leaseExpiresAt: _expiry, activeDeviceKey: _active, ...result } = row;
  return result;
}
async function expireRuns() {
  await getDb().update(runs).set({ status: 'failed', activeDeviceKey: null, message: '에이전트 실행을 시작하지 않아 요청이 만료됐습니다. 새 분석을 요청해 주세요.', updatedAt: now(), revision: sql`${runs.revision} + 1` }).where(and(eq(runs.executor, 'agent'), eq(runs.status, 'queued'), lt(runs.createdAt, new Date(Date.now() - 30 * 60000).toISOString())));
  await getDb().update(runs).set({ status: 'failed', leaseHash: null, leaseExpiresAt: null, activeDeviceKey: null, message: '연결이 끊겨 분석이 중단됐습니다. 연결 상태를 확인하고 새로 요청해 주세요.', updatedAt: now(), revision: sql`${runs.revision} + 1` }).where(and(eq(runs.status, 'running'), lt(runs.leaseExpiresAt, now())));
  await getDb().delete(runs).where(lt(runs.expiresAt, now()));
}
export async function listUsageRuns(userId: string) {
  await expireRuns();
  return getDb().select({ id: runs.id, deviceId: runs.deviceId, executor: runs.executor, goal: runs.goal, selectedSkillIds: runs.selectedSkillIds, status: runs.status, revision: runs.revision, createdAt: runs.createdAt, updatedAt: runs.updatedAt, expiresAt: runs.expiresAt, message: runs.message }).from(runs).where(and(eq(runs.userId, userId), gt(runs.expiresAt, now()))).orderBy(desc(runs.createdAt)).limit(30);
}
export async function createAgentUsageRun(userId: string, value: unknown) {
  agentUsageRequestSchema.parse(value);
  await expireRuns();
  const key = `agent:${userId}`;
  const [active] = await getDb().select().from(runs).where(and(eq(runs.userId, userId), eq(runs.activeDeviceKey, key)));
  if (active) return publicRun(active);
  const [recent] = await getDb().select({ count: sql<number>`count(*)` }).from(runs).where(and(eq(runs.userId, userId), gt(runs.createdAt, new Date(Date.now() - 60000).toISOString())));
  if (Number(recent.count) >= 3) throw new LocalAgentError('분석 요청은 1분에 3개까지 만들 수 있습니다.', 429);
  const timestamp = now();
  try {
    const [row] = await getDb().insert(runs).values({ id: crypto.randomUUID(), userId, deviceId: null, executor: 'agent', goal: '', selectedSkillIds: [], status: 'queued', revision: 0, createdAt: timestamp, updatedAt: timestamp, expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(), message: '에이전트 실행 요청을 준비했습니다. 연결된 에이전트에서 실행하면 보고서가 여기에 표시됩니다.', candidates: [], activeDeviceKey: key }).returning();
    return publicRun(row);
  } catch (error) {
    const [existing] = await getDb().select().from(runs).where(and(eq(runs.userId, userId), eq(runs.activeDeviceKey, key)));
    if (existing) return publicRun(existing);
    throw error;
  }
}
export async function startAgentUsageRun(userId: string, value: unknown) {
  const input = agentUsageRequestSchema.extend({ id: z.string().uuid().optional() }).parse(value);
  const run = input.id ? await getUsageRun(userId, input.id) : await createAgentUsageRun(userId, { consent: input.consent });
  if (run.executor !== 'agent' || run.status !== 'queued') throw new LocalAgentError('이미 실행했거나 종료된 에이전트 요청입니다.', 409);
  const [row] = await getDb().update(runs).set({ status: 'running', leaseExpiresAt: new Date(Date.now() + 30 * 60000).toISOString(), updatedAt: now(), revision: sql`${runs.revision} + 1`, message: '사용자 에이전트가 RepoFit 분석 스킬로 접근 가능한 작업 기록을 살펴보고 있습니다.' }).where(and(eq(runs.id, run.id), eq(runs.userId, userId), eq(runs.executor, 'agent'), eq(runs.status, 'queued'), eq(runs.revision, run.revision))).returning();
  if (!row) throw new LocalAgentError('다른 실행에서 이미 시작한 요청입니다.', 409);
  return publicRun(row);
}
const agentUpdateBase = { id: z.string().uuid(), expectedRevision: z.number().int().min(0) };
export const agentUsageUpdateSchema = z.discriminatedUnion('action', [
  z.object({ ...agentUpdateBase, action: z.literal('prepare'), analysis: usageAnalysisSchema, coverage: usageCoverageSchema }).strict(),
  z.object({ ...agentUpdateBase, action: z.literal('complete'), report: z.unknown() }).strict(),
  z.object({ ...agentUpdateBase, action: z.literal('fail'), reason: z.enum(['no_history', 'history_unavailable', 'model_failed']) }).strict(),
]);
export async function updateAgentUsageRun(userId: string, value: unknown) {
  const input = agentUsageUpdateSchema.parse(value);
  const run = await getUsageRun(userId, input.id);
  if (run.executor !== 'agent' || run.status !== 'running' || run.revision !== input.expectedRevision) throw new LocalAgentError('분석 상태가 변경됐거나 종료됐습니다. 최신 상태를 확인해 주세요.', 409);
  const change: Partial<typeof runs.$inferInsert> = {};
  if (input.action === 'prepare') {
    if (run.analysis) throw new LocalAgentError('이미 분석 근거를 제출했습니다.', 409);
    if (input.analysis.rubricVersion !== 'workflow-evidence-v1') throw new LocalAgentError('현재 RepoFit 분석 스킬의 판단 기준을 사용해 주세요.');
    checkCoverage(input.analysis, input.coverage);
    const candidates = await discoverCandidates(input.analysis, []);
    Object.assign(change, { analysis: input.analysis, coverage: { ...input.coverage, verification: 'agent_reported' }, candidates, message: '관찰한 사용 방식에서 필요한 기능을 도출해 스킬 적합성과 활용 방법을 작성하고 있습니다.', leaseExpiresAt: new Date(Date.now() + 30 * 60000).toISOString() });
  } else if (input.action === 'complete') {
    if (!run.analysis || !run.coverage) throw new LocalAgentError('사용 방식 분석과 근거를 먼저 제출해 주세요.', 409);
    Object.assign(change, { report: validateUsageReport(input.report, run.analysis, run.candidates), status: 'completed', activeDeviceKey: null, leaseExpiresAt: null, message: '사용자 에이전트가 RepoFit 스킬 기반 보고서를 작성했습니다.' });
  } else Object.assign(change, { status: 'failed', activeDeviceKey: null, leaseExpiresAt: null, message: input.reason === 'no_history' ? '분석할 수 있는 작업 기록이 없습니다. 기록에 접근할 수 있는 에이전트에서 다시 실행해 주세요.' : '에이전트 분석이 중단됐습니다. 접근 범위와 실행 상태를 확인해 주세요.' });
  const [row] = await getDb().update(runs).set({ ...change, revision: sql`${runs.revision} + 1`, updatedAt: now() }).where(and(eq(runs.id, run.id), eq(runs.userId, userId), eq(runs.executor, 'agent'), eq(runs.status, 'running'), eq(runs.revision, input.expectedRevision), gt(runs.leaseExpiresAt, now()))).returning();
  if (!row) throw new LocalAgentError('분석 상태가 변경됐습니다. 최신 상태를 확인해 주세요.', 409);
  return publicRun(row);
}
function checkCoverage(analysis: UsageAnalysis, coverage: UsageCoverage) {
  if (coverage.threadsRead > coverage.itemsRead) throw new LocalAgentError('사례 수와 항목 수를 확인해 주세요.');
  if (analysis.patterns.some(p => p.sourceIds.some(id => Number(id.split('-')[1]) > coverage.threadsRead))) throw new LocalAgentError('읽지 않은 사례를 참조했습니다.');
}
async function discoverCandidates(analysis: UsageAnalysis, selected: string[]): Promise<UsageCandidate[]> {
  if (selected.length) return (await searchUsageSkills({ ids: selected, limit: 12 })).skills;
  const catalog = await readSkillCatalog();
  const searchable = analysis.patterns.filter(p => !['insufficient_evidence', 'not_applicable'].includes(p.assessment?.status ?? ''));
  const found = await Promise.all(searchable.map(p => searchUsageSkills({ query: p.query, limit: 3 }, catalog)));
  return [...new Map(found.flatMap(r => r.skills).map(s => [s.id, s])).values()].slice(0, 12);
}
export async function getUsageRun(userId: string, id: string) {
  z.string().uuid().parse(id);
  await expireRuns();
  const [row] = await getDb().select().from(runs).where(and(eq(runs.id, id), eq(runs.userId, userId), gt(runs.expiresAt, now())));
  if (!row) throw new LocalAgentError('분석 요청을 찾지 못했습니다.', 404);
  return publicRun(row);
}
export async function createUsageRun(userId: string, value: unknown) {
  const input = usageRequestSchema.parse(value);
  await expireRuns();
  const device = (await listLocalDevices(userId)).find(d => d.id === input.deviceId);
  if (!device?.lastSeenAt || Date.now() - Date.parse(device.lastSeenAt) > 150000) throw new LocalAgentError('연결 프로그램을 켜고 다시 요청해 주세요.', 409);
  if (!device.inventory?.capabilities?.includes('usage-analysis-v1') || !device.inventory.agents.some(a => a.id === 'codex' && a.version && a.status !== 'unavailable')) throw new LocalAgentError('최신 연결 프로그램을 --usage-analysis 옵션으로 실행해 주세요.', 409);
  const catalog = await readSkillCatalog();
  if (input.selectedSkillIds.some(id => !catalog.skills.some(s => s.id === id))) throw new LocalAgentError('선택한 스킬이 현재 카탈로그에 없습니다.', 409);
  const [recent] = await getDb().select({ count: sql<number>`count(*)` }).from(runs).where(and(eq(runs.userId, userId), gt(runs.createdAt, new Date(Date.now() - 60000).toISOString())));
  if (Number(recent.count) >= 3) throw new LocalAgentError('분석 요청은 1분에 3개까지 만들 수 있습니다.', 429);
  try {
    const timestamp = now();
    const [row] = await getDb().insert(runs).values({ id: crypto.randomUUID(), userId, deviceId: input.deviceId, goal: input.goal, selectedSkillIds: [...new Set(input.selectedSkillIds)], status: 'queued', revision: 0, createdAt: timestamp, updatedAt: timestamp, expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(), message: '연결된 Mac에서 최근 대화를 읽고 새 Codex 분석을 시작합니다.', candidates: [], activeDeviceKey: device.id }).returning();
    return publicRun(row);
  } catch (error) {
    const [active] = await getDb().select({ id: runs.id }).from(runs).where(eq(runs.activeDeviceKey, device.id));
    if (active) throw new LocalAgentError('이 기기에서 이미 분석을 진행하고 있습니다.', 409);
    throw error;
  }
}
export async function cancelUsageRun(userId: string, id: string) {
  await getUsageRun(userId, id);
  await getDb().update(runs).set({ status: 'canceled', leaseHash: null, leaseExpiresAt: null, activeDeviceKey: null, updatedAt: now(), revision: sql`${runs.revision} + 1`, message: '분석을 취소했습니다.' }).where(and(eq(runs.id, id), eq(runs.userId, userId), inArray(runs.status, ['queued', 'running'])));
  return getUsageRun(userId, id);
}
export async function deleteUsageRun(userId: string, id: string) {
  await getUsageRun(userId, id);
  await getDb().delete(runs).where(and(eq(runs.id, id), eq(runs.userId, userId)));
  return { deleted: true };
}
export const usageSearchSchema = z.object({ query: z.string().trim().max(100).default(''), ids: z.array(z.string().max(600)).max(5).default([]), limit: z.number().int().min(1).max(12).default(6) }).strict();
export async function searchUsageSkills(value: unknown, snapshot?: CatalogSnapshot) {
  const input = usageSearchSchema.parse(value);
  const catalog = snapshot ?? await readSkillCatalog();
  const terms = input.query.toLowerCase().split(/\s+/).filter(Boolean);
  const skills = catalog.skills.map(skill => {
    const e = skill.explanation;
    const text = [skill.name, skill.source, e.summary, ...e.capabilities, ...e.problems, ...e.workKinds].join(' ').toLowerCase();
    return { skill, score: terms.filter(t => text.includes(t)).length };
  }).filter(({ skill, score }) => input.ids.length ? input.ids.includes(skill.id) : terms.length ? score > 0 && skill.availability !== 'deprecated' : false)
    .sort((a, b) => b.score - a.score || a.skill.id.localeCompare(b.skill.id)).slice(0, input.limit)
    .map(({ skill: { id, name, slug, source, url, availability, explanation, checkedAt, contentHash } }) => ({ id, name, slug, source, url, ...(availability ? { availability } : {}), explanation, checkedAt, contentHash }));
  return { version: catalog.version, skills, missingIds: input.ids.filter(id => !skills.some(s => s.id === id)) };
}
export async function claimUsageRun(token: string) {
  const device = await authenticateLocalDevice(token);
  if (!device.inventory?.capabilities?.includes('usage-analysis-v1')) throw new LocalAgentError('활용 분석 연결 옵션이 필요합니다.', 409);
  await expireRuns();
  const [candidate] = await getDb().select().from(runs).where(and(eq(runs.deviceId, device.id), eq(runs.userId, device.userId), eq(runs.status, 'queued'), gt(runs.expiresAt, now()))).orderBy(runs.createdAt).limit(1);
  if (!candidate) return { job: null };
  const lease = secret();
  const [row] = await getDb().update(runs).set({ status: 'running', leaseHash: await hash(lease), leaseExpiresAt: new Date(Date.now() + 45000).toISOString(), updatedAt: now(), revision: sql`${runs.revision} + 1`, message: '최근 최대 10개 대화에서 사용 방식을 분석하고 있습니다.' }).where(and(eq(runs.id, candidate.id), eq(runs.status, 'queued'))).returning();
  return { job: row ? { id: row.id, lease, goal: row.goal, selectedSkillIds: row.selectedSkillIds } : null };
}
const leased = { id: z.string().uuid(), lease: z.string().regex(/^[a-f0-9]{48}$/) };
export const usageJobSchema = z.discriminatedUnion('action', [
  z.object({ ...leased, action: z.literal('heartbeat') }).strict(),
  z.object({ ...leased, action: z.literal('prepare'), analysis: usageAnalysisSchema, coverage: usageCoverageSchema }).strict(),
  z.object({ ...leased, action: z.literal('complete'), report: z.unknown() }).strict(),
  z.object({ ...leased, action: z.literal('fail'), reason: z.enum(['no_history', 'history_unavailable', 'model_failed']) }).strict(),
]);
export async function updateUsageRun(token: string, value: unknown) {
  const device = await authenticateLocalDevice(token);
  const input = usageJobSchema.parse(value);
  const condition = and(eq(runs.id, input.id), eq(runs.deviceId, device.id), eq(runs.userId, device.userId), eq(runs.status, 'running'), eq(runs.leaseHash, await hash(input.lease)), gt(runs.leaseExpiresAt, now()), gt(runs.expiresAt, now()));
  const [row] = await getDb().select().from(runs).where(condition);
  if (!row) return { active: false };
  let candidates: UsageCandidate[] = row.candidates;
  const change: Partial<typeof runs.$inferInsert> = {};
  if (input.action === 'prepare') {
    if (row.analysis) throw new LocalAgentError('이미 분석 근거를 제출했습니다.', 409);
    checkCoverage(input.analysis, input.coverage);
    candidates = await discoverCandidates(input.analysis, row.selectedSkillIds);
    Object.assign(change, { analysis: input.analysis, coverage: { ...input.coverage, verification: 'local_checked' }, candidates, message: '분석한 사용 방식과 스킬 원문을 비교해 보고서를 작성하고 있습니다.' });
  } else if (input.action === 'complete') {
    if (!row.analysis || !row.coverage) throw new LocalAgentError('사용 방식 분석과 근거를 먼저 제출해 주세요.', 409);
    Object.assign(change, { report: validateUsageReport(input.report, row.analysis, candidates), status: 'completed', activeDeviceKey: null, leaseHash: null, leaseExpiresAt: null, message: 'Codex가 활용 분석과 스킬 추천을 작성했습니다.' });
  } else if (input.action === 'fail') {
    const messages = { no_history: '이 Codex 환경에서 분석할 대화 항목을 찾지 못했습니다.', history_unavailable: '최근 대화를 읽지 못했습니다. Codex 로그인과 App Server 기록 조회 지원을 확인해 주세요.', model_failed: 'Codex 보고서 작성에 실패했습니다. 로그인, 이용 한도와 CLI 버전을 확인해 주세요.' };
    Object.assign(change, { status: 'failed', activeDeviceKey: null, leaseHash: null, leaseExpiresAt: null, message: messages[input.reason] });
  }
  if (input.action === 'heartbeat' || input.action === 'prepare') change.leaseExpiresAt = new Date(Date.now() + 45000).toISOString();
  const [changed] = await getDb().update(runs).set({ ...change, updatedAt: now(), revision: sql`${runs.revision} + 1` }).where(and(condition, input.action === 'prepare' ? isNull(runs.analysis) : undefined)).returning({ id: runs.id });
  if (!changed) throw new LocalAgentError('분석 상태가 변경됐습니다. 작업 상태를 다시 확인해 주세요.', 409);
  await getDb().update(devices).set({ lastSeenAt: now() }).where(eq(devices.id, device.id));
  return { active: true, ...(input.action === 'prepare' ? { candidates } : {}) };
}
