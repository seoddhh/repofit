import { mkdtempSync, readFileSync, readdirSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { createFixtureCompiler, writeFixture } from './compile-fixture.mjs';

export function snapshotFixture() {
  const root = mkdtempSync(join(tmpdir(), 'repofit-snapshots-'));
  const require = createRequire(import.meta.url);
  writeFixture(root, 'package.json', '{"type":"commonjs"}');
  symlinkSync(resolve('node_modules'), join(root, 'node_modules'));
  const compile = createFixtureCompiler(root);
  for (const file of [
    'db/schema.ts', 'lib/service-error.ts', 'features/repositories/repository-types.ts',
    'features/repositories/trending-parser.ts', 'features/repositories/github-server.ts',
    'features/repositories/snapshot-types.ts', 'features/repositories/snapshot-store.ts',
    'features/editorial/brief-types.ts', 'features/editorial/brief-evidence.ts', 'features/editorial/brief-store.ts',
    'app/api/trending/route.ts', 'app/api/brief/route.ts', 'app/api/repository/route.ts',
  ]) compile(file);
  writeFixture(root, 'db/index.js', 'exports.getDb = () => globalThis.__snapshotDb;');
  writeFixture(root, 'content/repository-snapshot-baseline.json', readFileSync('content/repository-snapshot-baseline.json', 'utf8'));
  const sqlite = new DatabaseSync(':memory:');
  for (const file of readdirSync('drizzle').filter(f => f.endsWith('.sql')).sort()) sqlite.exec(readFileSync(join('drizzle', file), 'utf8'));
  const d1 = {
    prepare(sql) {
      return { bind(...params) {
        return {
          async raw() { const stmt = sqlite.prepare(sql); stmt.setReturnArrays(true); return stmt.all(...params); },
          async all() { return { results: sqlite.prepare(sql).all(...params), success: true }; },
          async run() { sqlite.prepare(sql).run(...params); return { results: [], success: true }; },
        };
      } };
    },
    async batch(queries) {
      sqlite.exec('BEGIN');
      try { const results = []; for (const query of queries) results.push(await query.all()); sqlite.exec('COMMIT'); return results; }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
  globalThis.__snapshotDb = require('drizzle-orm/d1').drizzle(d1);
  return { root, sqlite, compile, load: file => require(join(root, file)), write: (file, content) => writeFixture(root, file, content), close() { sqlite.close(); delete globalThis.__snapshotDb; rmSync(root, { recursive: true, force: true }); } };
}

export function mockSnapshotGitHub() {
  const lists = { daily: ['owner/first', 'owner/second'], weekly: ['OWNER/FIRST', 'owner/third'], monthly: ['owner/third'] };
  let calls = 0, failure = null, stars = 100, commit = 'a'.repeat(40), releaseName = null;
  const requests = [];
  return {
    lists,
    get calls() { return calls; },
    requests,
    fail(value) { failure = value; },
    setStars(value) { stars = value; },
    setCommit(value) { commit = value; },
    setRelease(value) { releaseName = value; },
    async fetch(url, options = {}) {
      calls++;
      requests.push({ url, etag: options.headers?.['If-None-Match'] });
      if (failure === 'offline') throw new Error('offline');
      if (url.includes('github.com/trending')) {
        const period = new URL(url).searchParams.get('since');
        const label = { daily: 'today', weekly: 'this week', monthly: 'this month' }[period];
        return new Response(lists[period].map(id => `<article class="Box-row"><h2><a href="/${id}">${id}</a></h2><p>Official tool</p><a href="/${id}/stargazers">${stars}</a><span>17 stars ${label}</span></article>`).join(''));
      }
      const id = url.match(/\/repos\/([^/]+\/[^/?]+)/)?.[1];
      if (failure === 'quota' && /\/readme|\/releases/.test(url)) return new Response('rate limited', { status: 429 });
      if (url.includes('/git/ref/')) return Response.json({ object: { sha: commit } });
      const etag = url.includes('/git/trees/') ? `"tree-${commit}"` : url.includes('/readme') ? '"readme-v1"' : url.includes('/contents/package.json') ? '"package-v1"' : `"release-${releaseName ?? 'none'}"`;
      if (options.headers?.['If-None-Match'] === etag) return new Response(null, { status: 304, headers: { ETag: etag } });
      const headers = { ETag: etag };
      if (url.includes('/git/trees/')) return Response.json({ tree: [{ path: 'src/app.ts', type: 'blob' }], truncated: false }, { headers });
      if (url.includes('/readme')) return Response.json({ content: Buffer.from('Official README. This tool supports documented workflows and examples.').toString('base64'), encoding: 'base64', size: 70, path: 'README.md', sha: 'b'.repeat(40), html_url: `https://github.com/${id}/blob/main/README.md` }, { headers });
      if (url.includes('/contents/package.json')) return Response.json({ name: 'fixture', dependencies: { react: '19' } }, { headers });
      if (url.includes('/releases')) return Response.json(releaseName ? [{ name: releaseName, tag_name: releaseName, body: 'New official release', html_url: `https://github.com/${id}/releases/tag/${releaseName}`, published_at: '2026-11-08T00:00:00Z', draft: false, prerelease: false }] : [], { headers });
      return Response.json({ full_name: id, private: failure === 'private', description: 'Official tool', language: 'TypeScript', stargazers_count: stars, license: { spdx_id: 'MIT' }, default_branch: 'main' });
    },
  };
}

export async function completeSnapshotEditorial(fixture) {
  const store = fixture.load('features/editorial/brief-store.js');
  for (;;) {
    const result = await store.collectEditorialQueue();
    if (result.failures.length) throw new Error(JSON.stringify(result.failures));
    if (!result.dueRepositories) return;
    for (const item of result.queue) await store.publishBrief({ repository: item.repository, fingerprint: item.fingerprint, content: {
      tagline: '공식 자료를 근거로 정리한 테스트 해설입니다.', summary: '프로젝트의 공식 자료로 용도와 도입 조건을 설명합니다.',
      useCases: ['새로운 도구의 용도를 비교하는 데 활용합니다.'], strengths: ['공식 문서에 사용 방법이 설명되어 있습니다.'],
      limitations: ['실제 설치와 실행 환경의 호환성은 확인하지 않았습니다.'], gettingStarted: '공식 README의 시작 절차를 확인하세요.',
      trendReasons: [{ kind: 'inference', text: '공식 자료만으로 인기의 원인은 확인되지 않았습니다.', sourceUrls: [item.evidence.sources[0].url] }],
    } });
  }
}
