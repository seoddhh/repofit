import type { TrendingPeriod, TrendingSnapshot } from './repository-types';

export const snapshotPeriods: TrendingPeriod[] = ['daily', 'weekly', 'monthly'];
export const SNAPSHOT_INTERVAL_MS = 8 * 60 * 60_000;
// UTC 23:00 / 07:00 / 15:00 are 08:00 / 16:00 / 00:00 in Korea.
export function snapshotSlot(time = Date.now()) {
  return Math.floor((time + 9 * 60 * 60_000) / SNAPSHOT_INTERVAL_MS) * SNAPSHOT_INTERVAL_MS - 9 * 60 * 60_000;
}

export type RepositorySnapshotManifest = {
  version: string;
  slot: number;
  fetchedAt: string;
  publishedAt: string | null;
  nextRefreshAt: string;
  periods: Record<TrendingPeriod, TrendingSnapshot>;
  repositories: string[];
  completed: number;
  error?: string;
};
