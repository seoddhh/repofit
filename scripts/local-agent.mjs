#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { hostname } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { collectInventory, personalWorkspace } from './local-agent/inventory.mjs';
import { runCoach } from './local-agent/coach.mjs';
import { selectHistory } from './local-agent/history.mjs';

const help = `RepoFit Mac 연결 (Node.js 22.13+)
  npm run local-agent -- --site http://localhost:5173 --agent codex
  npm run local-agent -- --agent codex --inspect
  npm run local-agent -- --site http://localhost:5173 --agent codex --select-history
  npm run local-agent -- --site http://localhost:5173 --project .

연결 코드는 실행 후 터미널에 입력합니다. 사이트 /agent에서 코드를 만드세요.
--inspect는 전송 없이 로컬 목록을 출력합니다. --once는 한 번 전송하고 종료합니다.
기본값은 60초 간격 갱신이며 Ctrl+C로 종료합니다. 토큰은 메모리에만 보관합니다.
비공개 Sites는 --service-token-env 환경변수이름 으로 서비스 접근 토큰을 별도 지정합니다.
프로젝트 없이 개인 에이전트를 연결합니다. --project는 프로젝트 문맥이 필요할 때만 사용합니다.
목록은 이름·설명·상태만 전송하며 설정·API 키·대화 기록을 전송하지 않습니다.
사이트에서 명시적으로 요청한 활용 분석은 로컬 Codex로 실행합니다.
분석 입력은 모델 서비스에 전달될 수 있고 로컬 로그인·이용 한도가 적용됩니다.`;
let inputPrompt;

async function main() {
  const { values } = parseArgs({ options: {
    site: { type: 'string' }, project: { type: 'string' }, name: { type: 'string' },
    inspect: { type: 'boolean' }, once: { type: 'boolean' }, help: { type: 'boolean' },
    'service-token-env': { type: 'string' },
    agent: { type: 'string', default: 'codex' },
    'select-history': { type: 'boolean' },
  } });
  if (values.help) { console.log(help); return; }
  if (!['codex', 'claude', 'all'].includes(values.agent)) throw new Error('--agent는 codex, claude, all 중 하나를 선택하세요.');
  const collect = () => collectInventory(values.project, { agent: values.agent });
  if (values.inspect) { console.log(JSON.stringify(await collect(), null, 2)); return; }
  if (!values.site) throw new Error('--site로 연결할 RepoFit 주소를 지정하세요.');
  const site = new URL(values.site);
  if (site.username || site.password || site.pathname !== '/' || site.search || site.hash ||
    (site.protocol !== 'https:' && !(site.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(site.hostname)))) throw new Error('HTTPS 사이트 주소 또는 로컬 개발 주소만 사용할 수 있습니다.');
  const serviceToken = values['service-token-env'] ? process.env[values['service-token-env']] : null;
  if (values['service-token-env'] && !serviceToken) throw new Error('서비스 접근 토큰 환경변수가 비어 있습니다.');
  const { createInterface } = await import('node:readline/promises');
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  inputPrompt = prompt;
  const code = (await prompt.question('사이트에서 만든 일회용 연결 코드: ')).trim();
  if (!values['select-history']) prompt.close();
  if (!/^[a-f0-9]{48}$/.test(code)) throw new Error('연결 코드 형식을 확인해 주세요.');
  const controller = new AbortController();
  process.once('SIGINT', () => controller.abort());
  process.once('SIGTERM', () => controller.abort());
  const call = async (path, body, token, method = token ? 'PUT' : 'POST') => {
    const response = await fetch(new URL(path, site), {
      method, redirect: 'error',
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(serviceToken ? { 'OAI-Sites-Authorization': `Bearer ${serviceToken}` } : {}) }, body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { const error = new Error(data.error ?? `사이트 연결 실패 (${response.status}). 비공개 사이트라면 서비스 접근 설정을 확인하세요.`); error.status = response.status; throw error; }
    return data;
  };
  const inventory = await collect();
  const connection = await call('/api/local-agent/connect', { code, name: (values.name ?? hostname()).slice(0, 200) });
  if (!/^[a-f0-9]{48}$/.test(connection.token)) throw new Error('서버가 기기 토큰을 반환하지 않았습니다.');
  if (values['select-history']) {
    if (values.agent !== 'codex') throw new Error('사용 사례 선택은 현재 Codex에서 지원합니다.');
    try {
      const summary = await selectHistory(await personalWorkspace(), message => prompt.question(message), controller.signal);
      if (summary) { await call('/api/local-agent/activity', { consent: true, summary }, connection.token); console.log('선택한 요약을 전달했습니다. 사이트의 활용 진단에서 포함할 수 있습니다.'); }
    } catch (error) { console.error(error.message); }
  }
  prompt.close();
  console.log(`${inventory.project?.name ?? '개인 에이전트'} 연결 완료. 사이트의 내 에이전트에서 확인하세요. 종료: Ctrl+C`);
  let snapshot = inventory;
  let lastInventory = 0;
  const processJob = async job => {
    const canceled = new AbortController();
    const signal = AbortSignal.any([controller.signal, canceled.signal]);
    let checking = false;
    const heartbeat = setInterval(async () => {
      if (checking) return; checking = true;
      try { const result = await call('/api/local-agent/jobs', { action: 'heartbeat', id: job.id, lease: job.lease }, connection.token); if (!result.active) canceled.abort(); }
      catch { canceled.abort(); }
      finally { checking = false; }
    }, 10000);
    try {
      console.log('사이트에서 요청한 활용 보고서를 작성합니다.');
      const narrative = await runCoach(job.bundle, await personalWorkspace(), signal);
      if (!signal.aborted) await call('/api/local-agent/jobs', { action: 'complete', id: job.id, lease: job.lease, narrative }, connection.token);
      console.log(signal.aborted ? '보고서 요청이 취소되었거나 연결이 끊겼습니다.' : '보고서 결과를 사이트에 전달했습니다.');
    } catch (error) {
      if (!signal.aborted) {
        console.error(error.message);
        await call('/api/local-agent/jobs', { action: 'fail', id: job.id, lease: job.lease }, connection.token).catch(() => {});
      }
    } finally { clearInterval(heartbeat); }
  };
  while (!controller.signal.aborted) {
    try {
      if (Date.now() - lastInventory >= 60000) {
        if (lastInventory) snapshot = await collect();
        await call('/api/local-agent/snapshot', snapshot, connection.token);
        lastInventory = Date.now();
        console.log(`${new Date().toLocaleTimeString('ko-KR')} 목록 전달: ${snapshot.agents.map(agent => `${agent.id} ${agent.skills.length}개`).join(', ')}`);
      }
      if (!values.once && snapshot.agents.some(agent => agent.id === 'codex')) {
        const { job } = await call('/api/local-agent/jobs', undefined, connection.token, 'POST');
        if (job) await processJob(job);
      }
    } catch (error) {
      if (controller.signal.aborted) break;
      if ([401, 403, 413].includes(error.status) || values.once) throw error;
      console.error('사이트와 통신하지 못했습니다. 연결 상태와 DB 마이그레이션을 확인해 주세요.');
    }
    if (values.once) break;
    try { await delay(5000, undefined, { signal: controller.signal }); } catch { break; }
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => inputPrompt?.close());
