import { resolve } from 'node:path';
import { realpath } from 'node:fs/promises';
import { digest, displayPath, inside, readJson, readSkill, skillFiles } from './files.mjs';
import { versionOf } from './codex.mjs';

export async function claudeInventory(project, home, executable = 'claude') {
  const version = await versionOf(executable);
  const config = resolve(home, '.claude');
  const userRoot = resolve(config, 'skills');
  const projectRoot = resolve(project, '.claude/skills');
  const pluginRoot = resolve(config, 'plugins');
  const managedRoot = '/Library/Application Support/ClaudeCode/skills';
  const roots = [userRoot, projectRoot, pluginRoot, managedRoot];
  const warnings = ['설치 파일과 설정으로 확인한 목록입니다. 실행 중인 Claude 세션·내장 스킬·추가 디렉터리·동적 정책은 확인하지 않습니다.'];
  const skills = []; const seen = new Set();
  let enabledPlugins = {}; let overrides = {}; let restricted = false;
  for (const path of [resolve(config, 'settings.json'), resolve(project, '.claude/settings.json'), resolve(project, '.claude/settings.local.json'), '/Library/Application Support/ClaudeCode/managed-settings.json']) {
    try {
      const settings = await readJson(path);
      enabledPlugins = { ...enabledPlugins, ...settings.enabledPlugins };
      overrides = { ...overrides, ...settings.skillOverrides };
      restricted ||= settings.strictPluginOnlyCustomization === true;
      if (settings.permissions?.deny?.some(rule => typeof rule === 'string' && rule.startsWith('Skill'))) warnings.push('Skill 권한 차단 규칙이 있습니다. 실제 호출 허용 여부는 Claude에서 확인해 주세요.');
    } catch { warnings.push('일부 Claude 설정을 읽지 못했습니다. 해당 범위의 활성 상태는 미확인입니다.'); }
  }
  async function scan(root, scope, plugin = null, configured = true) {
    let files;
    try { files = await skillFiles(root, roots); }
    catch { warnings.push(`${scope} 스킬 디렉터리를 읽지 못했습니다.`); return; }
    for (const path of files) {
      if (skills.length >= 1000) break;
      try {
        const actual = await realpath(path);
        const key = `${plugin ?? ''}:${actual}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const meta = await readSkill(path, roots);
        const name = plugin ? `${plugin.split('@')[0]}:${meta.name}` : meta.name;
        const disabled = configured === false || (!plugin && (overrides[meta.name] === 'off' || (restricted && scope !== 'system')));
        skills.push({
          id: digest(`claude:${plugin ?? ''}:${actual}`), name: name.slice(0, 200), description: meta.description,
          scope, source: displayPath(path, project, home).slice(0, 500), plugin,
          status: disabled ? 'disabled' : configured === null || !version ? 'unverified' : 'configured',
          evidence: disabled ? '설정에서 비활성화됐습니다.' : `${meta.manualOnly || overrides[meta.name] === 'user-invocable-only' ? '사용자가 직접 호출하는 스킬입니다. ' : ''}SKILL.md와 설정을 확인했습니다. 런타임 인식은 미확인입니다.`, hash: meta.hash,
        });
      } catch { warnings.push('승인 범위 밖 링크, 잘못된 메타데이터 또는 읽을 수 없는 스킬을 제외했습니다.'); }
    }
  }
  // Personal skills take precedence over project skills with the same name.
  await scan(managedRoot, 'system');
  await scan(userRoot, 'user');
  await scan(projectRoot, 'project');
  const names = new Set();
  for (const skill of skills) {
    if (skill.status === 'disabled') continue;
    if (names.has(skill.name)) { skill.status = 'shadowed'; skill.evidence = '같은 이름의 상위 범위 스킬이 우선합니다.'; }
    else names.add(skill.name);
  }
  try {
    const registry = await readJson(resolve(pluginRoot, 'installed_plugins.json'));
    for (const [plugin, records] of Object.entries(registry.plugins ?? {})) {
      if (!Array.isArray(records)) continue;
      for (const record of records) {
        if (!['user', 'project', 'local'].includes(record.scope)) continue;
        if (record.scope !== 'user' && resolve(record.projectPath ?? '/') !== project) continue;
        if (typeof record.installPath !== 'string') continue;
        const path = resolve(record.installPath);
        if (!inside(pluginRoot, path)) { warnings.push('Claude 플러그인 저장 경로 밖의 설치는 제외했습니다.'); continue; }
        const enabled = typeof enabledPlugins[plugin] === 'boolean' ? enabledPlugins[plugin] : null;
        await scan(resolve(path, 'skills'), 'plugin', plugin.slice(0, 200), enabled);
        try {
          const manifest = await readJson(resolve(path, '.claude-plugin/plugin.json'));
          for (const extra of [manifest.skills].flat().filter(value => typeof value === 'string')) {
            const extraRoot = resolve(path, extra);
            if (inside(path, extraRoot)) await scan(extraRoot, 'plugin', plugin.slice(0, 200), enabled);
          }
        } catch { warnings.push('일부 플러그인의 추가 스킬 경로를 확인하지 못했습니다.'); }
      }
    }
  } catch { warnings.push('Claude 플러그인 설치 목록을 읽지 못했습니다.'); }
  if (skills.length >= 1000) warnings.push('스킬은 최대 1,000개까지 표시합니다.');
  return { id: 'claude', version, status: version ? 'partial' : 'unavailable', skills, warnings: [...new Set(warnings)].slice(0, 30) };
}
