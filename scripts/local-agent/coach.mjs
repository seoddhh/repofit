import { spawn } from 'node:child_process';
import { readFile, mkdtemp, rm, realpath } from 'node:fs/promises';
import { join } from 'node:path';

const instructionsUrl = new URL('../../public/skills/repofit-agent-coach/SKILL.md', import.meta.url);
const schemaUrl = new URL('../../public/skills/repofit-agent-coach/report.schema.json', import.meta.url);

export async function runCoach(bundle, workspace, signal, executable = 'codex') {
  const instructions = await readFile(instructionsUrl, 'utf8');
  const data = { ...bundle, inventory: bundle.inventory.map(({ name, description, scope, status }) => ({ name, description, scope, status })), candidates: bundle.candidates.filter(c => c.score > 0 && c.sourceEvidence.status === 'verified').slice(0, 6) };
  return runStructured({ instructions, schemaUrl, data }, workspace, signal, executable);
}

export async function runStructured({ instructions, schemaUrl, data }, workspace, signal, executable = 'codex') {
  workspace = await realpath(workspace);
  const directory = await mkdtemp(join(workspace, 'report-'));
  const output = join(directory, 'result.json');
  // Local Codex login remains in CODEX_HOME; user MCP servers/hooks are not loaded for report generation.
  const { fileURLToPath } = await import('node:url');
  const args = ['exec', '--ignore-user-config', '--ignore-rules', '--disable', 'shell_tool', '--disable', 'unified_exec', '--disable', 'apps', '--disable', 'hooks', '--disable', 'skill_mcp_dependency_install', '--sandbox', 'read-only', '-c', 'approval_policy="never"', '-c', 'web_search="disabled"', '--skip-git-repo-check', '--ephemeral', '--json', '--output-schema', fileURLToPath(schemaUrl), '--output-last-message', output, '-'];
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(executable, args, { cwd: directory, stdio: ['pipe', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
      let settled = false; let size = 0;
      const kill = () => { try { if (process.platform !== 'win32') process.kill(-child.pid, 'SIGTERM'); else child.kill('SIGTERM'); } catch {} };
      const finish = error => {
        if (settled) return; settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
        if (error) { kill(); const force = setTimeout(() => { try { if (process.platform !== 'win32') process.kill(-child.pid, 'SIGKILL'); else child.kill('SIGKILL'); } catch {} }, 1000); force.unref(); reject(error); } else resolve();
      };
      const abort = () => finish(new Error('로컬 분석을 취소했습니다.'));
      const timer = setTimeout(() => finish(new Error('로컬 보고서 작성 시간이 초과됐습니다.')), 240000);
      signal?.addEventListener('abort', abort, { once: true });
      child.on('error', () => finish(new Error('Codex CLI를 실행하지 못했습니다.')));
      child.on('exit', code => finish(code === 0 ? null : new Error('Codex 실행이 실패했습니다. 로그인·이용 한도와 --ignore-user-config 지원 버전을 확인해 주세요.')));
      child.stdin.on('error', () => finish(new Error('Codex 입력 연결이 끊겼습니다.')));
      child.stdout.on('data', chunk => { size += chunk.length; if (size > 5000000) finish(new Error('Codex 출력 한도를 초과했습니다.')); });
      child.stderr.on('data', () => {});
      if (signal?.aborted) abort();
      else child.stdin.end(`${instructions}\n\n분석 자료 (JSON):\n${JSON.stringify(data)}`);
    });
    const { readAllowed } = await import('./files.mjs');
    return JSON.parse(await readAllowed(output, [directory], 100000));
  } finally { await rm(directory, { recursive: true, force: true }); }
}
