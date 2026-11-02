import { and, desc, eq, gt, inArray, isNull, lt, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../db';
import { agentUsageRuns as runs, localAgentDevices as devices } from '../db/schema';
import { authenticateLocalDevice, listLocalDevices, LocalAgentError } from './local-agent-store';
import { readSkillCatalog } from './catalog-store';
import type { CatalogSnapshot } from './catalog-types';
import { usageAnalysisSchema, usageCoverageSchema, usageRequestSchema, validateUsageReport, type UsageCandidate, type UsageRun } from './usage-types';

const now = () => new Date().toISOString();
const hash = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2, '0')).join('');
const secret = () => Array.from(crypto.getRandomValues(new Uint8Array(24)), b => b.toString(16).padStart(2, '0')).join('');
function publicRun(row: typeof runs.$inferSelect): UsageRun {
  const { userId: _owner, leaseHash: _hash, leaseExpiresAt: _expiry, activeDeviceKey: _active, ...result } = row;
  return result;
}
async function expireRuns() {
  await getDb().update(runs).set({ status: 'failed', leaseHash: null, leaseExpiresAt: null, activeDeviceKey: null, message: '연결이 끊겨 분석이 중단됐습니다. 연결 상태를 확인하고 새로 요청해 주세요.', updatedAt: now(), revision: sql`${runs.revision} + 1` }).where(and(eq(runs.status, 'running'), lt(runs.leaseExpiresAt, now())));
  await getDb().delete(runs).where(lt(runs.expiresAt, now()));
}
export async function listUsageRuns(userId: string) {
  await expireRuns();
  return getDb().select({ id: runs.id, deviceId: runs.deviceId, goal: runs.goal, selectedSkillIds: runs.selectedSkillIds, status: runs.status, revision: runs.revision, createdAt: runs.createdAt, updatedAt: runs.updatedAt, expiresAt: runs.expiresAt, message: runs.message }).from(runs).where(and(eq(runs.userId, userId), gt(runs.expiresAt, now()))).orderBy(desc(runs.createdAt)).limit(30);
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
    if (input.coverage.threadsRead > input.coverage.itemsRead) throw new LocalAgentError('사례 수와 항목 수를 확인해 주세요.');
    if (input.analysis.patterns.some(p => p.sourceIds.some(id => Number(id.split('-')[1]) > input.coverage.threadsRead))) throw new LocalAgentError('읽지 않은 사례를 참조했습니다.');
    if (row.selectedSkillIds.length) candidates = (await searchUsageSkills({ ids: row.selectedSkillIds, limit: 12 })).skills;
    else {
      const catalog = await readSkillCatalog();
      const searchable = input.analysis.patterns.filter(p => !['insufficient_evidence', 'not_applicable'].includes(p.assessment?.status ?? ''));
      const found = await Promise.all(searchable.map(p => searchUsageSkills({ query: p.query, limit: 3 }, catalog)));
      candidates = [...new Map(found.flatMap(r => r.skills).map(s => [s.id, s])).values()].slice(0, 12);
    }
    Object.assign(change, { analysis: input.analysis, coverage: input.coverage, candidates, message: '분석한 사용 방식과 스킬 원문을 비교해 보고서를 작성하고 있습니다.' });
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
