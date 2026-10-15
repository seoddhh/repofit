import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

function load(file, imports = {}) {
  const testModule = { exports: {} };
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(code, { module: testModule, exports: testModule.exports, URL, decodeURIComponent, process: { env: { NODE_ENV: 'production' } }, Response, require: name => {
    if (!(name in imports)) throw new Error(`Unexpected import: ${name}`);
    return imports[name];
  } }, { filename: file });
  return testModule.exports;
}

const paths = load('lib/chatgpt-auth-paths.ts');
assert.equal(paths.safeRelativeReturnPath('/project?candidate=TanStack%2Fquery#review'), '/project?candidate=TanStack%2Fquery#review');
for (const value of ['https://evil.example', '//evil.example', '/\\evil.example', '/%5Cevil', '/%2Fevil', '/signin-with-chatgpt', '/%73ignin-with-chatgpt/', '/callback?return_to=/callback', '/signout-with-chatgpt/', '/bad%ZZ', '/\nevil']) assert.equal(paths.safeRelativeReturnPath(value), '/', value);
assert.equal(paths.chatGPTSignInPath('/project?candidate=a%2Fb'), '/signin-with-chatgpt?return_to=%2Fproject%3Fcandidate%3Da%252Fb');
assert.equal(paths.chatGPTSignOutPath('//evil.example'), '/signout-with-chatgpt?return_to=%2F');

let incomingHeaders = new Headers();
const auth = load('app/chatgpt-auth.ts', {
  'next/headers': { headers: async () => incomingHeaders },
  'next/navigation': { redirect: path => { throw new Error(`redirect:${path}`); } },
  '@/lib/chatgpt-auth-paths': paths,
});
assert.equal(await auth.getChatGPTUser(), null);
await assert.rejects(() => auth.requireChatGPTUser('/history'), /redirect:\/signin-with-chatgpt\?return_to=%2Fhistory/);
incomingHeaders = new Headers({ 'oai-authenticated-user-id': 'user-one' });
assert.equal(await auth.getChatGPTUser(), null);
incomingHeaders.set('oai-authenticated-user-email', 'one@example.test');
incomingHeaders.set('oai-authenticated-user-full-name', encodeURIComponent('테스트 사용자'));
incomingHeaders.set('oai-authenticated-user-full-name-encoding', 'percent-encoded-utf-8');
assert.equal((await auth.getChatGPTUser()).displayName, '테스트 사용자');
incomingHeaders.set('oai-authenticated-user-full-name', '%bad%encoding');
assert.equal((await auth.getChatGPTUser()).displayName, 'one@example.test');

const session = load('app/api/session/route.ts', { '@/app/chatgpt-auth': auth });
let response = await session.GET();
let payload = await response.json();
assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
assert.equal(response.headers.get('Vary'), 'Cookie');
assert.equal(payload.authenticated, true);
assert.equal(payload.identitySource, 'chatgpt-sites');
assert.equal('userId' in payload.user, false);
assert.equal(payload.planUsage.available, false);
assert.equal(payload.planUsage.status, 'not_connected');
incomingHeaders = new Headers();
response = await session.GET(); payload = await response.json();
assert.equal(payload.authenticated, false);
assert.equal(payload.user, null);
assert.equal(payload.planUsage.available, false);
console.log('통과: 외부 리다이렉트·인증 경로 루프 차단, 원래 쿼리 보존, 미인증 거부, 이름 디코딩, 세션 캐시 차단, 계정 식별자 비노출, 로그인과 AI 권한 분리');
