import { and, desc, eq, gt, inArray, lt, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../db';
import { agentCoachReports as reports, localAgentDevices as devices, agentActivitySummaries as activities } from '../db/schema';
import { LocalAgentError, listLocalDevices } from './local-agent-store';
import { activitySummarySchema, coachInputSchema, validateNarrative, type CoachReport } from './coach-types';
import { prepareCoachReport } from './coach-server';

const secret = () => Array.from(crypto.getRandomValues(new Uint8Array(24)), b => b.toString(16).padStart(2, '0')).join('');
const hash = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2, '0')).join('');
const now = () => new Date().toISOString();
function publicReport(row: typeof reports.$inferSelect): CoachReport {
  return { id: row.id, deviceId: row.deviceId, createdAt: row.createdAt, updatedAt: row.updatedAt, expiresAt: row.expiresAt, status: row.status, author: row.author, message: row.message, bundle: row.bundle, narrative: row.narrative, feedback: row.feedback };
}
async function expireJobs() {
  await getDb().update(reports).set({ status: 'failed', leaseHash: null, leaseExpiresAt: null, message: '로컬 실행 연결이 끊겼습니다. 초기 보고서는 보존했습니다. 다시 요청해 주세요.', updatedAt: now() }).where(and(eq(reports.status, 'running'), lt(reports.leaseExpiresAt, now())));
  await getDb().delete(reports).where(lt(reports.expiresAt, now()));
}
export async function listCoachReports(userId: string) {
  await expireJobs();
  return (await getDb().select().from(reports).where(and(eq(reports.userId, userId), gt(reports.expiresAt, now()))).orderBy(desc(reports.createdAt)).limit(30)).map(publicReport);
}
async function ownedReport(userId: string, id: string) {
  const [row] = await getDb().select().from(reports).where(and(eq(reports.id, id), eq(reports.userId, userId), gt(reports.expiresAt, now())));
  if (!row) throw new LocalAgentError('보고서를 찾지 못했습니다.', 404);
  return row;
}
export async function createCoachReport(userId: string, value: unknown) {
  const input = coachInputSchema.parse(value);
  const [recent] = await getDb().select({ count: sql<number>`count(*)` }).from(reports).where(and(eq(reports.userId, userId), gt(reports.createdAt, new Date(Date.now() - 60000).toISOString())));
  if (Number(recent.count) >= 3) throw new LocalAgentError('보고서는 1분에 3개까지 생성할 수 있습니다.', 429);
  const device = input.deviceId ? (await listLocalDevices(userId)).find(d => d.id === input.deviceId) : null;
  if (input.deviceId && !device?.inventory?.agents.some(agent => agent.id === input.agent)) throw new LocalAgentError('선택한 에이전트의 목록을 먼저 연결해 주세요.', 409);
  const selectedActivities = input.activityIds.length ? await getDb().select().from(activities).where(and(eq(activities.userId, userId), eq(activities.deviceId, input.deviceId ?? ''), gt(activities.expiresAt, now()), inArray(activities.id, input.activityIds))) : [];
  if (selectedActivities.length !== input.activityIds.length) throw new LocalAgentError('선택한 사례의 소유자 및 연결 환경 및 만료 상태를 확인해 주세요.', 409);
  const content = await prepareCoachReport(input, device?.inventory ?? null, selectedActivities);
  const timestamp = now();
  const [row] = await getDb().insert(reports).values({ id: crypto.randomUUID(), userId, deviceId: input.deviceId, createdAt: timestamp, updatedAt: timestamp, expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(), status: 'ready', author: 'rules', message: '자기 응답과 스킬 원본에 따른 초기 보고서입니다.', ...content, feedback: {} }).returning();
  return publicReport(row);
}
export const reportActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('queue'), id: z.string().uuid(), consent: z.literal(true) }).strict(),
  z.object({ action: z.literal('cancel'), id: z.string().uuid() }).strict(),
  z.object({ action: z.literal('feedback'), id: z.string().uuid(), skillId: z.string().max(600), outcome: z.enum(['helpful', 'not_helpful', 'not_tried']), note: z.string().trim().max(1000) }).strict(),
]);
export async function updateCoachReport(userId: string, value: unknown) {
  const input = reportActionSchema.parse(value);
  const row = await ownedReport(userId, input.id);
  if (input.action === 'queue') {
    if (row.bundle.input.agent !== 'codex' || !row.deviceId) throw new LocalAgentError('로컬 Codex 연결을 선택해 새 보고서를 만들어 주세요.', 409);
    const device = (await listLocalDevices(userId)).find(d => d.id === row.deviceId);
    if (!device?.lastSeenAt || Date.now() - Date.parse(device.lastSeenAt) > 150000) throw new LocalAgentError('연결 프로그램을 실행한 후 다시 요청해 주세요.', 409);
    const runtime = device.inventory?.agents.find(a => a.id === 'codex');
    if (!runtime?.version || runtime.status === 'unavailable') throw new LocalAgentError('Codex CLI 실행 상태를 확인해 주세요.', 409);
    const changed = await getDb().update(reports).set({ status: 'queued', message: '로컬 Codex 분석 대기 중입니다.', updatedAt: now(), leaseHash: null, leaseExpiresAt: null }).where(and(eq(reports.id, row.id), eq(reports.userId, userId), inArray(reports.status, ['ready', 'completed', 'failed', 'canceled']))).returning();
    if (!changed.length) throw new LocalAgentError('이미 분석을 요청했습니다.', 409);
  } else if (input.action === 'cancel') {
    await getDb().update(reports).set({ status: 'canceled', leaseHash: null, leaseExpiresAt: null, updatedAt: now(), message: '분석을 취소했습니다. 기존 보고서는 보존했습니다.' }).where(and(eq(reports.id, row.id), eq(reports.userId, userId), inArray(reports.status, ['queued', 'running'])));
  } else {
    if (!row.narrative.recommendations.some(r => r.catalogSkillId === input.skillId)) throw new LocalAgentError('이 보고서의 추천만 평가할 수 있습니다.');
    const changed = await getDb().update(reports).set({ feedback: { ...row.feedback, [input.skillId]: { outcome: input.outcome, note: input.note } }, updatedAt: now() }).where(and(eq(reports.id, row.id), eq(reports.userId, userId), eq(reports.feedback, row.feedback))).returning();
    if (!changed.length) throw new LocalAgentError('평가가 변경됐습니다. 새로 확인한 뒤 저장해 주세요.', 409);
  }
  return publicReport(await ownedReport(userId, row.id));
}
export async function deleteCoachReport(userId: string, id: string) {
  await ownedReport(userId, id);
  await getDb().delete(reports).where(and(eq(reports.id, id), eq(reports.userId, userId)));
}
async function authenticatedDevice(token: string) {
  if (!/^[a-f0-9]{48}$/.test(token)) throw new LocalAgentError('기기 인증이 필요합니다.', 401);
  const [device] = await getDb().select().from(devices).where(and(eq(devices.tokenHash, await hash(token)), gt(devices.expiresAt, now())));
  if (!device) throw new LocalAgentError('기기 연결이 해제됐거나 만료됐습니다.', 401);
  return device;
}
export async function claimCoachJob(token: string) {
  const device = await authenticatedDevice(token);
  await expireJobs();
  const [candidate] = await getDb().select().from(reports).where(and(eq(reports.deviceId, device.id), eq(reports.userId, device.userId), eq(reports.status, 'queued'), gt(reports.expiresAt, now()))).orderBy(reports.createdAt).limit(1);
  if (!candidate) return { job: null };
  const lease = secret();
  const changed = await getDb().update(reports).set({ status: 'running', leaseHash: await hash(lease), leaseExpiresAt: new Date(Date.now() + 45000).toISOString(), updatedAt: now(), message: '로컬 Codex가 활용 보고서를 작성하고 있습니다.' }).where(and(eq(reports.id, candidate.id), eq(reports.status, 'queued'))).returning();
  return { job: changed.length ? { id: candidate.id, lease, bundle: candidate.bundle } : null };
}
const jobUpdateSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('heartbeat'), id: z.string().uuid(), lease: z.string().regex(/^[a-f0-9]{48}$/) }).strict(),
  z.object({ action: z.literal('complete'), id: z.string().uuid(), lease: z.string().regex(/^[a-f0-9]{48}$/), narrative: z.unknown() }).strict(),
  z.object({ action: z.literal('fail'), id: z.string().uuid(), lease: z.string().regex(/^[a-f0-9]{48}$/) }).strict(),
]);
export async function updateCoachJob(token: string, value: unknown) {
  const device = await authenticatedDevice(token);
  const input = jobUpdateSchema.parse(value);
  const leaseHash = await hash(input.lease);
  const condition = and(eq(reports.id, input.id), eq(reports.deviceId, device.id), eq(reports.userId, device.userId), eq(reports.status, 'running'), eq(reports.leaseHash, leaseHash), gt(reports.leaseExpiresAt, now()), gt(reports.expiresAt, now()));
  const [row] = await getDb().select().from(reports).where(condition);
  if (!row) return { active: false };
  await getDb().update(devices).set({ lastSeenAt: now() }).where(eq(devices.id, device.id));
  const change = input.action === 'heartbeat' ? { leaseExpiresAt: new Date(Date.now() + 45000).toISOString() } : input.action === 'fail' ? { status: 'failed' as const, leaseHash: null, leaseExpiresAt: null, message: '로컬 분석이 실패했습니다. CLI 로그인 및 이용 한도 및 지원 버전을 확인해 주세요. 초기 보고서는 보존했습니다.' } : { status: 'completed' as const, author: 'codex' as const, narrative: validateNarrative(input.narrative, row.bundle), leaseHash: null, leaseExpiresAt: null, message: '로컬 Codex가 근거를 참조한 보고서를 작성했습니다.' };
  const changed = await getDb().update(reports).set({ ...change, updatedAt: now() }).where(condition).returning({ id: reports.id });
  return { active: changed.length > 0 };
}

