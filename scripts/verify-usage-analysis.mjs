import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, symlinkSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

const dir = mkdtempSync(join(tmpdir(), 'repofit-usage-'));
const require = createRequire(import.meta.url);
let database;
try {
  writeFileSync(join(dir, 'package.json'), '{"type":"commonjs"}');
  symlinkSync(resolve('node_modules'), join(dir, 'node_modules'));
  for (const name of ['lib', 'db', 'routes', 'public/skills/repofit-usage-analysis']) mkdirSync(join(dir, name), { recursive: true });
  const compile = (source, target, replace = s => s) => writeFileSync(join(dir, target), ts.transpileModule(replace(readFileSync(source, 'utf8')), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText);
  for (const name of ['usage-types', 'usage-store', 'local-agent-types', 'local-agent-store', 'local-agent-http']) compile(`lib/${name}.ts`, `lib/${name}.js`);
  compile('db/schema.ts', 'db/schema.js');
  writeFileSync(join(dir, 'db/index.js'), 'exports.getDb = () => globalThis.__usageDb;');
  writeFileSync(join(dir, 'auth.js'), 'exports.getChatGPTUser = async () => globalThis.__usageUser;');
  writeFileSync(join(dir, 'lib/catalog-store.js'), 'exports.readSkillCatalog = async () => globalThis.__usageCatalog;');
  for (const name of ['analysis.schema.json', 'report.schema.json']) writeFileSync(join(dir, 'public/skills/repofit-usage-analysis', name), readFileSync(`public/skills/repofit-usage-analysis/${name}`));
  const routeImports = s => s.replaceAll('@/app/chatgpt-auth', '../auth').replaceAll('@/lib/', '../lib/');
  compile('app/api/usage-analysis/route.ts', 'routes/owner.js', routeImports);
  database = new DatabaseSync(':memory:');
  for (const file of readdirSync('drizzle').filter(f => f.endsWith('.sql')).sort()) {
    if (file.startsWith('0008_')) database.exec(`INSERT INTO agent_usage_runs (id,user_id,device_id,goal,selected_skill_ids,status,created_at,updated_at,expires_at,message,candidates,report) VALUES ('migration-fixture','fixture-owner','fixture-device','','[]','completed','2026-01-01','2026-01-01','2099-01-01','saved report','[]','{"summary":"preserved"}')`);
    database.exec(readFileSync(join('drizzle', file), 'utf8'));
    if (file.startsWith('0008_')) {
      const migrated = database.prepare("SELECT executor, report FROM agent_usage_runs WHERE id='migration-fixture'").get();
      assert.equal(migrated.executor, 'local'); assert.equal(JSON.parse(migrated.report).summary, 'preserved', 'Migration preserves existing reports');
      database.exec("DELETE FROM agent_usage_runs WHERE id='migration-fixture'");
    }
  }
  const d1 = { prepare(sql) { const statement = database.prepare(sql); return { bind(...params) { return {
    async raw() { statement.setReturnArrays(true); return statement.all(...params); },
    async all() { return { results: statement.all(...params) }; },
    async run() { statement.run(...params); return { success: true }; },
  }; } }; } };
  globalThis.__usageDb = require('drizzle-orm/d1').drizzle(d1);
  const store = require(join(dir, 'lib/usage-store.js'));
  const devices = require(join(dir, 'lib/local-agent-store.js'));
  const owner = require(join(dir, 'routes/owner.js'));
  const types = require(join(dir, 'lib/usage-types.js'));
  const sentence = '공식 원문에서 확인한 코드 검증과 반복 작업에 대한 설명입니다.';
  const entry = (slug, availability = 'active') => ({ id: `acme/skills/${slug}`, name: slug, slug, source: 'acme/skills', url: `https://skills.sh/acme/skills/${slug}`, availability, checkedAt: new Date().toISOString(), contentHash: 'a'.repeat(64), installs: 10, explanation: { category: 'debugging', workKinds: ['coding', 'debugging'], tagline: sentence, summary: `testing ${slug} ${sentence}`, capabilities: ['testing'], problems: [sentence], steps: [sentence], benefits: [sentence], requirements: [sentence], limitations: [sentence] } });
  globalThis.__usageCatalog = { version: 'fixture', skills: [entry('testing'), entry('other'), entry('retired', 'deprecated')] };
  const inventory = { protocolVersion: 2, profileId: crypto.randomUUID(), context: { kind: 'personal' }, observedAt: new Date().toISOString(), project: null, capabilities: ['usage-analysis-v1'], agents: [{ id: 'codex', version: 'test', status: 'ready', skills: [], warnings: [] }] };
  async function connect(user) {
    const pairing = await devices.createLocalPairing(user);
    const connection = await devices.claimLocalPairing({ code: pairing.code, name: `${user} Mac` });
    await devices.receiveLocalInventory(connection.token, inventory);
    return connection;
  }
  const a = await connect('user-a'); const b = await connect('user-b');
  const body = { deviceId: a.deviceId, consent: true, historyScope: 'recent-10', selectedSkillIds: ['acme/skills/testing'] };
  await assert.rejects(() => store.createUsageRun('user-a', { ...body, consent: false }));
  await assert.rejects(() => store.createUsageRun('user-b', body));
  await assert.rejects(() => store.createUsageRun('user-a', { ...body, selectedSkillIds: ['missing'] }));
  const run = await store.createUsageRun('user-a', body);
  assert.equal(run.status, 'queued'); assert.equal('userId' in run, false); assert.equal('leaseHash' in run, false);
  await assert.rejects(() => store.createUsageRun('user-a', body), /이미 분석/);
  await assert.rejects(() => store.getUsageRun('user-b', run.id), /찾지/);
  assert.equal((await store.claimUsageRun(b.token)).job, null);
  const claims = await Promise.all([store.claimUsageRun(a.token), store.claimUsageRun(a.token)]);
  assert.equal(claims.filter(c => c.job).length, 1, 'Only one claimant can start a run');
  const job = claims.find(c => c.job).job;
  await assert.rejects(() => store.updateUsageRun(a.token, { action: 'complete', id: job.id, lease: job.lease, report: {} }), /먼저/);
  assert.equal((await store.updateUsageRun(b.token, { action: 'heartbeat', id: job.id, lease: job.lease })).active, false);
  const assessment = { criterion: 'verification', status: 'opportunity', attribution: 'unknown', cause: '검증을 요청한 이유와 앞선 실행 과정은 확인하지 못했습니다.', impact: '검증 요청만 관찰했으며 재작업이나 실패 여부는 미확인입니다.', alternativeExplanation: '기존 확인 절차를 보강하려는 요청일 수 있습니다.', nextCheck: '다음 작업에서 완료 조건과 실행한 확인 근거를 함께 남겨 봅니다.', evidence: [{ sourceId: 'case-1-item-0', kind: 'user_request', summary: '사용자가 결과 확인을 요청했습니다.' }] };
  const analysis = { rubricVersion: 'workflow-evidence-v1', summary: '확인한 작업에서 검증 요청이 나타났습니다.', patterns: [{ id: 'pattern-1', observation: '완료한 작업의 검증을 요청했습니다.', interpretation: '검증 절차를 반복 활용할 기회가 있습니다.', need: '작업에 맞는 검증 절차', query: 'testing', sourceIds: ['case-1-item-0'], assessment }], strengths: ['완료 후 결과 확인을 요청했습니다.'], limitations: ['한 사례만 확인해 반복 습관은 판정하지 않았습니다.'] };
  const legacy = { ...analysis }; delete legacy.rubricVersion; legacy.patterns = analysis.patterns.map(({ assessment: _, ...p }) => p);
  assert.ok(types.usageAnalysisSchema.safeParse(legacy).success, 'Previously saved analyses remain valid');
  assert.equal(types.usageAnalysisSchema.safeParse({ ...analysis, patterns: legacy.patterns }).success, false, 'Versioned findings require assessments');
  assert.equal(types.usageAnalysisSchema.safeParse({ ...analysis, patterns: [{ ...analysis.patterns[0], assessment: { ...assessment, evidence: [{ ...assessment.evidence[0], sourceId: 'case-1-item-1' }] } }] }).success, false, 'Representative evidence must belong to the finding');
  assert.equal(types.usageAnalysisSchema.safeParse({ ...analysis, patterns: [{ ...analysis.patterns[0], assessment: { ...assessment, evidence: Array(4).fill(assessment.evidence[0]) } }] }).success, false, 'Per-message annotation growth is bounded');
  const coverage = { observedAt: new Date().toISOString(), threadsRead: 1, itemsRead: 1, truncated: false, warnings: [] };
  const prepared = await store.updateUsageRun(a.token, { action: 'prepare', id: job.id, lease: job.lease, analysis, coverage });
  assert.deepEqual(prepared.candidates.map(c => c.id), ['acme/skills/testing'], 'Selected candidates are not replaced by search results');
  await assert.rejects(() => store.updateUsageRun(a.token, { action: 'prepare', id: job.id, lease: job.lease, analysis, coverage }), /이미 분석/);
  const report = { summary: '검증 기준이 필요한 작업에서 이 스킬을 비교해 볼 수 있습니다.', habits: [], recommendations: [{ catalogSkillId: 'acme/skills/testing', reason: '확인한 검증 요청과 후보의 검증 절차가 관련 있습니다.', patternIds: ['pattern-1'], overlap: '기존 목록에서 같은 스킬은 확인하지 못했습니다.', prerequisites: [sentence], steps: [sentence], examplePrompt: '이 작업의 완료 조건에 맞는 검증 항목을 정리해 줘.', expectedBenefits: [sentence], checks: [sentence] }], unmetNeeds: [], limitations: ['실제 실행 호환성은 확인하지 않았습니다.'] };
  // A direct agent needs no device, goal, questionnaire, or selected skills.
  await assert.rejects(() => store.createAgentUsageRun('direct-user', { consent: false }));
  await assert.rejects(() => store.createAgentUsageRun('direct-user', { consent: true, goal: 'condition' }));
  const direct = await store.createAgentUsageRun('direct-user', { consent: true });
  assert.equal(direct.deviceId, null); assert.equal(direct.executor, 'agent'); assert.deepEqual(direct.selectedSkillIds, []);
  assert.equal((await store.createAgentUsageRun('direct-user', { consent: true })).id, direct.id, 'Preparing an active request is idempotent');
  await assert.rejects(() => store.startAgentUsageRun('other-user', { id: direct.id, consent: true }), /찾지/);
  const directClaims = await Promise.allSettled([store.startAgentUsageRun('direct-user', { id: direct.id, consent: true }), store.startAgentUsageRun('direct-user', { id: direct.id, consent: true })]);
  assert.equal(directClaims.filter(c => c.status === 'fulfilled').length, 1);
  const started = directClaims.find(c => c.status === 'fulfilled').value;
  await assert.rejects(() => store.updateAgentUsageRun('direct-user', { id: direct.id, expectedRevision: started.revision, action: 'complete', report }), /먼저/);
  await assert.rejects(() => store.updateAgentUsageRun('other-user', { id: direct.id, expectedRevision: started.revision, action: 'prepare', analysis, coverage }), /찾지/);
  const directPrepared = await store.updateAgentUsageRun('direct-user', { id: direct.id, expectedRevision: started.revision, action: 'prepare', analysis, coverage: { ...coverage, verification: 'local_checked' } });
  assert.equal(directPrepared.coverage.verification, 'agent_reported', 'Direct-agent evidence is not claimed as locally verified');
  assert.ok(directPrepared.candidates.some(c => c.id === 'acme/skills/testing'));
  await assert.rejects(() => store.updateAgentUsageRun('direct-user', { id: direct.id, expectedRevision: started.revision, action: 'complete', report }), /상태/);
  const directDone = await store.updateAgentUsageRun('direct-user', { id: direct.id, expectedRevision: directPrepared.revision, action: 'complete', report });
  assert.equal(directDone.status, 'completed');
  await assert.rejects(() => store.updateAgentUsageRun('direct-user', { id: direct.id, expectedRevision: directDone.revision, action: 'complete', report }), /상태/);
  const directNoHistory = { run: await store.startAgentUsageRun('empty-agent', { consent: true }) };
  assert.equal((await store.updateAgentUsageRun('empty-agent', { id: directNoHistory.run.id, expectedRevision: directNoHistory.run.revision, action: 'fail', reason: 'no_history' })).status, 'failed');
  const directCanceled = await store.startAgentUsageRun('cancel-agent', { consent: true });
  await store.cancelUsageRun('cancel-agent', directCanceled.id);
  await assert.rejects(() => store.updateAgentUsageRun('cancel-agent', { id: directCanceled.id, expectedRevision: directCanceled.revision, action: 'prepare', analysis, coverage }), /상태/);
  for (const status of ['insufficient_evidence', 'not_applicable']) {
    assert.throws(() => types.validateUsageReport(report, { ...analysis, patterns: [{ ...analysis.patterns[0], assessment: { ...assessment, status } }] }, prepared.candidates), /판단 자료/);
  }
  await assert.rejects(() => store.updateUsageRun(a.token, { action: 'complete', id: job.id, lease: job.lease, report: { ...report, recommendations: [{ ...report.recommendations[0], catalogSkillId: 'fabricated' }] } }), /후보만/);
  await assert.rejects(() => store.updateUsageRun(a.token, { action: 'complete', id: job.id, lease: job.lease, report: { ...report, habits: [{ action: sentence, examplePrompt: sentence, patternIds: ['unknown'] }] } }), /사용 방식/);
  assert.equal((await store.updateUsageRun(a.token, { action: 'complete', id: job.id, lease: job.lease, report })).active, true);
  assert.equal((await store.getUsageRun('user-a', run.id)).status, 'completed');
  assert.equal((await store.updateUsageRun(a.token, { action: 'complete', id: job.id, lease: job.lease, report })).active, false);
  assert.equal((await store.listUsageRuns('user-a')).length, 1, 'Stored result survives independent reads');
  assert.equal((await store.searchUsageSkills({ query: 'testing' })).skills.some(c => c.availability === 'deprecated'), false);
  const request = (method, body, origin = 'https://repofit.example') => new Request('https://repofit.example/api/usage-analysis', { method, headers: { origin, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  globalThis.__usageUser = null;
  assert.equal((await owner.GET(request('GET'))).status, 401);
  globalThis.__usageUser = { userId: 'user-a', email: 'ordinary@example.test' };
  assert.equal((await owner.POST(request('POST', body, 'https://evil.test'))).status, 403);
  assert.equal((await owner.GET(request('GET'))).headers.get('cache-control'), 'private, no-store');
  globalThis.__usageUser = { userId: 'website-agent-user' };
  const fromWebsiteResponse = await owner.POST(request('POST', { consent: true }));
  assert.equal(fromWebsiteResponse.status, 201);
  const fromWebsite = await fromWebsiteResponse.json(); assert.equal(fromWebsite.executor, 'agent'); assert.equal(fromWebsite.status, 'queued');
  const websiteStarted = { run: await store.startAgentUsageRun('website-agent-user', { id: fromWebsite.id, consent: true }) };
  assert.equal(websiteStarted.run.status, 'running', 'Only an agent tool invocation starts analysis');
  globalThis.__usageUser = { userId: 'user-a', email: 'ordinary@example.test' };
  await store.deleteUsageRun('user-a', run.id);
  const unsupportedRun = await store.createUsageRun('user-a', { ...body, selectedSkillIds: [] });
  const unsupportedJob = (await store.claimUsageRun(a.token)).job;
  const unsupportedAnalysis = { ...analysis, patterns: [{ ...analysis.patterns[0], assessment: { ...assessment, status: 'insufficient_evidence' } }] };
  const unsupportedPrepared = await store.updateUsageRun(a.token, { action: 'prepare', id: unsupportedJob.id, lease: unsupportedJob.lease, analysis: unsupportedAnalysis, coverage });
  assert.deepEqual(unsupportedPrepared.candidates, [], 'Uncertain findings do not trigger skill discovery');
  await store.deleteUsageRun('user-a', unsupportedRun.id);
  const cancel = await store.createUsageRun('user-a', body); const cancelJob = (await store.claimUsageRun(a.token)).job;
  await store.cancelUsageRun('user-a', cancel.id);
  assert.equal((await store.updateUsageRun(a.token, { action: 'prepare', id: cancel.id, lease: cancelJob.lease, analysis, coverage })).active, false);
  const stale = await store.createUsageRun('user-a', body); await store.claimUsageRun(a.token);
  database.prepare('UPDATE agent_usage_runs SET lease_expires_at = ? WHERE id = ?').run('2000-01-01T00:00:00.000Z', stale.id);
  assert.equal((await store.getUsageRun('user-a', stale.id)).status, 'failed');
  await store.deleteUsageRun('user-a', stale.id); await store.deleteUsageRun('user-a', cancel.id);
  const revoked = await store.createUsageRun('user-a', body); const revokeJob = (await store.claimUsageRun(a.token)).job;
  await devices.removeLocalDevice('user-a', a.deviceId);
  assert.equal((await store.getUsageRun('user-a', revoked.id)).status, 'canceled');
  await assert.rejects(() => store.updateUsageRun(a.token, { action: 'heartbeat', id: revoked.id, lease: revokeJob.lease }), /만료/);
  const ajv = new (require('ajv').default ?? require('ajv'))({ strict: false });
  const jsonSchema = JSON.parse(readFileSync('public/skills/repofit-usage-analysis/analysis.schema.json', 'utf8'));
  const validateAnalysis = ajv.compile(jsonSchema);
  assert.ok(validateAnalysis(analysis));
  const maximum = schema => schema.const ?? schema.enum?.[0] ?? (schema.type === 'string' ? '한'.repeat(schema.maxLength ?? 20) : schema.type === 'array' ? Array.from({ length: schema.maxItems }, () => maximum(schema.items)) : Object.fromEntries(Object.entries(schema.properties).map(([key, value]) => [key, maximum(value)])));
  const largest = maximum(jsonSchema);
  largest.patterns.forEach((p, i) => { p.id = `pattern-${i + 1}`; p.sourceIds = Array.from({ length: 6 }, (_, j) => `case-1-item-${j}`); p.assessment.evidence.forEach((e, j) => { e.sourceId = p.sourceIds[j]; }); });
  assert.ok(validateAnalysis(largest), JSON.stringify(validateAnalysis.errors));
  assert.ok(types.usageAnalysisSchema.safeParse(largest).success);
  const maximumPrepareBytes = Buffer.byteLength(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'update_usage_analysis', arguments: { action: 'prepare', id: job.id, lease: job.lease, analysis: largest, coverage } } }));
  assert.ok(maximumPrepareBytes < 100000, 'Bounded assessment output fits the existing MCP byte cap');
  assert.ok(ajv.compile(JSON.parse(readFileSync('public/skills/repofit-usage-analysis/report.schema.json', 'utf8')))(report));
  console.log("통과: 사용자·기기 소유권·동의·단일 실행·분석 저장·상태·마이그레이션과 스키마");
} finally {
  database?.close(); delete globalThis.__usageDb; delete globalThis.__usageUser; delete globalThis.__usageCatalog;
  rmSync(dir, { recursive: true, force: true });
}
