import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { parsePublicSkill } from '../lib/skills-public.mjs';

const directory = 'outputs/catalog-sources';
await mkdir(directory, { recursive: true });
const snapshot = JSON.parse(await readFile(`${directory}/leaderboard.json`, 'utf8'));
const failures = [];
for (const [index, original] of snapshot.skills.entries()) {
  const skill = { ...original, slug: original.skillId ?? original.slug };
  const file = `${directory}/${skill.rank}.json`;
  try { await readFile(file); continue; } catch { /* Resume a partial collection. */ }
  try {
    let html;
    try { html = await readFile(`${directory}/${skill.rank}.html`, 'utf8'); }
    catch {
      const response = await fetch(skill.url, { headers: { Accept: 'text/html', 'User-Agent': 'RepoFit weekly public catalog' }, signal: AbortSignal.timeout(20000), redirect: 'follow' });
      if (!response.ok) { if ([403, 429].includes(response.status)) throw new Error(`STOP ${response.status}`); throw new Error(`HTTP ${response.status}`); }
      html = await response.text();
      if (Buffer.byteLength(html) > 2500000) throw new Error('Page too large');
      await writeFile(`${directory}/${skill.rank}.html`, html);
      await delay(650);
    }
    const body = parsePublicSkill(html);
    const result = { ...skill, sourceText: body, contentHash: createHash('sha256').update(body).digest('hex'), checkedAt: new Date().toISOString() };
    await writeFile(file, JSON.stringify(result, null, 2) + '\n');
    if ((index + 1) % 10 === 0) console.log(`Collected ${index + 1}/300`);
  } catch (error) {
    failures.push({ id: skill.id, rank: skill.rank, error: error.message });
    await writeFile(`${directory}/failures.json`, JSON.stringify(failures, null, 2));
    console.log(`Failed #${skill.rank}: ${error.message}`);
    if (error.message.startsWith('STOP')) throw error;
  }
}
console.log(JSON.stringify({ complete: 300 - failures.length, failures }));
