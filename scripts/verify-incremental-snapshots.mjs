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
  const { SNAPSHOT_INTERVAL_MS } = f.load('features/repositories/snapshot-types.js');
  const { evidenceContentFingerprint } = f.load('features/editorial/brief-evidence.js');
  async function collect() {
    for (let i = 0; i < 5; i++) {
      const result = await store.refreshRepositorySnapshot();
      if (result.published) return result;
    }
    assert.fail('Collection did not complete');
  }
  const first = await collect();
  const before = await store.readRepositorySnapshot('owner/first');
  assert.equal(upstream.requests.filter(r => r.url.includes('/readme')).length, 3, 'README is read only once per repository, including explanation evidence');
  let start = upstream.requests.length;
  clock += SNAPSHOT_INTERVAL_MS; upstream.setStars(999);
  await collect();
  const unchangedCalls = upstream.requests.slice(start);
  assert.equal(unchangedCalls.filter(r => /\/git\/trees\/|\/readme|\/contents\//.test(r.url)).length, 0, 'An unchanged commit must never download tree, README or package.json');
  assert.equal(unchangedCalls.filter(r => r.url.includes('/releases')).length, 3);
  assert.ok(unchangedCalls.filter(r => r.url.includes('/releases')).every(r => r.etag === '"release-none"'), 'Releases are independently revalidated');
  const unchanged = await store.readRepositorySnapshot('owner/first');
  assert.equal(unchanged.overview.stars, 999);
  assert.equal(unchanged.evidence.readme, before.evidence.readme);
  assert.deepEqual(unchanged.overview.paths, before.overview.paths);
  assert.deepEqual(unchanged.overview.dependencies, before.overview.dependencies);
  assert.equal(await evidenceContentFingerprint(unchanged.evidence), await evidenceContentFingerprint(before.evidence), 'Metadata refreshes must not invalidate an unchanged explanation');
  start = upstream.requests.length;
  clock += SNAPSHOT_INTERVAL_MS; upstream.setCommit('c'.repeat(40));
  await collect();
  const changedCalls = upstream.requests.slice(start);
  assert.equal(changedCalls.filter(r => r.url.includes('/readme')).length, 3);
  assert.ok(changedCalls.filter(r => r.url.includes('/readme')).every(r => r.etag === '"readme-v1"'));
  assert.ok(changedCalls.filter(r => r.url.includes('/contents/package.json')).every(r => r.etag === '"package-v1"'));
  const changed = await store.readRepositorySnapshot('owner/first');
  assert.equal(changed.overview.sha, 'c'.repeat(40));
  assert.equal(changed.evidence.readme, before.evidence.readme, 'A 304 response reuses the exact saved document');
  assert.deepEqual(changed.overview.dependencies, before.overview.dependencies);
  assert.equal(await evidenceContentFingerprint(changed.evidence), await evidenceContentFingerprint(before.evidence));
  start = upstream.requests.length;
  clock += SNAPSHOT_INTERVAL_MS; upstream.setRelease('v2');
  await collect();
  const released = await store.readRepositorySnapshot('owner/first');
  assert.equal(released.evidence.release.name, 'v2', 'A release update is detected even when the commit is unchanged');
  assert.equal(upstream.requests.slice(start).filter(r => /\/git\/trees\/|\/readme|\/contents\//.test(r.url)).length, 0);
  assert.equal((await store.readRepositorySnapshot('owner/first', { version: first.version })).evidence.release, null);
  clock += SNAPSHOT_INTERVAL_MS; upstream.fail('quota');
  const active = await store.readSnapshotManifest();
  await assert.rejects(() => store.refreshRepositorySnapshot(), e => e.status === 429);
  assert.equal((await store.readSnapshotManifest()).version, active.version);
  upstream.fail('private');
  await assert.rejects(() => store.refreshRepositorySnapshot(), /공개 저장소/);
  assert.equal((await store.readSnapshotManifest()).version, active.version);
  console.log('통과: 동일 커밋 본문 조회 0회·스타만 갱신·README 중복 수집 제거·변경된 커밋도 ETag 304 저장본 재사용·커밋과 독립적인 릴리스 변경 감지·본문이 같은 해설 근거 보존·오류와 private 응답 시 이전 버전 유지');
} finally { f.close(); globalThis.fetch = originalFetch; Date.now = originalNow; }
