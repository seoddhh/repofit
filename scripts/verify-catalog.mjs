import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, symlinkSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';
import { parsePublicLeaderboard, parsePublicSkill } from '../lib/skills-public.mjs';

const temporary = mkdtempSync(join(tmpdir(), 'repofit-catalog-'));
const require = createRequire(import.meta.url);
const originalFetch = globalThis.fetch, originalNow = Date.now;
let sqlite;
const page = props => `<span>SKILL.md</span><script>self.__next_f.push(${JSON.stringify([1, `0:${JSON.stringify(['$', '$L1', null, props])}\n`])})</script>`;
try {
  for (const dir of ['lib', 'db', 'content']) mkdirSync(join(temporary, dir));
  writeFileSync(join(temporary, 'package.json'), '{"type":"commonjs"}');
  symlinkSync(resolve('node_modules'), join(temporary, 'node_modules'));
  const fixture = JSON.parse(readFileSync('content/skill-catalog.json', 'utf8'));
  assert.equal(fixture.skills.length, 300, 'Exactly 300 authored skills are packaged');
  const body = skill => `Stored public instructions for ${skill.id}. Use only for the documented task.`;
  const hash = value => createHash('sha256').update(value).digest('hex');
  fixture.checkedAt = new Date().toISOString();
  for (const skill of fixture.skills) skill.contentHash = hash(body(skill));
  writeFileSync(join(temporary, 'content/skill-catalog.json'), JSON.stringify(fixture));
  for (const file of ['lib/catalog-store.ts', 'lib/catalog-types.ts', 'lib/ui-copy.ts', 'lib/github-server.ts', 'lib/trending-parser.ts', 'lib/repository-types.ts', 'db/schema.ts']) {
    writeFileSync(join(temporary, file.replace('.ts', '.js')), ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText);
  }
  copyFileSync('lib/skills-public.mjs', join(temporary, 'lib/skills-public.mjs'));
  writeFileSync(join(temporary, 'db/index.js'), 'exports.getDb = () => globalThis.__catalogDb;');
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync('drizzle/0006_exotic_supreme_intelligence.sql', 'utf8'));
  const d1 = { prepare(sql) { const statement = sqlite.prepare(sql); return { bind(...params) { return {
    async raw() { statement.setReturnArrays(true); return statement.all(...params); },
    async all() { return { results: statement.all(...params) }; },
    async run() { statement.run(...params); return { success: true }; },
  }; } }; } };
  globalThis.__catalogDb = require('drizzle-orm/d1').drizzle(d1);
  const store = require(join(temporary, 'lib/catalog-store.js'));
  const { skillExplanationSchema } = require(join(temporary, 'lib/catalog-types.js'));
  for (const skill of fixture.skills) assert.ok(skillExplanationSchema.safeParse(skill.explanation).success, skill.id);
  let requests = 0;
  globalThis.fetch = async () => { requests++; throw new Error('Offline'); };
  assert.equal((await store.readSkillCatalog()).skills.length, 300);
  assert.equal((await store.getSkillCatalogQueue()).storageVerified, true);
  assert.equal(requests, 0, 'Reading and recently completed updates never fetch upstream');
  assert.ok((await store.catalogSearch(fixture.skills[0].name)).skills.some(s => s.id === fixture.skills[0].id));
  Date.now = () => originalNow() + 8 * 86400000;
  let fail = true;
  const listing = page({ view: 'all-time', initialSkills: fixture.skills.map(s => ({source:s.source,skillId:s.slug,name:s.name,installs:s.installs})) });
  assert.equal(parsePublicLeaderboard(listing).length, 300);
  assert.throws(() => parsePublicLeaderboard(page({view:'all-time',initialSkills:[]})));
  assert.throws(() => parsePublicSkill('<p>not a skill page</p>'));
  globalThis.fetch = async url => {
    requests++;
    if (url === 'https://www.skills.sh/') return new Response(listing);
    const skill = fixture.skills.find(s => s.url === url);
    if (!skill) throw new Error('Unexpected external URL');
    if (fail && skill.id === fixture.skills[1].id) return new Response('limited', {status:429});
    const content = skill.id === fixture.skills[0].id ? body(skill) + ' Changed source.' : body(skill);
    return new Response(page({previewHtml:`<p>${content}</p>`,restHtml:''}));
  };
  let result = await store.getSkillCatalogQueue();
  assert.equal(result.queue.length, 1);
  const changed = result.queue[0];
  assert.equal((await store.readSkillCatalog()).version, fixture.version, 'Draft sources never replace the active catalog');
  await assert.rejects(() => store.publishSkillExplanation({...changed,fingerprint:'wrong',explanation:fixture.skills[0].explanation}));
  await store.publishSkillExplanation({id:changed.id,fingerprint:changed.fingerprint,explanation:fixture.skills[0].explanation});
  result = await store.getSkillCatalogQueue();
  assert.equal(result.failures.length, 1);
  assert.equal((await store.readSkillCatalog()).version, fixture.version, 'Rate limit keeps last complete snapshot');
  fail = false;
  for (let i=0;i<110&&!result.published;i++) {
    result = await store.getSkillCatalogQueue();
    assert.equal(result.queue.length, 0, 'Unchanged source does not require rewriting');
  }
  assert.equal(result.published, true);
  const updated = await store.readSkillCatalog();
  assert.equal(updated.skills.length, 300);
  assert.notEqual(updated.version, fixture.version);
  assert.equal(updated.skills[1].writtenAt, fixture.skills[1].writtenAt, 'Unchanged explanation date is preserved');
  const beforeRead = requests;
  await store.readSkillCatalog();
  assert.equal(requests, beforeRead);
  console.log('통과: 300개 설명 스키마, 한국어 검색, 외부 요청 없는 읽기, 변경분 작성, fingerprint 검증, 한도 초과 보존, 커서 재개, 전체 성공 후 공개, 변경 없는 설명 시각 유지');
} finally {
  globalThis.fetch = originalFetch; Date.now = originalNow; delete globalThis.__catalogDb; sqlite?.close(); rmSync(temporary,{recursive:true,force:true});
}
