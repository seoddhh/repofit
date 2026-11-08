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
  let calls = 0, failure = null, stars = 100;
  return {
    lists,
    get calls() { return calls; },
    fail(value) { failure = value; },
    setStars(value) { stars = value; },
    async fetch(url) {
      calls++;
      if (failure === 'offline') throw new Error('offline');
      if (url.includes('github.com/trending')) {
        const period = new URL(url).searchParams.get('since');
        const label = { daily: 'today', weekly: 'this week', monthly: 'this month' }[period];
        return new Response(lists[period].map(id => `<article class="Box-row"><h2><a href="/${id}">${id}</a></h2><p>Official tool</p><a href="/${id}/stargazers">${stars}</a><span>17 stars ${label}</span></article>`).join(''));
      }
      const id = url.match(/\/repos\/([^/]+\/[^/?]+)/)?.[1];
      if (failure === 'quota' && url.includes('/readme')) return new Response('rate limited', { status: 429 });
      if (url.includes('/git/ref/')) return Response.json({ object: { sha: 'a'.repeat(40) } });
      if (url.includes('/git/trees/')) return Response.json({ tree: [{ path: 'src/app.ts', type: 'blob' }], truncated: false });
      if (url.includes('/readme')) return Response.json({ content: Buffer.from('Official README. This tool supports documented workflows and examples.').toString('base64'), encoding: 'base64', size: 70, path: 'README.md', sha: 'b'.repeat(40), html_url: `https://github.com/${id}/blob/main/README.md` });
      if (url.includes('/contents/package.json')) return Response.json({ name: 'fixture', dependencies: { react: '19' } });
      if (url.includes('/releases')) return Response.json([]);
      return Response.json({ full_name: id, private: failure === 'private', description: 'Official tool', language: 'TypeScript', stargazers_count: stars, license: { spdx_id: 'MIT' }, default_branch: 'main' });
    },
  };
}
