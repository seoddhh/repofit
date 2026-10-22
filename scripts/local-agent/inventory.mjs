import { realpath, stat } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { homedir } from 'node:os';
import { codexInventory, run } from './codex.mjs';
import { claudeInventory } from './claude.mjs';
import { digest } from './files.mjs';

export async function collectInventory(projectPath, options = {}) {
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
