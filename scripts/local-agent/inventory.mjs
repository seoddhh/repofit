import { realpath, stat, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, basename, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { codexInventory, run } from './codex.mjs';
import { claudeInventory } from './claude.mjs';
import { digest } from './files.mjs';

export async function collectInventory(projectPath, options = {}) {
  if (!projectPath) {
    const home = await realpath(options.home ?? homedir());
    const workspace = await personalWorkspace(options);
    const profileFile = join(workspace, 'profile-id');
    try { await writeFile(profileFile, randomUUID(), { flag: 'wx', mode: 0o600 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    const profileId = (await readFile(profileFile, 'utf8')).trim();
    if (!/^[a-f0-9-]{36}$/.test(profileId)) throw new Error('로컬 프로필 ID를 확인해 주세요.');
    const selected = options.agent ?? 'codex';
    const agents = [];
    if (selected === 'codex' || selected === 'all') agents.push(await codexInventory(workspace, home, options.codex));
    if (selected === 'claude' || selected === 'all') agents.push(await claudeInventory(workspace, home, options.claude));
    for (const agent of agents) {
      agent.skills = agent.skills.filter(skill => skill.scope !== 'project');
      for (const skill of agent.skills) if (agent.id === 'codex') skill.evidence = '개인 연결 환경의 Codex skills/list 목록입니다. 다른 터미널 대화의 호출 기록은 아닙니다.';
    }
    return { protocolVersion: 2, profileId, context: { kind: 'personal' }, observedAt: new Date().toISOString(), project: null, agents };
  }
  const project = await realpath(resolve(projectPath));
  if (!(await stat(project)).isDirectory()) throw new Error('프로젝트 폴더를 선택해 주세요.');
  const home = await realpath(options.home ?? homedir());
  if (project === home || project === '/') throw new Error('홈 폴더 전체 대신 프로젝트 폴더를 선택해 주세요.');
  let branch = null;
  try { branch = (await run('git', ['-C', project, 'symbolic-ref', '--short', 'HEAD'], { timeout: 3000, maxBuffer: 4096 })).stdout.trim().slice(0, 200) || null; } catch { /* Non-Git folders and detached HEAD are supported. */ }
  const agents = await Promise.all([
    codexInventory(project, home, options.codex), claudeInventory(project, home, options.claude),
  ]);
  return { protocolVersion: 1, observedAt: new Date().toISOString(), project: { id: digest(project), name: basename(project).slice(0, 200), branch }, agents };
}

export async function personalWorkspace(options = {}) {
  const home = options.home ?? homedir();
  const workspace = options.workspace ?? (process.platform === 'darwin' ? join(home, 'Library', 'Application Support', 'RepoFit', 'agent-workspace') : join(home, '.local', 'share', 'repofit', 'agent-workspace'));
  await mkdir(workspace, { recursive: true, mode: 0o700 });
  return realpath(workspace);
}
