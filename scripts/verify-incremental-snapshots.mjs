import assert from 'node:assert/strict';
import { snapshotFixture, mockSnapshotGitHub, completeSnapshotEditorial } from './test-support/snapshot-fixture.mjs';

const originalFetch = globalThis.fetch, originalNow = Date.now;
const f = snapshotFixture();
let clock = originalNow();
Date.now = () => clock;
const upstream = mockSnapshotGitHub();
globalThis.fetch = upstream.fetch;
try {
  const store = f.load('features/repositories/snapshot-store.js');
  const { SNAPSHOT_INTERVAL_MS } = f.load('features/repositories/snapshot-types.js');
  async function collect() {
    for (let i = 0; i < 10; i++) {
      const result = await store.refreshRepositorySnapshot();
      if (result.phase === 'editorial') {
        await completeSnapshotEditorial(f);
        return store.refreshRepositorySnapshot();
      }
      if (result.published) return result;
    }
    assert.fail('Collection did not complete');
  }
  const first = await collect();
  const before = await store.readRepositorySnapshot('owner/first');
  const article = await f.load('features/editorial/brief-store.js').readBrief('owner/first');
  assert.equal(upstream.requests.filter(r => r.url.includes('/readme')).length, 3, 'README is read only once per new repository');
  let start = upstream.requests.length;
  f.sqlite.prepare("UPDATE repository_snapshot_state SET data = json_set(data, '$.publishedAt', null) WHERE id = 'working'").run();
  clock += SNAPSHOT_INTERVAL_MS;
  upstream.setStars(999); upstream.setCommit('c'.repeat(40)); upstream.setRelease('v2');
  assert.notEqual((await collect()).version, first.version, 'An older deployment left working.publishedAt null; its already-active version must not be resumed as a new slot');
  assert.equal(upstream.requests.slice(start).length, 3, 'Existing repositories require only the three Trending list requests, with zero repository API calls');
  assert.deepEqual((await store.readRepositorySnapshot('owner/first')).overview, before.overview);
  assert.equal((await store.readTrendingSnapshot()).repositories[0].stars, 999, 'Rankings come from the new list while stored repository sources remain unchanged');
  assert.equal((await f.load('features/editorial/brief-store.js').readBrief('owner/first')).article.generatedAt, article.article.generatedAt);

  // Remove a repository from all current lists, then bring it back after old generations expire.
  upstream.lists.daily.splice(0, 1); upstream.lists.weekly.splice(0, 1);
  clock += SNAPSHOT_INTERVAL_MS; await collect();
  clock += 3 * 86400000; await collect();
  upstream.lists.daily.push('owner/first');
  start = upstream.requests.length;
  clock += SNAPSHOT_INTERVAL_MS; await collect();
  assert.equal(upstream.requests.slice(start).length, 3, 'Returning repositories reuse permanent materials after snapshot cleanup');
  assert.deepEqual((await store.readRepositorySnapshot('owner/first')).overview, before.overview);

  start = upstream.requests.length;
  upstream.lists.daily.push('owner/new');
  clock += SNAPSHOT_INTERVAL_MS;
  let collected = await store.refreshRepositorySnapshot();
  if (collected.phase === 'collecting') collected = await store.refreshRepositorySnapshot();
  assert.equal(collected.phase, 'editorial');
  assert.equal(collected.dueRepositories, 1);
  const newCalls = upstream.requests.slice(start).filter(r => !r.url.includes('github.com/trending'));
  assert.ok(newCalls.length > 0);
  assert.ok(newCalls.every(r => r.url.includes('/repos/owner/new')), 'Only the newly discovered repository is fetched');
  const active = await store.readSnapshotManifest();
  assert.notEqual(active.version, collected.version, 'The new list stays unpublished while its introduction is missing');
  const queue = await f.load('features/editorial/brief-store.js').collectEditorialQueue();
  assert.equal(queue.queue.length, 1); assert.equal(queue.queue[0].repository, 'owner/new');
  await completeSnapshotEditorial(f);
  assert.equal((await store.refreshRepositorySnapshot()).version, collected.version);
  assert.equal((await store.readRepositorySnapshot('owner/first', { version: first.version })), null); // old generations have expired
  console.log('통과: 기존 레포 API 호출 0회·새 목록 순위 갱신·기존 해설 시각 보존·오래된 스냅샷 정리 후에도 자료 재사용·신규 레포만 수집·신규 해설 완료 전 공개 차단');
} finally { f.close(); globalThis.fetch = originalFetch; Date.now = originalNow; }
