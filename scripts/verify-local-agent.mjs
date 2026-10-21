import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync, rmSync, readdirSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';
import { claudeInventory } from './local-agent/claude.mjs';
import { codexInventory } from './local-agent/codex.mjs';
import { readAllowed, skillFiles } from './local-agent/files.mjs';

const temporary = realpathSync(mkdtempSync(join(tmpdir(), 'repofit-local-agent-')));
const require = createRequire(import.meta.url);
let sqlite;
try {
  writeFileSync(join(temporary, 'package.json'), '{"type":"commonjs"}');
  symlinkSync(resolve('node_modules'), join(temporary, 'node_modules'));
  for (const dir of ['lib', 'db', 'routes', 'home/.claude/skills/shared', 'project/.claude/skills/shared', 'project/.claude/skills/blocked', 'home/.claude/plugins/cache/test/skills/plugin-skill']) mkdirSync(join(temporary, dir), { recursive: true });
  function compile(source, output, transform = value => value) {
    writeFileSync(join(temporary, output), ts.transpileModule(transform(readFileSync(source, 'utf8')), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText);
  }
  for (const name of ['local-agent-types', 'local-agent-store', 'local-agent-http']) compile(`lib/${name}.ts`, `lib/${name}.js`);
  compile('db/schema.ts', 'db/schema.js');
  writeFileSync(join(temporary, 'db/index.js'), 'exports.getDb = () => globalThis.__localAgentDb;');
  writeFileSync(join(temporary, 'auth.js'), 'exports.getChatGPTUser = async () => globalThis.__localAgentUser;');
  for (const [name, source] of [['owner', 'app/api/local-agent/route.ts'], ['connect', 'app/api/local-agent/connect/route.ts'], ['snapshot', 'app/api/local-agent/snapshot/route.ts']]) compile(source, `routes/${name}.js`, code => code.replaceAll("@/app/chatgpt-auth", '../auth').replaceAll('@/lib/', '../lib/'));
  sqlite = new DatabaseSync(':memory:');
  for (const file of readdirSync('drizzle').filter(file => file.endsWith('.sql')).sort()) sqlite.exec(readFileSync(join('drizzle', file), 'utf8'));
  const d1 = { prepare(sql) { const statement = sqlite.prepare(sql); return { bind(...params) { return {
    async raw() { statement.setReturnArrays(true); return statement.all(...params); },
    async all() { return { results: statement.all(...params) }; },
    async run() { statement.run(...params); return { success: true }; },
  }; } }; } };
  globalThis.__localAgentDb = require('drizzle-orm/d1').drizzle(d1);
  const store = require(join(temporary, 'lib/local-agent-store.js'));
  const { localInventorySchema } = require(join(temporary, 'lib/local-agent-types.js'));
  const owner = require(join(temporary, 'routes/owner.js'));
  const connect = require(join(temporary, 'routes/connect.js'));
  const snapshotRoute = require(join(temporary, 'routes/snapshot.js'));
  const request = (method, body, headers = {}) => new Request('https://repofit.example/api/local-agent', { method, headers: { origin: 'https://repofit.example', 'content-type': 'application/json', ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  globalThis.__localAgentUser = null;
  assert.equal((await owner.GET()).status, 401);
  globalThis.__localAgentUser = { userId: 'owner-a' };
  assert.equal((await owner.POST(request('POST', undefined, { origin: 'https://evil.example' }))).status, 403);
  const createdResponse = await owner.POST(request('POST'));
  assert.equal(createdResponse.status, 201);
  const pairing = await createdResponse.json();
  const row = sqlite.prepare('SELECT * FROM local_agent_devices').get();
  assert.notEqual(row.pairing_hash, pairing.code);
  assert.equal(row.token_hash, null);
  const connectionResponse = await connect.POST(request('POST', { code: pairing.code, name: 'Test Mac' }));
  assert.equal(connectionResponse.status, 200);
  const connection = await connectionResponse.json();
  assert.equal((await connect.POST(request('POST', { code: pairing.code, name: 'Reuse' }))).status, 401);
  assert.notEqual(sqlite.prepare('SELECT token_hash FROM local_agent_devices').get().token_hash, connection.token);
  const inventory = { protocolVersion: 1, observedAt: new Date().toISOString(), project: { id: 'a'.repeat(64), name: 'repo', branch: 'main' }, agents: ['codex', 'claude'].map(id => ({ id, version: 'test', status: 'ready', skills: [], warnings: [] })) };
  assert.equal((await snapshotRoute.PUT(request('PUT', inventory))).status, 401);
  assert.equal((await snapshotRoute.PUT(request('PUT', inventory, { authorization: `Bearer ${connection.token}` }))).status, 200);
  const listed = await (await owner.GET()).json();
  assert.equal(listed.devices[0].inventory.project.name, 'repo');
  assert.ok(!JSON.stringify(listed).includes(connection.token));
  assert.ok(!JSON.stringify(listed).includes('tokenHash'));
  globalThis.__localAgentUser = { userId: 'owner-b' };
  assert.deepEqual((await (await owner.GET()).json()).devices, []);
  assert.equal((await owner.DELETE(request('DELETE', { id: pairing.id }))).status, 404);
  globalThis.__localAgentUser = { userId: 'owner-a' };
  assert.equal((await owner.DELETE(request('DELETE', { id: pairing.id }))).status, 200);
  assert.equal((await snapshotRoute.PUT(request('PUT', inventory, { authorization: `Bearer ${connection.token}` }))).status, 401);
  const expired = await store.createLocalPairing('owner-a');
  sqlite.prepare('UPDATE local_agent_devices SET pairing_expires_at = ? WHERE id = ?').run('2000-01-01T00:00:00.000Z', expired.id);
  await assert.rejects(() => store.claimLocalPairing({ code: expired.code, name: 'expired' }), /만료/);
  assert.equal(localInventorySchema.safeParse({ ...inventory, agents: [inventory.agents[0], inventory.agents[0]] }).success, false);
  assert.equal((await snapshotRoute.PUT(request('PUT', { giant: 'x'.repeat(1_000_001) }))).status, 413);

  const home = join(temporary, 'home'); const project = join(temporary, 'project');
  const skill = (path, name, description) => writeFileSync(path, `---\nname: ${name}\ndescription: >-\n  ${description}\n---\nSECRET_BODY_DO_NOT_SEND\n`);
  skill(join(home, '.claude/skills/shared/SKILL.md'), 'shared', 'Personal skill');
  skill(join(project, '.claude/skills/shared/SKILL.md'), 'shared', 'Project skill');
  skill(join(project, '.claude/skills/blocked/SKILL.md'), 'blocked', 'Blocked skill');
  skill(join(home, '.claude/plugins/cache/test/skills/plugin-skill/SKILL.md'), 'helper', 'Plugin skill');
  writeFileSync(join(home, '.claude/settings.json'), JSON.stringify({ enabledPlugins: { 'test@market': true } }));
  writeFileSync(join(project, '.claude/settings.local.json'), JSON.stringify({ skillOverrides: { blocked: 'off' } }));
  writeFileSync(join(home, '.claude/plugins/installed_plugins.json'), JSON.stringify({ plugins: { 'test@market': [{ scope: 'user', installPath: join(home, '.claude/plugins/cache/test') }] } }));
  writeFileSync(join(temporary, 'secret'), 'PRIVATE_AUTH_TOKEN');
  symlinkSync(join(temporary, 'secret'), join(project, '.claude/skills/blocked/secret-link'));
  await assert.rejects(() => readAllowed(join(project, '.claude/skills/blocked/secret-link'), [join(project, '.claude/skills')]), /승인 범위/);
  symlinkSync(join(temporary, 'secret'), join(home, '.claude/credentials-link.json'));
  const { readJson } = await import('./local-agent/files.mjs');
  await assert.rejects(() => readJson(join(home, '.claude/credentials-link.json')), /심볼릭 링크/);
  const executable = join(temporary, 'fake-agent');
  writeFileSync(executable, `#!${process.execPath}\nif(process.argv.includes('--version')) { console.log('test 1.0'); process.exit(0); }\nconst readline = require('node:readline').createInterface({input:process.stdin});\nreadline.on('line', line => { const msg=JSON.parse(line); if(msg.id===1) console.log(JSON.stringify({id:1,result:{}})); if(msg.id===2) console.log(JSON.stringify({id:2,result:{data:[{cwd:process.cwd(),skills:[{name:'real-test',description:'from runtime',path:process.cwd()+'/.agents/skills/test/SKILL.md',scope:'repo',enabled:true},{name:'disabled-test',path:'/unknown/SKILL.md',scope:'user',enabled:false}],errors:[]}]}})); });\n`, { mode: 0o755 });
  const claude = await claudeInventory(project, home, executable);
  assert.equal(claude.skills.find(skill => skill.name === 'shared' && skill.scope === 'user').status, 'configured');
  assert.equal(claude.skills.find(skill => skill.name === 'shared' && skill.scope === 'project').status, 'shadowed');
  assert.equal(claude.skills.find(skill => skill.name === 'blocked').status, 'disabled');
  assert.equal(claude.skills.find(skill => skill.name === 'test:helper').status, 'configured');
  assert.ok(!JSON.stringify(claude).includes('SECRET_BODY_DO_NOT_SEND'));
  assert.ok(!JSON.stringify(claude).includes(home));
  const codex = await codexInventory(project, home, executable);
  assert.equal(codex.status, 'ready');
  assert.equal(codex.skills[0].status, 'recognized');
  assert.equal(codex.skills[1].status, 'disabled');
  assert.equal(localInventorySchema.safeParse({ ...inventory, agents: [codex, claude] }).success, true);
  assert.equal((await skillFiles(join(project, 'missing'), [project])).length, 0);
  console.log('통과: 일회용 코드·만료·토큰 해시·소유권 격리·연결 해제·요청 크기·스킬 경로 제한·중복/비활성·본문 비전송·Codex 실제 프로토콜');
} finally {
  sqlite?.close(); delete globalThis.__localAgentDb; delete globalThis.__localAgentUser;
  rmSync(temporary, { recursive: true, force: true });
}
