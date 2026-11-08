import assert from 'node:assert/strict';
import { snapshotFixture, mockSnapshotGitHub } from './test-support/snapshot-fixture.mjs';

const originalFetch = globalThis.fetch;
const f = snapshotFixture();
const upstream = mockSnapshotGitHub();
globalThis.fetch = upstream.fetch;
try {
  const snapshots = f.load('features/repositories/snapshot-store.js');
  for (let i = 0; i < 3; i++) await snapshots.refreshRepositorySnapshot();
  const store = f.load('features/editorial/brief-store.js');
  const types = f.load('features/editorial/brief-types.js');
  const { evidenceContentFingerprint } = f.load('features/editorial/brief-evidence.js');
  const content = {
    tagline: '프로젝트 자료를 쉽게 살펴보는 공개 도구입니다.', summary: '공식 문서를 근거로 용도와 확인할 부분을 정리한 설명입니다.',
    useCases: ['새로운 프로젝트에 적용할 도구를 비교할 때 활용합니다.'], strengths: ['공식 문서에서 사용 예시와 설정 방법을 제공합니다.'], limitations: ['실제 설치와 실행 호환성은 별도 검증이 필요합니다.'], gettingStarted: '공식 README를 읽고 설치 조건과 사용 예시를 확인하세요.',
    trendReasons: [{ kind: 'inference', text: '공식 사용 예시가 도입 검토에 도움이 될 수 있으나 인기의 원인은 확인되지 않았습니다.', sourceUrls: ['https://github.com/owner/first/blob/main/README.md'] }],
  };
  assert.equal(types.briefContentSchema.safeParse(content).success, true);
  assert.equal(types.briefContentSchema.safeParse({ ...content, trendReasons: [] }).success, false);
  const beforeReads = upstream.calls;
  globalThis.fetch = async () => { throw new Error('Public and editorial reads must not call GitHub'); };
  const queue = await store.collectEditorialQueue();
  assert.equal(queue.totalRepositories, 3); assert.equal(queue.queue.length, 3);
  assert.equal(queue.periods.length, 3);
  await assert.rejects(() => store.publishBrief({ repository: 'owner/first', fingerprint: 'a'.repeat(64), content }));
  for (const item of queue.queue) {
    const rowContent = { ...content, trendReasons: [{ ...content.trendReasons[0], sourceUrls: [item.evidence.sources[1].url] }] };
    await assert.rejects(() => store.publishBrief({ repository: item.repository, fingerprint: item.fingerprint, content: { ...rowContent, trendReasons: [{ ...content.trendReasons[0], sourceUrls: ['https://evil.test/fake'] }] } }));
    await store.publishBrief({ repository: item.repository, fingerprint: item.fingerprint, content: rowContent });
  }
  assert.equal((await store.collectEditorialQueue()).dueRepositories, 0);
  const saved = await store.readBrief('OWNER/FIRST');
  assert.equal(saved.article.content.summary, content.summary);
  assert.equal(saved.snapshot.id, (await snapshots.readSnapshotManifest()).version);
  assert.equal(saved.stale, false);
  assert.equal((await store.readBrief('owner/not-collected')).evidence, null);
  const fingerprint = await evidenceContentFingerprint(saved.evidence);
  assert.equal(await evidenceContentFingerprint({ ...saved.evidence, stars: 999, fetchedAt: '2026-01-01', trending: { ...saved.evidence.trending, rank: 99 } }), fingerprint, 'Popularity changes do not invalidate introductions');
  const generatedAt = saved.article.generatedAt;
  const item = queue.queue[0];
  assert.equal((await store.publishBrief({ repository: item.repository, fingerprint: item.fingerprint, content })).unchanged, true);
  const version = saved.snapshot.id;
  f.sqlite.prepare("UPDATE repository_snapshot_items SET evidence = json_set(evidence, '$.description', 'Changed purpose', '$.stars', 999) WHERE id=?").run(`${version}:owner/first`);
  const changed = await store.readBrief('owner/first');
  assert.equal(changed.evidence.stars, 999, 'Current metadata comes from the snapshot');
  assert.equal(changed.article.evidence.stars, 100, 'The explanation retains its original evidence');
  assert.equal(changed.article.generatedAt, generatedAt); assert.equal(changed.stale, true);
  assert.equal((await store.collectEditorialQueue()).dueRepositories, 0, 'Source drift does not silently rewrite an existing introduction');
  const importedInput = {
    repository: 'owner/manual',
    source: { description: 'Official manual', language: null, stars: 0, license: null,
      readme: 'Official README describing input, processing, output and the documented starting path.',
      readmeUrl: 'https://raw.githubusercontent.com/owner/manual/main/README.md', fetchedAt: new Date().toISOString(), period: 'monthly', warnings: [] },
    content: { ...content, trendReasons: [{ ...content.trendReasons[0], sourceUrls: ['https://raw.githubusercontent.com/owner/manual/main/README.md'] }] },
  };
  for (const readmeUrl of ['https://evil.test/README.md', 'https://github.com/other/manual/blob/main/README.md']) await assert.rejects(() => store.importBrief({ ...importedInput, source: { ...importedInput.source, readmeUrl } }));
  await assert.rejects(() => store.importBrief({ ...importedInput, source: { ...importedInput.source, fetchedAt: '2000-01-01T00:00:00Z' } }));
  assert.equal((await store.importBrief(importedInput)).unchanged, false);
  assert.equal((await store.importBrief(importedInput)).unchanged, true);
  assert.equal((await store.readBrief('owner/manual')).article.content.summary, content.summary);
  assert.equal(upstream.calls, beforeReads);
  await assert.rejects(() => store.collectEditorialQueue({ unknown: true }));
  await assert.rejects(() => store.collectEditorialQueue({ refreshAfter: new Date(Date.now() + 3600000).toISOString() }));

  f.write('test-env.js', 'exports.env = { REPOFIT_EDITOR_EMAIL: "owner@example.test" };');
  f.write('test-auth.js', 'exports.getChatGPTUser = async () => globalThis.__briefUser;');
  f.compile('features/skills/catalog-types.ts');
  f.write('features/skills/catalog-store.js', 'exports.readSkillCatalog = async () => ({skills:[]});');
  f.write('features/usage/usage-mcp.js', 'exports.usageTools = []; exports.usageServerInstructions = "";');
  f.compile('app/mcp/route.ts', 'mcp.js', s => s.replaceAll("'cloudflare:workers'", "'./test-env'").replaceAll("'@/app/chatgpt-auth'", "'./test-auth'"));
  const { POST } = f.load('mcp.js');
  const call = (name, args = {}) => POST(new Request('https://fixture.test/mcp', { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) })).then(r => r.json());
  for (const identity of [null, { email: 'visitor@example.test' }]) {
    globalThis.__briefUser = identity;
    for (const name of ['refresh_repository_snapshot', 'get_editorial_queue', 'import_repository_brief']) assert.equal((await call(name)).result.isError, true);
    assert.equal((await call('get_repository_snapshot_status')).result.isError, undefined);
  }
  globalThis.__briefUser = { email: 'owner@example.test' };
  assert.equal((await call('get_editorial_queue')).result.isError, undefined);
  assert.equal(JSON.parse((await call('refresh_repository_snapshot')).result.content[0].text).published, true);
  assert.equal((await call('unknown')).error.code, -32602);
  f.compile('app/api/editorial/route.ts', 'editorial-api.js', s => s.replaceAll("'@/app/mcp/route'", "'./mcp'"));
  assert.equal((await f.load('editorial-api.js').POST(new Request('https://fixture.test/api/editorial', { method: 'POST', headers: { origin: 'https://evil.test' }, body: '{}' }))).status, 403);
  console.log('통과: 저장된 3기간 자료만 해설에 사용·조회와 해설 큐 GitHub 호출 0회·기존 해설과 작성 시각 보존·최신 스냅샷 수치·출처 변경 표시·소유자 전용 갱신·공식 출처 검증·게시 재시도 안전성');
} finally { f.close(); globalThis.fetch = originalFetch; delete globalThis.__briefUser; }
