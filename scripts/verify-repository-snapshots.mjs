import assert from 'node:assert/strict';
import { snapshotFixture, mockSnapshotGitHub } from './test-support/snapshot-fixture.mjs';

const originalFetch = globalThis.fetch, originalNow = Date.now;
const f = snapshotFixture();
let clock = originalNow();
Date.now = () => clock;
const upstream = mockSnapshotGitHub();
globalThis.fetch = upstream.fetch;
try {
  const store = f.load('features/repositories/snapshot-store.js');
  const { snapshotSlot, SNAPSHOT_INTERVAL_MS } = f.load('features/repositories/snapshot-types.js');
  for (const hour of [0, 8, 16]) {
    const boundary = Date.parse(`2026-11-08T${String(hour).padStart(2, '0')}:00:00+09:00`);
    assert.equal(snapshotSlot(boundary), boundary);
    assert.equal(snapshotSlot(boundary - 1), boundary - SNAPSHOT_INTERVAL_MS);
  }
  const trending = f.load('app/api/trending/route.js');
  const baselineLists = {};
  for (const period of ['daily', 'weekly', 'monthly']) {
    const response = await trending.GET(new Request(`https://fixture.test/api/trending?since=${period}`));
    assert.equal(response.status, 200);
    baselineLists[period] = await response.json();
    assert.ok(baselineLists[period].repositories.length > 0, 'Existing lists remain visible before the first scheduled collection');
  }
  assert.equal((await store.repositorySnapshotStatus()).source, 'initial_baseline');
  assert.equal(upstream.calls, 0, 'Initial public lists are saved data, never an on-demand GitHub collection');
  upstream.fail('offline');
  await assert.rejects(() => store.refreshRepositorySnapshot(), /offline/);
  assert.deepEqual((await store.readTrendingSnapshot()).repositories, baselineLists.daily.repositories, 'A failed first collection must not clear the existing list');
  upstream.fail(null);
  let step = await store.refreshRepositorySnapshot();
  assert.equal(step.completed, 1); assert.equal(step.total, 3); assert.equal(step.published, false);
  assert.equal(await store.readSnapshotManifest(), null, 'Incomplete generations stay private');
  assert.deepEqual((await store.readTrendingSnapshot()).repositories, baselineLists.daily.repositories, 'An incomplete first collection keeps the existing list');
  await store.refreshRepositorySnapshot();
  step = await store.refreshRepositorySnapshot();
  assert.equal(step.published, true); assert.equal(step.remaining, 0);
  const first = await store.readSnapshotManifest();
  assert.equal((await store.repositorySnapshotStatus()).source, 'scheduled_snapshot');
  const before = upstream.calls;
  assert.equal((await store.refreshRepositorySnapshot()).version, first.version);
  assert.equal(upstream.calls, before, 'A completed time slot is idempotent');
  const saved = await store.readRepositorySnapshot('OWNER/FIRST', { period: 'weekly' });
  assert.equal(saved.evidence.trendingPeriod, 'weekly'); assert.equal(saved.overview.sha, 'a'.repeat(40));
  assert.equal((await store.readRepositorySnapshot('owner/unknown')), null);
  const overviewApi = f.load('app/api/repository/route.js');
  const briefApi = f.load('app/api/brief/route.js');
  const requests = Array.from({ length: 100 }, async () => {
    const r = await trending.GET(new Request('https://fixture.test/api/trending?since=weekly'));
    assert.equal(r.status, 200); assert.match(r.headers.get('cache-control'), /public/);
    assert.equal((await r.json()).snapshotId, first.version);
  });
  await Promise.all(requests);
  await briefApi.GET(new Request(`https://fixture.test/api/brief?repository=owner%2Ffirst&snapshot=${first.version}&since=weekly`));
  const post = repository => overviewApi.POST(new Request('https://fixture.test/api/repository', { method: 'POST', headers: { origin: 'https://fixture.test' }, body: JSON.stringify({ repository }) }));
  assert.equal((await post('owner/first')).status, 200);
  assert.equal((await post('owner/unknown')).status, 404);
  assert.equal(upstream.calls, before, 'List, detail, unknown repository and repeated public reads use zero upstream requests');
  clock = first.slot + SNAPSHOT_INTERVAL_MS + 31 * 60_000;
  assert.equal((await store.readTrendingSnapshot()).stale, true);
  upstream.fail('offline');
  await assert.rejects(() => store.refreshRepositorySnapshot(), /offline/);
  assert.equal((await store.readSnapshotManifest()).version, first.version);
  upstream.fail('private');
  await assert.rejects(() => store.refreshRepositorySnapshot(), /공개 저장소/);
  assert.equal((await store.readSnapshotManifest()).version, first.version);
  upstream.fail('quota');
  await assert.rejects(() => store.refreshRepositorySnapshot(), e => e.status === 429);
  assert.equal((await store.readSnapshotManifest()).version, first.version);
  upstream.fail(null); upstream.setStars(999);
  let release, entered;
  const gate = new Promise(resolve => { entered = resolve; });
  globalThis.fetch = async url => { if (url.endsWith('/repos/owner/first')) { entered(); await new Promise(resolve => { release = resolve; }); } return upstream.fetch(url); };
  const running = store.refreshRepositorySnapshot();
  await gate;
  assert.equal((await store.refreshRepositorySnapshot()).busy, true, 'A second collector cannot acquire the persistent lease');
  assert.equal((await store.readSnapshotManifest()).version, first.version);
  release(); globalThis.fetch = upstream.fetch; await running;
  await store.refreshRepositorySnapshot();
  const published = await store.refreshRepositorySnapshot();
  assert.equal(published.published, true);
  assert.notEqual(published.version, first.version);
  assert.equal((await store.readRepositorySnapshot('owner/first')).overview.stars, 999);
  assert.equal((await store.readRepositorySnapshot('owner/first', { version: first.version })).overview.stars, 100, 'An old browser can finish reading its immutable generation');
  console.log('통과: 첫 예약 전 기존 3기간 목록 유지·최초 수집 중 기존 목록 유지·완료 후에만 교체·한국 시간 00/08/16시·영속 스냅샷·동시 수집 잠금·오류 복구·private 차단·방문자 조회 100회 GitHub 호출 0회·이전 버전 상세 일치');
} finally { f.close(); globalThis.fetch = originalFetch; Date.now = originalNow; }
