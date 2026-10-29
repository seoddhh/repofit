import { Parser } from 'htmlparser2';

// Decode data shipped in the public page. Never evaluate scripts from a page.
export function publicRecords(html) {
  const chunks = []; let inside = false; let script = '';
  const parser = new Parser({
    onopentag(name) { if (name === 'script') { inside = true; script = ''; } },
    ontext(value) { if (inside) script += value; },
    onclosetag(name) {
      if (name !== 'script' || !inside) return;
      const match = script.match(/^self\.__next_f\.push\(([\s\S]*)\)$/);
      if (match) { try { const value = JSON.parse(match[1]); if (value[0] === 1 && typeof value[1] === 'string') chunks.push(value[1]); } catch { /* Other script formats are not data. */ } }
      inside = false;
    },
  });
  parser.write(html); parser.end();
  const bytes = new TextEncoder().encode(chunks.join('')); const decoder = new TextDecoder(); const records = new Map();
  let offset = 0;
  while (offset < bytes.length) {
    const text = decoder.decode(bytes.subarray(offset, offset + 100)).match(/^([0-9a-f]+):T([0-9a-f]+),/);
    if (text) {
      const start = offset + text[0].length, length = parseInt(text[2], 16);
      if (start + length > bytes.length) throw new Error('공개 페이지 자료가 불완전합니다.');
      records.set(text[1], decoder.decode(bytes.subarray(start, start + length))); offset = start + length;
      if (bytes[offset] === 10) offset++;
    } else {
      let end = bytes.indexOf(10, offset); if (end < 0) end = bytes.length;
      const line = decoder.decode(bytes.subarray(offset, end)), colon = line.indexOf(':');
      if (colon >= 0) { try { records.set(line.slice(0, colon), JSON.parse(line.slice(colon + 1))); } catch { /* Non-JSON Flight records. */ } }
      offset = end + 1;
    }
  }
  return records;
}
function findObjects(records, test) {
  const found = [];
  function visit(value) { if (!value || typeof value !== 'object') return; if (test(value)) found.push(value); for (const child of Object.values(value)) visit(child); }
  for (const value of records.values()) visit(value);
  return found;
}
export function parsePublicLeaderboard(html) {
  const boards = findObjects(publicRecords(html), value => Array.isArray(value.initialSkills));
  if (boards.length !== 1 || boards[0].view !== 'all-time') throw new Error('스킬 순위 페이지 형식이 변경됐습니다.');
  const skills = boards[0].initialSkills.slice(0, 300).map((s, i) => {
    if (typeof s?.source !== 'string' || typeof s?.skillId !== 'string' || typeof s?.name !== 'string' || !s.name.trim()) throw new Error('스킬 항목 형식이 변경됐습니다.');
    const source = String(s.source), slug = String(s.skillId), parts = source.split('/');
    if (![1, 2].includes(parts.length) || ![...parts, slug].every(p => /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,199}$/.test(p))) throw new Error('스킬 출처가 올바르지 않습니다.');
    return { id: `${source}/${slug}`, name: String(s.name).slice(0, 200), source, slug, installs: s.installs, rank: i + 1, url: `https://www.skills.sh/${parts.length === 1 ? 'site/' : ''}${source}/${slug}`, repositoryUrl: parts.length === 2 ? `https://github.com/${source}` : null };
  });
  if (skills.length !== 300 || new Set(skills.map(s => s.id)).size !== 300 || skills.some((s, i) => !Number.isSafeInteger(s.installs) || s.installs < 0 || (i && s.installs > skills[i - 1].installs))) throw new Error('상위 300개 목록 검증에 실패했습니다. 이전 목록을 유지합니다.');
  return skills;
}
export function parsePublicSkill(html) {
  const records = publicRecords(html);
  const components = findObjects(records, value => 'previewHtml' in value && 'restHtml' in value);
  const visible = []; let skip = 0;
  const document = new Parser({ onopentag(name) { if (['script', 'style'].includes(name)) skip++; }, ontext(value) { if (!skip && value.trim()) visible.push(value.trim()); }, onclosetag(name) { if (['script', 'style'].includes(name)) skip--; } });
  document.write(html); document.end();
  const start = visible.indexOf('SKILL.md'), summaryStart = visible.indexOf('Summary');
  if (start < 0) throw new Error('공개 스킬 본문이 없습니다.');
  const summary = summaryStart >= 0 && summaryStart < start ? visible.slice(summaryStart + 1, start).join('\n') : '';
  const resolve = value => typeof value === 'string' && /^\$[0-9a-f]+$/.test(value) ? records.get(value.slice(1)) : value;
  let text = '';
  if (components.length === 1) {
    const parts = [resolve(components[0].previewHtml), resolve(components[0].restHtml)];
    if (parts.some(p => typeof p !== 'string')) throw new Error('스킬 본문 일부가 없습니다.');
    const parser = new Parser({ ontext(value) { text += value; }, onclosetag(name) { if (['p', 'li', 'h1', 'h2', 'h3', 'pre', 'tr'].includes(name)) text += '\n'; } });
    parser.write(parts.join('')); parser.end();
  } else if (components.length === 0) {
    const end = visible.findIndex((value, index) => index > start && ['Installs', 'Related skills'].includes(value));
    text = visible.slice(start + 1, end >= 0 ? end : undefined).join('\n');
  } else throw new Error('공개 스킬 본문을 특정하지 못했습니다.');
  if (summary) text = `skills.sh summary:\n${summary}\n\nSKILL.md:\n${text}`;
  text = text.replace(/\n{3,}/g, '\n\n').trim();
  if (text.length < 40 || text.length > 200000) throw new Error('스킬 본문 읽기 범위를 확인해 주세요.');
  return text;
}
export function sourceAvailability(body) {
  const original = body.includes('SKILL.md:\n') ? body.split('SKILL.md:\n').at(-1) : body;
  const heading = original.trim().split('\n')[0];
  if (/\b(deprecated|retired)\b/i.test(heading)) return 'deprecated';
  if (/\bmoved\b/i.test(heading)) return 'moved';
  return 'active';
}
