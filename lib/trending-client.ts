import type { TrendingPeriod, TrendingSnapshot } from './repository-types';

const FRESH_MS = 5 * 60_000;
const cache = new Map<TrendingPeriod, { snapshot: TrendingSnapshot; expiresAt: number }>();
const requests = new Map<TrendingPeriod, Promise<TrendingSnapshot>>();

/** Share fresh results across route remounts and development effect replays. */
export function getTrendingSnapshot(period: TrendingPeriod = 'daily', force = false): Promise<TrendingSnapshot> {
  const cached = cache.get(period);
  if (!force && cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.snapshot);
  const pending = requests.get(period);
  if (pending) return pending;
  const request = (async () => {
    const response = await fetch(`/api/trending?since=${period}`, { cache: force ? 'reload' : 'default' });
    const data = await response.json() as TrendingSnapshot & { error?: string };
    if (!response.ok) throw new Error(data.error ?? '트렌딩 목록을 불러오지 못했습니다.');
    cache.set(period, { snapshot: data, expiresAt: data.stale ? Date.now() + 30_000 : Date.parse(data.fetchedAt) + FRESH_MS });
    return data;
  })().finally(() => { requests.delete(period); });
  requests.set(period, request);
  return request;
}
