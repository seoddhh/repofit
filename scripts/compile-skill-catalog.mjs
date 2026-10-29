import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { skillExplanationSchema } from '../lib/catalog-types.ts';
import { sourceAvailability } from '../lib/skills-public.mjs';
import { uiCopy } from '../lib/ui-copy.ts';

const snapshot = JSON.parse(await readFile('outputs/catalog-sources/leaderboard.json', 'utf8'));
const authored = (await Promise.all(['001-100', '101-200', '201-300'].map(async part => JSON.parse(await readFile(`content/skills-authored/${part}.json`, 'utf8'))))).flat();
if (authored.length !== 300 || new Set(authored.map(s => s.id)).size !== 300) throw new Error(`Expected 300 authored descriptions, got ${authored.length}`);
const map = new Map(authored.map(item => [item.id, item.explanation]));
const skills = [];
for (const skill of snapshot.skills) {
  const source = JSON.parse(await readFile(`outputs/catalog-sources/${skill.rank}.json`, 'utf8'));
  if (source.id !== skill.id) throw new Error('Collected source does not match ranking');
  const explanation = skillExplanationSchema.parse(uiCopy(map.get(skill.id)));
  const parts = skill.source.split('/');
  skills.push({ id: skill.id, name: skill.name, source: skill.source, slug: source.slug, rank: skill.rank, installs: skill.installs,
    url: skill.url, repositoryUrl: parts.length === 2 ? `https://github.com/${skill.source}` : null,
    availability: sourceAvailability(source.sourceText), explanation, contentHash: source.contentHash,
    checkedAt: source.checkedAt, writtenAt: new Date().toISOString(), descriptionVersion: 1,
  });
}
const version = createHash('sha256').update(JSON.stringify(skills.map(s => ({id:s.id,hash:s.contentHash,explanation:s.explanation,installs:s.installs})))).digest('hex');
const result = { version, fetchedAt: snapshot.retrievedAt, checkedAt: new Date().toISOString(), sourceUrl: snapshot.sourceUrl, skills };
await writeFile('content/skill-catalog.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({version,total:skills.length,categories:[...new Set(skills.map(s=>s.explanation.category))],deprecated:skills.filter(s=>s.availability==='deprecated').map(s=>s.id)}));
