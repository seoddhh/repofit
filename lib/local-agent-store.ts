import { and, desc, eq, gt, isNull, inArray } from 'drizzle-orm';
import { getDb } from '../db';
import { localAgentDevices as devices, agentCoachReports } from '../db/schema';
import { localInventorySchema, pairingClaimSchema, type LocalDevice } from './local-agent-types';

export class LocalAgentError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
const randomSecret = () => Array.from(crypto.getRandomValues(new Uint8Array(24)), byte => byte.toString(16).padStart(2, '0')).join('');
async function hash(value: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function listLocalDevices(userId: string): Promise<LocalDevice[]> {
  const rows = await getDb().select({ id: devices.id, name: devices.name, createdAt: devices.createdAt, lastSeenAt: devices.lastSeenAt, expiresAt: devices.expiresAt, inventory: devices.inventory })
    .from(devices).where(and(eq(devices.userId, userId), gt(devices.expiresAt, new Date().toISOString()))).orderBy(desc(devices.createdAt)).limit(20);
  return rows;
}
export async function createLocalPairing(userId: string) {
  if ((await listLocalDevices(userId)).length >= 10) throw new LocalAgentError('기기는 최대 10개까지 연결할 수 있습니다. 이전 연결을 해제해 주세요.', 409);
  const code = randomSecret();
  const now = Date.now();
  const pairing = { id: crypto.randomUUID(), code, expiresAt: new Date(now + 10 * 60_000).toISOString() };
  await getDb().insert(devices).values({
    id: pairing.id, userId, name: '연결 대기 중', pairingHash: await hash(code), pairingExpiresAt: pairing.expiresAt,
    expiresAt: pairing.expiresAt, createdAt: new Date(now).toISOString(),
  });
  return pairing;
}
export async function claimLocalPairing(input: unknown) {
  const { code, name } = pairingClaimSchema.parse(input);
  const token = randomSecret();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60_000).toISOString();
  // Conditional UPDATE atomically consumes the code, including concurrent claims.
  const rows = await getDb().update(devices).set({ name, pairingHash: null, tokenHash: await hash(token), expiresAt })
    .where(and(eq(devices.pairingHash, await hash(code)), gt(devices.pairingExpiresAt, new Date().toISOString()), isNull(devices.tokenHash)))
    .returning({ id: devices.id });
  if (!rows[0]) throw new LocalAgentError('연결 코드가 만료됐거나 이미 사용됐습니다.', 401);
  return { deviceId: rows[0].id, token, expiresAt };
}
export async function receiveLocalInventory(token: string, input: unknown) {
  if (!/^[a-f0-9]{48}$/.test(token)) throw new LocalAgentError('기기 인증이 필요합니다.', 401);
  const inventory = localInventorySchema.parse(input);
  const now = new Date().toISOString();
  if (Math.abs(Date.now() - Date.parse(inventory.observedAt)) > 10 * 60_000) throw new LocalAgentError('Mac의 시각과 서버 시각을 확인해 주세요.');
  const rows = await getDb().update(devices).set({ inventory, lastSeenAt: now })
    .where(and(eq(devices.tokenHash, await hash(token)), gt(devices.expiresAt, now)))
    .returning({ id: devices.id });
  if (!rows[0]) throw new LocalAgentError('연결이 해제됐거나 만료됐습니다. 사이트에서 다시 연결해 주세요.', 401);
  return { receivedAt: now };
}
export async function removeLocalDevice(userId: string, id: string) {
  const rows = await getDb().delete(devices).where(and(eq(devices.id, id), eq(devices.userId, userId))).returning({ id: devices.id });
  if (!rows[0]) throw new LocalAgentError('연결된 기기를 찾지 못했습니다.', 404);
  await getDb().update(agentCoachReports).set({ status: 'canceled', leaseHash: null, leaseExpiresAt: null, message: '기기 연결을 해제했습니다.', updatedAt: new Date().toISOString() }).where(and(eq(agentCoachReports.userId, userId), eq(agentCoachReports.deviceId, id), inArray(agentCoachReports.status, ['queued', 'running'])));
}
