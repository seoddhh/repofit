import { and, eq, lt, lte, ne, sql } from 'drizzle-orm';
import { getDb } from '../../db';
import { repositorySnapshotState as state, repositorySnapshotItems as items } from '../../db/schema';
import { ServiceError } from '@/lib/service-error';
import { collectBriefEvidence } from '../editorial/brief-evidence';
import { getTrending, inspectRepository } from './github-server';
import type { TrendingPeriod, TrendingSnapshot } from './repository-types';
import { SNAPSHOT_INTERVAL_MS, snapshotPeriods, snapshotSlot, type RepositorySnapshotManifest } from './snapshot-types';
import initialBaseline from '../../content/repository-snapshot-baseline.json';

const now = () => new Date().toISOString();
const itemId = (version: string, repository: string) => `${version}:${repository.toLowerCase()}`;
const delayed = (manifest: RepositorySnapshotManifest) => Date.now() > Date.parse(manifest.nextRefreshAt) + 30 * 60_000;

export async function readSnapshotManifest(version?: string) {
  if (version && !/^[a-f0-9-]{36}$/.test(version)) throw new ServiceError('스냅샷 주소를 확인해 주세요.', 400);
  const row = await getDb().select({ data: state.data }).from(state).where(eq(state.id, version ?? 'active')).get();
  return row?.data ?? null;
}

export async function readTrendingSnapshot(period: TrendingPeriod = 'daily', version?: string): Promise<TrendingSnapshot> {
  const manifest = await readSnapshotManifest(version);
  if (!manifest) {
    if (version) throw new ServiceError('이전 스냅샷이 만료됐습니다. 목록을 새로고침해 주세요.', 404);
    // Preserve the existing public lists until the first scheduled generation is complete.
    // This checked-in baseline is captured from the previous production API, never fetched by visitors.
    return { ...initialBaseline.periods[period], nextRefreshAt: initialBaseline.nextRefreshAt, stale: Date.now() > Date.parse(initialBaseline.nextRefreshAt) + 30 * 60_000 };
  }
  return { ...manifest.periods[period], snapshotId: manifest.version, nextRefreshAt: manifest.nextRefreshAt, stale: delayed(manifest) };
}

export async function readRepositorySnapshot(repository: string, options: { version?: string; period?: TrendingPeriod } = {}) {
  const manifest = await readSnapshotManifest(options.version);
  if (!manifest) return null;
  const row = await getDb().select().from(items).where(eq(items.id, itemId(manifest.version, repository))).get();
  if (!row) return null;
  const period = options.period ?? row.evidence.trendingPeriod ?? 'daily';
  const snapshot = manifest.periods[period];
  const trending = snapshot.repositories.find(repo => repo.id.toLowerCase() === repository.toLowerCase()) ?? null;
  return {
    overview: row.overview,
    evidence: { ...row.evidence, trending, trendingPeriod: period, trendingFetchedAt: snapshot.fetchedAt, trendingStale: delayed(manifest) },
    snapshot: { id: manifest.version, fetchedAt: manifest.fetchedAt, nextRefreshAt: manifest.nextRefreshAt, stale: delayed(manifest) },
  };
}

export async function repositorySnapshotStatus() {
  const [active, working] = await Promise.all([
    readSnapshotManifest(),
    getDb().select({ data: state.data, leaseUntil: state.leaseUntil }).from(state).where(eq(state.id, 'working')).get(),
  ]);
  return {
    ready: true, source: active ? 'scheduled_snapshot' : 'initial_baseline', version: active?.version ?? null, fetchedAt: active?.fetchedAt ?? initialBaseline.recordedAt,
    publishedAt: active?.publishedAt ?? null, nextRefreshAt: active?.nextRefreshAt ?? initialBaseline.nextRefreshAt,
    stale: active ? delayed(active) : Date.now() > Date.parse(initialBaseline.nextRefreshAt) + 30 * 60_000,
    periods: snapshotPeriods.map(period => ({ period, repositories: (active?.periods ?? initialBaseline.periods)[period].repositories.length })),
    totalRepositories: active?.repositories.length ?? new Set(snapshotPeriods.flatMap(period => initialBaseline.periods[period].repositories.map(repo => repo.id.toLowerCase()))).size,
    refresh: working ? { completed: working.data.completed, total: working.data.repositories.length, error: working.data.error ?? null, busy: working.leaseUntil > Date.now() } : null,
  };
}

function progress(manifest: RepositorySnapshotManifest, published: boolean) {
  return { version: manifest.version, fetchedAt: manifest.fetchedAt, completed: manifest.completed, total: manifest.repositories.length, remaining: manifest.repositories.length - manifest.completed, published,
    instructions: published ? '스냅샷을 공개했습니다. get_repository_snapshot_status로 저장 결과를 확인하고 종료하세요.' : '같은 refresh_repository_snapshot 도구를 빈 객체로 다시 호출하세요. published가 true일 때만 완료입니다. 오류나 busy 응답이면 이번 실행을 중단하고 보고하세요.' };
}

