import { parseDocument, DomUtils } from 'htmlparser2';
import { repositoryId, type TrendingRepo } from './repository-types';

/** Parse only GitHub's repository rows; preserve their source order. */
export function parseTrending(html: string): TrendingRepo[] {
  const doc = parseDocument(html);
  const rows = DomUtils.findAll(node => node.name === 'article' && (node.attribs.class ?? '').split(/\s+/).includes('Box-row'), doc.children);
  if (!rows.length || rows.length > 50) throw new Error('GitHub Trending 목록 구조를 확인하지 못했습니다.');
  const seen = new Set<string>();
  return rows.map((row, index) => {
    const heading = DomUtils.findOne(node => node.name === 'h2', row.children);
    const link = heading && DomUtils.findOne(node => node.name === 'a', heading.children);
    const id = repositoryId(link?.attribs.href?.replace(/^\//, '') ?? '');
    if (!id || seen.has(id.toLowerCase())) throw new Error('GitHub Trending의 레포 이름을 확인하지 못했습니다.');
    seen.add(id.toLowerCase());
    const description = DomUtils.findOne(node => node.name === 'p', row.children);
    const language = DomUtils.findOne(node => node.attribs.itemprop === 'programmingLanguage', row.children);
    const color = DomUtils.findOne(node => (node.attribs.class ?? '').split(/\s+/).includes('repo-language-color'), row.children);
    const stars = DomUtils.findOne(node => node.name === 'a' && node.attribs.href === `/${id}/stargazers`, row.children);
    const todayNode = DomUtils.findOne(node => node.name === 'span' && /^\s*[\d,]+\s+stars? today\s*$/.test(DomUtils.textContent(node)), row.children);
    const today = todayNode ? DomUtils.textContent(todayNode).match(/([\d,]+)\s+stars? today/) : null;
    const starText = stars ? DomUtils.textContent(stars).replace(/,/g, '').trim() : '';
    return {
      id, rank: index + 1,
      description: description ? DomUtils.textContent(description).replace(/\s+/g, ' ').trim() : '',
      language: language ? DomUtils.textContent(language).trim() : null,
      color: color?.attribs.style?.match(/#[0-9a-f]{6}\b/i)?.[0] ?? null,
      stars: /^\d+$/.test(starText) ? Number(starText) : null,
      today: today ? Number(today[1].replace(/,/g, '')) : null,
    };
  });
}
