import { realpath, readdir } from 'node:fs/promises';
import { resolve, relative, isAbsolute, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { load, JSON_SCHEMA } from 'js-yaml';

export const digest = value => createHash('sha256').update(value).digest('hex');
export const inside = (root, path) => { const rel = relative(root, path); return !rel || (!rel.startsWith('..') && !isAbsolute(rel)); };
export function displayPath(path, project, home) {
  if (inside(project, path)) return `./${relative(project, path)}`;
  if (inside(home, path)) return `~/${relative(home, path)}`;
  return `[외부 경로]/${basename(path)}`;
}
export async function readAllowed(path, roots, maxBytes = 262144) {
  const actual = await realpath(path);
  if (!roots.some(root => inside(root, actual))) throw new Error('승인 범위 밖의 심볼릭 링크를 제외했습니다.');
  const { open } = await import('node:fs/promises');
  const file = await open(actual, 'r');
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > maxBytes) throw new Error('파일 크기 또는 형식을 확인할 수 없습니다.');
    // Fixed-size reads also bound files that grow between stat and read.
    const buffer = Buffer.alloc(maxBytes + 1);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    if (bytesRead > maxBytes) throw new Error('파일 크기 제한을 초과했습니다.');
    return buffer.subarray(0, bytesRead).toString('utf8');
  } finally { await file.close(); }
}
export async function readJson(path) {
  // Configs must be the exact requested file; never follow links to auth files.
  try {
    const actual = await realpath(path);
    if (actual !== resolve(path)) throw new Error('설정 파일의 심볼릭 링크를 제외했습니다.');
    return JSON.parse(await readAllowed(path, [resolve(path)]));
  } catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
}
export async function skillFiles(root, roots, depth = 0) {
  if (depth > 2) return [];
  let entries;
  try {
    const actual = await realpath(root);
    if (!roots.some(allowed => inside(allowed, actual))) return [];
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  if (entries.some(entry => entry.name === 'SKILL.md')) return [resolve(root, 'SKILL.md')];
  const result = [];
  for (const entry of entries.slice(0, 1000)) {
    if (entry.name.startsWith('.') || (!entry.isDirectory() && !entry.isSymbolicLink())) continue;
    result.push(...await skillFiles(resolve(root, entry.name), roots, depth + 1));
    if (result.length >= 1000) break;
  }
  return result.slice(0, 1000);
}
export async function readSkill(path, roots) {
  const text = await readAllowed(path, roots);
  const match = text.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) throw new Error('SKILL.md의 YAML 메타데이터가 없습니다.');
  const meta = load(match[1], { schema: JSON_SCHEMA, maxAliasCount: 0 });
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) throw new Error('스킬 메타데이터 형식이 올바르지 않습니다.');
  return {
    name: (typeof meta.name === 'string' ? meta.name : basename(resolve(path, '..'))).slice(0, 200),
    description: typeof meta.description === 'string' ? meta.description.slice(0, 2000) : '',
    hash: digest(text), manualOnly: meta['disable-model-invocation'] === true,
  };
}
