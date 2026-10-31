import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

function load(file, globals = {}, imports = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(code, { module, exports: module.exports, Response, URL, Date, console, ...globals, require: name => {
    if (!(name in imports)) throw new Error(`Unexpected import: ${name}`);
    return imports[name];
  } }, { filename: file });
  return module.exports;
}
let clock = Date.now();
class Clock extends Date { static now() { return clock; } }
const snapshot = () => ({ repositories: [], fetchedAt: new Date(clock).toISOString(), sourceUrl: 'https://github.com/trending?since=daily', stale: false });
let calls = 0; let fail = false; let stale = false; let lastOptions; let lastUrl;
const client = load('lib/trending-client.ts', { Date: Clock, fetch: async (_url, options) => {
  calls++; lastOptions = options; lastUrl = _url;
  if (fail) return Response.json({ error: 'offline' }, { status: 502 });
  return Response.json({ ...snapshot(), sourceUrl: `https://github.com/trending?since=${new URL(_url, 'https://repofit.local').searchParams.get('since')}`, stale });
} });
const first = client.getTrendingSnapshot();
const second = client.getTrendingSnapshot();
assert.equal(first, second, 'Concurrent mounts share one request');
await Promise.all([first, second]);
assert.equal(calls, 1);
await client.getTrendingSnapshot();
assert.equal(calls, 1, 'Route navigation reuses fresh data');
clock += 299000;
await client.getTrendingSnapshot();
assert.equal(calls, 1);
clock += 1001;
await client.getTrendingSnapshot();
assert.equal(calls, 2, 'Expired data is refreshed');
await client.getTrendingSnapshot('daily', true);
assert.equal(calls, 3);
assert.equal(lastOptions.cache, 'reload', 'Explicit refresh bypasses browser cache');
fail = true;
await assert.rejects(() => client.getTrendingSnapshot('daily', true), /offline/);
fail = false;
await client.getTrendingSnapshot('daily', true);
assert.equal(calls, 5, 'Failed requests release the shared pending state');
stale = true;
await client.getTrendingSnapshot('daily', true);
await client.getTrendingSnapshot();
assert.equal(calls, 6, 'Brief backoff avoids repeating failed upstream refreshes');
clock += 30001;
await client.getTrendingSnapshot();
assert.equal(calls, 7);
stale = false;
const weeklyRequest = client.getTrendingSnapshot('weekly');
const weeklyReplay = client.getTrendingSnapshot('weekly');
const monthlyRequest = client.getTrendingSnapshot('monthly');
assert.equal(weeklyRequest, weeklyReplay, 'Only requests for the same period are shared');
assert.notEqual(weeklyRequest, monthlyRequest);
const [weekly, monthly] = await Promise.all([weeklyRequest, monthlyRequest]);
assert.equal(weekly.sourceUrl, 'https://github.com/trending?since=weekly');
assert.equal(monthly.sourceUrl, 'https://github.com/trending?since=monthly');
const beforeReuse = calls;
assert.equal(await client.getTrendingSnapshot('weekly'), weekly);
assert.equal(await client.getTrendingSnapshot('monthly'), monthly);
assert.equal(calls, beforeReuse, 'Each period has its own fresh cache');
fail = true;
await assert.rejects(() => client.getTrendingSnapshot('weekly', true), /offline/);
assert.equal(await client.getTrendingSnapshot('monthly'), monthly, 'A failed weekly refresh leaves monthly data intact');
fail = false;
await client.getTrendingSnapshot('weekly', true);
assert.equal(lastUrl, '/api/trending?since=weekly');
assert.equal(lastOptions.cache, 'reload');
let routePeriod;
let routeSnapshot = { ...snapshot(), fetchedAt: new Date(clock - 120000).toISOString() };
const route = load('app/api/trending/route.ts', { Date: Clock, console: { warn() {} } }, { '@/lib/github-server': { getTrending: async period => { routePeriod = period; return routeSnapshot; } } });
assert.equal((await route.GET(new Request('https://repofit.local/api/trending'))).headers.get('cache-control'), 'private, max-age=180', 'Browser TTL must respect the original collection time');
routeSnapshot = { ...routeSnapshot, stale: true };
assert.equal((await route.GET(new Request('https://repofit.local/api/trending'))).headers.get('cache-control'), 'no-store');

assert.equal(routePeriod, 'daily', 'Requests without a period keep the existing daily default');
for (const period of ['daily', 'weekly', 'monthly']) {
  assert.equal((await route.GET(new Request(`https://repofit.local/api/trending?since=${period}`))).status, 200);
  assert.equal(routePeriod, period);
}
assert.equal((await route.GET(new Request('https://repofit.local/api/trending?since=yearly'))).status, 400);

const root = { style: { overflow: 'clip', overscrollBehavior: 'auto' } };
const body = { style: { position: 'relative', top: '4px', left: '1px', width: '96%', overflow: 'visible' } };
const previousRoot = { ...root.style }; const previousBody = { ...body.style };
let restored;
const scroll = load('lib/page-scroll-lock.ts', { document: { documentElement: root, body }, window: { scrollX: 13, scrollY: 420, scrollTo: value => { restored = value; } } });
const releaseFirst = scroll.lockPageScroll();
assert.equal(body.style.top, '-420px');
assert.equal(body.style.left, '-13px');
assert.equal(root.style.overflow, 'hidden');
const releaseNested = scroll.lockPageScroll();
releaseFirst();
assert.equal(body.style.position, 'fixed', 'Closing one dialog keeps a remaining dialog locked');
assert.equal(restored, undefined);
releaseNested();
assert.deepEqual(body.style, previousBody);
assert.deepEqual(root.style, previousRoot);
assert.equal(restored.top, 420);
assert.equal(restored.left, 13);
releaseNested();
const another = scroll.lockPageScroll(); another();
assert.deepEqual(body.style, previousBody, 'Cleanup is idempotent and supports repeated opens');

const { uiText, uiCopy } = load('lib/ui-copy.ts');
assert.equal(uiText('자료\u00b7출처'), '자료 및 출처');
assert.equal(uiText('Source \u00b7 来源'), 'Source, 来源');
const source = { summary: '설계 \u00b7 검증', items: ['문서\u00b7보고서'] };
const displayed = uiCopy(source);
assert.equal(displayed.summary, '설계 및 검증');
assert.equal(displayed.items[0], '문서 및 보고서');
assert.equal(source.summary, '설계 \u00b7 검증', 'Presentation formatting leaves original sources unchanged');
console.log('통과: 기간별 트렌딩 요청 공유와 캐시 분리, 5분 재사용 및 기간 검증, 수동 갱신과 실패 복구, HTTP 캐시 잔여 시간, 배경 스크롤 잠금과 위치 복원, 기존 문구 표시 정리');
