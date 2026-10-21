import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { digest, displayPath } from './files.mjs';

export const run = promisify(execFile);
export async function versionOf(command) {
  try {
    const { stdout } = await run(command, ['--version'], { timeout: 8000, maxBuffer: 16384, env: { ...process.env, DISABLE_AUTOUPDATER: '1' } });
    return stdout.trim().split('\n')[0].slice(0, 100) || null;
  } catch { return null; }
}
export function codexSkillList(project, executable = 'codex') {
  return new Promise((resolveResult, reject) => {
    const child = spawn(executable, ['app-server'], { cwd: project, stdio: ['pipe', 'pipe', 'pipe'] });
    const lines = createInterface({ input: child.stdout });
    let settled = false; let bytes = 0;
    const finish = (error, result) => {
      if (settled) return;
      settled = true; clearTimeout(timeout); lines.close(); child.stdin.end(); child.kill('SIGTERM');
      const force = setTimeout(() => child.kill('SIGKILL'), 1000); force.unref();
      error ? reject(error) : resolveResult(result);
    };
    const timeout = setTimeout(() => finish(new Error('Codex 목록 조회 시간이 초과됐습니다.')), 20000);
    const send = message => { if (!settled) child.stdin.write(`${JSON.stringify(message)}\n`); };
    child.once('error', () => finish(new Error('Codex App Server를 시작하지 못했습니다.')));
    child.once('exit', () => finish(new Error('Codex App Server가 목록 응답 전에 종료됐습니다.')));
    child.stdin.on('error', () => finish(new Error('Codex 연결이 닫혔습니다.')));
    child.stderr.on('data', () => {}); // Never forward logs or credentials to the Site.
    child.stdout.on('data', chunk => {
      bytes += chunk.length;
      if (bytes > 5_000_000) finish(new Error('Codex 응답이 크기 제한을 초과했습니다.'));
    });
    lines.on('line', line => {
      try {
        const message = JSON.parse(line);
        if (message.id === 1) {
          if (message.error) return finish(new Error('Codex 초기화가 거부됐습니다.'));
          send({ method: 'initialized', params: {} });
          send({ id: 2, method: 'skills/list', params: { cwds: [project], forceReload: true } });
        } else if (message.id === 2) {
          if (message.error) return finish(new Error('설치된 Codex가 skills/list 조회를 지원하지 않거나 조회에 실패했습니다.'));
          finish(null, message.result);
        } else if (message.id !== undefined && message.method) {
          // This client can only list skills; it never approves runtime requests.
          send({ id: message.id, error: { code: -32601, message: 'Inventory-only client' } });
        }
      } catch { finish(new Error('Codex 목록 응답을 해석하지 못했습니다.')); }
    });
    send({ id: 1, method: 'initialize', params: { clientInfo: { name: 'repofit_inventory', title: 'RepoFit skill inventory', version: '0.1.0' }, capabilities: {} } });
  });
}
export async function codexInventory(project, home, executable = 'codex') {
  const version = await versionOf(executable);
  if (!version) return { id: 'codex', version, status: 'unavailable', skills: [], warnings: ['Codex CLI를 찾거나 실행하지 못했습니다. PATH를 확인해 주세요.'] };
  try {
    const result = await codexSkillList(project, executable);
    const group = result?.data?.find(item => resolve(item.cwd) === project);
    if (!group || !Array.isArray(group.skills)) throw new Error('Codex 응답에 선택한 프로젝트의 스킬 목록이 없습니다.');
    const skills = group.skills.slice(0, 1000).map(skill => {
      const source = typeof skill.path === 'string' ? displayPath(skill.path, project, home) : 'Codex App Server';
      return {
        id: digest(`codex:${skill.path ?? skill.name}`), name: String(skill.name).slice(0, 200),
        description: String(skill.description ?? '').slice(0, 2000),
        scope: source.includes('/plugins/') ? 'plugin' : ({ repo: 'project', user: 'user', system: 'system', admin: 'system' }[skill.scope] ?? 'system'),
        source: source.slice(0, 500), plugin: null, status: skill.enabled === false ? 'disabled' : 'recognized',
        evidence: '선택한 프로젝트에서 Codex skills/list가 반환한 목록입니다. 현재 대화의 호출 기록은 아닙니다.', hash: null,
      };
    });
    const warnings = [];
    if (group.errors?.length) warnings.push(`Codex가 ${group.errors.length}개 경로의 조회 오류를 보고했습니다. 목록이 일부 누락될 수 있습니다.`);
    if (group.skills.length > 1000) warnings.push('스킬은 최대 1,000개까지 표시합니다.');
    return { id: 'codex', version, status: warnings.length ? 'partial' : 'ready', skills, warnings };
  } catch (error) { return { id: 'codex', version, status: 'partial', skills: [], warnings: [error.message.slice(0, 500)] }; }
}