/** Owner-only writer: one repository per call keeps HTTP execution bounded. */
export async function refreshRepositorySnapshot() {
  const db = getDb();
  const slot = snapshotSlot();
  const active = await readSnapshotManifest();
  if (active && active.slot >= slot) return progress(active, true);

  // Acquire before any upstream fetch. The row is a persistent cross-isolate lock.
  const placeholder: RepositorySnapshotManifest = { version: crypto.randomUUID(), slot, fetchedAt: now(), publishedAt: null, nextRefreshAt: new Date(slot + SNAPSHOT_INTERVAL_MS).toISOString(), periods: {} as RepositorySnapshotManifest['periods'], repositories: [], completed: 0 };
  await db.insert(state).values({ id: 'working', data: placeholder, updatedAt: now() }).onConflictDoNothing();
  const leaseToken = crypto.randomUUID();
  const [locked] = await db.update(state).set({ leaseToken, leaseUntil: Date.now() + 120_000 }).where(and(eq(state.id, 'working'), lte(state.leaseUntil, Date.now()))).returning();
  if (!locked) return { published: false, busy: true, instructions: '다른 수집이 진행 중입니다. 중복 호출을 멈추고 다음 예약에서 다시 확인하세요.' };
  let manifest = locked.data;
  const owned = and(eq(state.id, 'working'), eq(state.leaseToken, leaseToken));
  try {
    if (manifest.slot !== slot || !manifest.periods.daily) {
      const snapshots = await Promise.all(snapshotPeriods.map(period => getTrending(period, true)));
      if (snapshots.some(snapshot => snapshot.stale || !snapshot.repositories.length)) throw new Error('최신 트렌딩 목록을 수집하지 못했습니다.');
      const repositories = [...new Set(snapshots.flatMap(snapshot => snapshot.repositories.map(repo => repo.id.toLowerCase())))];
      manifest = { ...placeholder, periods: Object.fromEntries(snapshotPeriods.map((period, i) => [period, snapshots[i]])) as RepositorySnapshotManifest['periods'], repositories };
      await db.update(state).set({ data: manifest, updatedAt: now() }).where(owned);
    }
    const repository = manifest.repositories[manifest.completed];
    if (repository) {
      const snapshot = snapshotPeriods.map(period => manifest.periods[period]).find(period => period.repositories.some(repo => repo.id.toLowerCase() === repository))!;
      // Both collectors reject private repositories. Transient failures never publish partial data.
      const overview = await inspectRepository(repository, true);
      const evidence = await collectBriefEvidence(repository, snapshot, true);
      const createdAt = now();
      // Save first: a crash before cursor advancement safely retries the same item.
      const [entry] = await db.insert(items).select(db.select({
        id: sql`${itemId(manifest.version, repository)}`.as('id'), version: sql`${manifest.version}`.as('version'),
        repository: sql`${repository}`.as('repository'), evidence: sql`${JSON.stringify(evidence)}`.as('evidence'),
        overview: sql`${JSON.stringify(overview)}`.as('overview'), createdAt: sql`${createdAt}`.as('created_at'),
      }).from(state).where(and(owned, sql`${state.leaseUntil} > ${Date.now()}`)))
        .onConflictDoUpdate({ target: items.id, set: { overview, evidence, createdAt } }).returning({ id: items.id });
      if (!entry) throw new Error('수집 권한이 만료됐습니다. 이전 스냅샷을 유지합니다.');
      const [saved] = await db.update(state).set({ data: { ...manifest, completed: manifest.completed + 1, error: undefined }, updatedAt: createdAt }).where(and(owned, sql`${state.leaseUntil} > ${Date.now()}`)).returning({ id: state.id });
      if (!saved) throw new Error('수집 권한이 만료됐습니다. 이전 스냅샷을 유지합니다.');
      manifest = { ...manifest, completed: manifest.completed + 1, error: undefined };
    }
    if (manifest.completed < manifest.repositories.length) return progress(manifest, false);
    const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(items).where(eq(items.version, manifest.version));
    if (Number(count) !== manifest.repositories.length) throw new Error('스냅샷 자료가 불완전합니다. 이전 공개 버전을 유지합니다.');
    const completed = { ...manifest, publishedAt: now() };
    // Readers only follow active. All entries and the immutable manifest exist before it moves.
    const [, published] = await db.batch([
      db.insert(state).values({ id: completed.version, data: completed, updatedAt: now() }).onConflictDoNothing(),
      db.insert(state).select(db.select({ id: sql`'active'`.as('id'), data: sql`${JSON.stringify(completed)}`.as('data'), updatedAt: sql`${now()}`.as('updated_at'), leaseToken: sql`null`.as('lease_token'), leaseUntil: sql`0`.as('lease_until') }).from(state).where(and(owned, sql`${state.leaseUntil} > ${Date.now()}`)))
        .onConflictDoUpdate({ target: state.id, set: { data: completed, updatedAt: now() } }).returning({ id: state.id }),
    ]);
    if (!published.length) throw new Error('수집 권한이 만료돼 공개 버전을 교체하지 않았습니다.');
    const cutoff = new Date(Date.now() - 2 * 86400000).toISOString();
    // Keep older generations briefly for browsers already displaying those lists.
    await db.delete(items).where(and(lt(items.createdAt, cutoff), ne(items.version, completed.version), active ? ne(items.version, active.version) : undefined));
    await db.delete(state).where(and(lt(state.updatedAt, cutoff), ne(state.id, 'active'), ne(state.id, 'working'), ne(state.id, completed.version), active ? ne(state.id, active.version) : undefined));
    return progress(completed, true);
  } catch (error) {
    await db.update(state).set({ data: { ...manifest, error: error instanceof Error ? error.message : '수집 실패' }, updatedAt: now() }).where(owned);
    throw error;
  } finally {
    await db.update(state).set({ leaseToken: null, leaseUntil: 0 }).where(owned);
  }
}