export async function listAgentActivities(userId: string) {
  await getDb().delete(activities).where(lt(activities.expiresAt, now()));
  return getDb().select({ id: activities.id, deviceId: activities.deviceId, createdAt: activities.createdAt, expiresAt: activities.expiresAt, summary: activities.summary }).from(activities).where(and(eq(activities.userId, userId), gt(activities.expiresAt, now()))).orderBy(desc(activities.createdAt)).limit(20);
}
export async function receiveAgentActivity(token: string, value: unknown) {
  const device = await authenticatedDevice(token);
  const { consent, summary } = z.object({ consent: z.literal(true), summary: activitySummarySchema }).strict().parse(value);
  if (!consent) throw new LocalAgentError('선택한 요약의 전송 동의가 필요합니다.');
  const [count] = await getDb().select({ count: sql<number>`count(*)` }).from(activities).where(and(eq(activities.userId, device.userId), gt(activities.expiresAt, now())));
  if (Number(count.count) >= 20) throw new LocalAgentError('사용 사례는 최대 20개까지 보관합니다. 이전 사례를 삭제해 주세요.', 409);
  const id = crypto.randomUUID();
  await getDb().insert(activities).values({ id, userId: device.userId, deviceId: device.id, summary, createdAt: now(), expiresAt: new Date(Date.now() + 30 * 86400000).toISOString() });
  return { id };
}
export async function deleteAgentActivity(userId: string, id: string) {
  const changed = await getDb().delete(activities).where(and(eq(activities.id, id), eq(activities.userId, userId))).returning({ id: activities.id });
  if (!changed.length) throw new LocalAgentError('사용 사례를 찾지 못했습니다.', 404);
  // SQLite trigger removes derived reports atomically, including competing writers.
}
