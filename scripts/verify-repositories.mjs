import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const temporary = mkdtempSync(join(tmpdir(), 'repofit-check-'));
try {
  writeFileSync(join(temporary, 'package.json'), '{"type":"commonjs"}');
  symlinkSync(resolve('node_modules'), join(temporary, 'node_modules'));
  for (const name of ['repository-types', 'trending-parser', 'integration-plan', 'github-server']) {
    writeFileSync(join(temporary, `${name}.js`), ts.transpileModule(readFileSync(`lib/${name}.ts`, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText);
  }
  const require = createRequire(import.meta.url);
  const { repositoryId } = require(join(temporary, 'repository-types.js'));
  const { parseTrending } = require(join(temporary, 'trending-parser.js'));
  const { integrationPlan } = require(join(temporary, 'integration-plan.js'));
  const routeSource = readFileSync('app/api/repository/route.ts', 'utf8').replaceAll('@/lib/', './');
  writeFileSync(join(temporary, 'repository-route.js'), ts.transpileModule(routeSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText);
  const { POST } = require(join(temporary, 'repository-route.js'));
  const request = (body, origin = 'https://repofit.local') => new Request('https://repofit.local/api/repository', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body });
  assert.equal((await POST(request('{"repository":"owner/repo"}', 'https://evil.example'))).status, 403);
  for (const body of ['null', '{', '{"repository":"https://evil.example/a/b"}', 'x'.repeat(1001)]) assert.equal((await POST(request(body))).status, 400);
  assert.equal(repositoryId('https://github.com/vercel/next.js.git'), 'vercel/next.js');
  for (const input of ['https://evil.com/a/b', 'https://github.com.evil.com/a/b', 'https://github.com/a/b/tree/main', 'https://user@github.com/a/b', 'https://github.com/a/b?x=y', 'a/..', 'file:///etc/passwd', 'a/b/../c']) assert.equal(repositoryId(input), null, input);
  const fixture = `<article class="Box-row"><h2><a href="/owner/first"><span>owner /</span>first</a></h2><p>Tools &amp; code &#x1F680;</p><span itemprop="programmingLanguage">TypeScript</span><span class="repo-language-color" style="background-color: #3178c6"></span><a href="/owner/first/stargazers">1,234</a><span>17 stars today</span></article><article class="Box-row"><h2><a href="/owner/second">second</a></h2></article>`;
  const parsed = parseTrending(fixture);
  assert.deepEqual(parsed.map(repo => repo.id), ['owner/first', 'owner/second']);
  assert.deepEqual(parsed.map(repo => repo.rank), [1, 2]);
  assert.equal(parsed[0].stars, 1234); assert.equal(parsed[0].today, 17);
  assert.equal(parsed[0].description, 'Tools & code 🚀');
  assert.equal(parsed[1].stars, null); assert.equal(parsed[1].today, null); assert.equal(parsed[1].language, null);
  assert.throws(() => parseTrending('<html><h1>Access denied</h1></html>'));
  assert.throws(() => parseTrending(fixture + fixture));
  const project = { id: 'owner/app', paths: ['package.json','src/hooks/use-data.ts','src/lib/api.ts','.env'], dependencies: { '@tanstack/react-query': '^5.0.0' } };
  const candidate = { id: 'TanStack/query', description: 'Server state query library', dependencies: {}, packageName: '@tanstack/react-query' };
  const plan = integrationPlan(project, candidate);
  assert.equal(plan.existing, '^5.0.0'); assert.ok(plan.paths.every(path => project.paths.includes(path))); assert.ok(!plan.paths.includes('.env'));
  const { boundedText, getTrending, inspectRepository } = require(join(temporary, 'github-server.js'));
  await assert.rejects(() => boundedText(new Response('x'.repeat(100)), 10));
  assert.equal(await boundedText(new Response('한글'), 10), '한글');
  const originalFetch = globalThis.fetch;
  let offline = false;
  globalThis.fetch = async () => { if (offline) throw new Error('offline'); return new Response(fixture); };
  const snapshot = await getTrending(); assert.equal(snapshot.repositories[0].rank, 1); assert.equal(snapshot.stale, false);
  const originalNow = Date.now; Date.now = () => originalNow() + 400000; offline = true;
  assert.equal((await getTrending()).stale, true); Date.now = originalNow;
  globalThis.fetch = async (url) => {
    if (url.endsWith('/repos/owner/app')) return Response.json({ full_name: 'owner/app', description: '', language: 'TypeScript', stargazers_count: 0, license: null, default_branch: 'main' });
    if (url.includes('/git/ref/heads/')) return Response.json({ object: { sha: 'abc123' } });
    if (url.includes('/git/trees/')) return Response.json({ tree: [{path:'package.json'},{path:'.env.local'},{path:'credentials.json'},{path:'src/app.ts'}], truncated: false });
    if (url.includes('/readme?')) return Response.json({ content: Buffer.from('안녕하세요').toString('base64'), encoding: 'base64', path: 'README.md', size: 15 });
    if (url.includes('/contents/package.json')) return Response.json({ name: 'app', dependencies: { react: '^19.0.0' } });
    throw new Error(`Unexpected URL ${url}`);
  };
  const overview = await inspectRepository('owner/app');
  assert.equal(overview.readme, '안녕하세요'); assert.deepEqual(overview.paths, ['package.json','src/app.ts']); assert.equal(overview.dependencies.react, '^19.0.0');
  globalThis.fetch = originalFetch;
  if (process.argv[2]) {
    const live = parseTrending(readFileSync(process.argv[2], 'utf8'));
    assert.ok(live.length > 0); assert.ok(live.every((repo, index) => repo.rank === index + 1));
    console.log(`실제 GitHub HTML: ${live.length}개 · 1위 ${live[0].id}`);
  }
  console.log('통과: URL 검증, 원본 순위, 누락 필드, HTML 구조 오류, 중복 방지, 경로 근거, 읽기 한도, stale 캐시, 커밋 고정 자료 조회, 민감 경로 제외');
} finally { rmSync(temporary, { recursive: true, force: true }); }
