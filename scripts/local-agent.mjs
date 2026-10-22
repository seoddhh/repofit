#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { hostname } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { collectInventory } from './local-agent/inventory.mjs';

const help = `RepoFit Mac 연결 (Node.js 22.13+)
  npm run local-agent -- --site http://localhost:5173 --project /path/to/repo
  npm run local-agent -- --project /path/to/repo --inspect

연결 코드는 실행 후 터미널에 입력합니다. 사이트 /agent에서 코드를 만드세요.
--inspect는 전송 없이 로컬 목록을 출력합니다. --once는 한 번 전송하고 종료합니다.
기본값은 60초 간격 갱신이며 Ctrl+C로 종료합니다. 토큰은 메모리에만 보관합니다.
비공개 Sites는 --service-token-env 환경변수이름 으로 서비스 접근 토큰을 별도 지정합니다.
선택한 프로젝트와 표준 에이전트 스킬 경로의 이름·설명·상태만 전송합니다.
스킬 본문·설정 원문·API 키·대화·사용 기록은 전송하지 않습니다.`;

async function main() {
  const { values } = parseArgs({ options: {
    site: { type: 'string' }, project: { type: 'string' }, name: { type: 'string' },
    inspect: { type: 'boolean' }, once: { type: 'boolean' }, help: { type: 'boolean' },
    'service-token-env': { type: 'string' },
  } });
  if (values.help) { console.log(help); return; }
  if (!values.project) throw new Error(`--project로 허용할 프로젝트 폴더를 지정하세요.\n${help}`);
  if (values.inspect) { console.log(JSON.stringify(await collectInventory(values.project), null, 2)); return; }
  if (!values.site) throw new Error('--site로 연결할 RepoFit 주소를 지정하세요.');
  const site = new URL(values.site);
  if (site.username || site.password || site.pathname !== '/' || site.search || site.hash ||
    (site.protocol !== 'https:' && !(site.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(site.hostname)))) throw new Error('HTTPS 사이트 주소 또는 로컬 개발 주소만 사용할 수 있습니다.');
  const serviceToken = values['service-token-env'] ? process.env[values['service-token-env']] : null;
  if (values['service-token-env'] && !serviceToken) throw new Error('서비스 접근 토큰 환경변수가 비어 있습니다.');
  const { createInterface } = await import('node:readline/promises');
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  const code = (await prompt.question('사이트에서 만든 일회용 연결 코드: ')).trim();
  prompt.close();
  if (!/^[a-f0-9]{48}$/.test(code)) throw new Error('연결 코드 형식을 확인해 주세요.');
  const controller = new AbortController();
  process.once('SIGINT', () => controller.abort());
  process.once('SIGTERM', () => controller.abort());
  const call = async (path, body, token) => {
    const response = await fetch(new URL(path, site), {
      method: token ? 'PUT' : 'POST', redirect: 'error',
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(serviceToken ? { 'OAI-Sites-Authorization': `Bearer ${serviceToken}` } : {}) }, body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { const error = new Error(data.error ?? `사이트 연결 실패 (${response.status}). 비공개 사이트라면 서비스 접근 설정을 확인하세요.`); error.status = response.status; throw error; }
    return data;
  };
  const inventory = await collectInventory(values.project);
  const connection = await call('/api/local-agent/connect', { code, name: (values.name ?? hostname()).slice(0, 200) });
  if (!/^[a-f0-9]{48}$/.test(connection.token)) throw new Error('서버가 기기 토큰을 반환하지 않았습니다.');
  console.log(`${inventory.project.name} 연결 완료. 사이트의 내 에이전트에서 확인하세요. 종료: Ctrl+C`);
  let snapshot = inventory;
  while (!controller.signal.aborted) {
    try {
      await call('/api/local-agent/snapshot', snapshot, connection.token);
      console.log(`${new Date().toLocaleTimeString('ko-KR')} 목록 전달: ${snapshot.agents.map(agent => `${agent.id} ${agent.skills.length}개`).join(', ')}`);
    } catch (error) {
      if (controller.signal.aborted) break;
      if ([401, 403, 413].includes(error.status) || values.once) throw error;
      console.error('사이트에 전달하지 못했습니다. 60초 후 다시 시도합니다.');
    }
    if (values.once) break;
    try { await delay(60000, undefined, { signal: controller.signal }); } catch { break; }
    if (!controller.signal.aborted) snapshot = await collectInventory(values.project);
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
