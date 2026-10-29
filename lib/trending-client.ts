import type { TrendingSnapshot } from './repository-types';

const FRESH_MS = 5 * 60_000;
let cached: { snapshot: TrendingSnapshot; expiresAt: number } | null = null;
let pending: Promise<TrendingSnapshot> | null = null;

/** Share fresh results across route remounts and development effect replays. */
export function getTrendingSnapshot(force = false): Promise<TrendingSnapshot> {
  if (!force && cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.snapshot);
  if (pending) return pending;
  pending = (async () => {
    const response = await fetch('/api/trending', { cache: force ? 'reload' : 'default' });
    const data = await response.json() as TrendingSnapshot & { error?: string };
    if (!response.ok) throw new Error(data.error ?? '트렌딩 목록을 불러오지 못했습니다.');
    cached = { snapshot: data, expiresAt: data.stale ? Date.now() + 30_000 : Date.parse(data.fetchedAt) + FRESH_MS };
    return data;
  })().finally(() => { pending = null; });
  return pending;
}
