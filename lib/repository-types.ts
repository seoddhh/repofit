export type TrendingRepo = {
  id: string;
  rank: number;
  description: string;
  language: string | null;
  color: string | null;
  stars: number | null;
  today: number | null;
};

export type TrendingSnapshot = {
  repositories: TrendingRepo[];
  fetchedAt: string;
  sourceUrl: string;
  stale: boolean;
};

export type RepositoryOverview = {
  id: string;
  description: string;
  language: string | null;
  stars: number;
  license: string | null;
  sha: string;
  fetchedAt: string;
  readme: string | null;
  readmePath: string | null;
  paths: string[];
  truncated: boolean;
  dependencies: Record<string, string>;
  packageName: string | null;
  warnings: string[];
};

export function repositoryId(value: string): string | null {
  const input = value.trim();
  let path = input;
  if (/^https?:\/\//i.test(input)) {
    try {
      const url = new URL(input);
      if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port || url.username || url.password || url.search || url.hash) return null;
      path = url.pathname.replace(/^\//, '').replace(/\/$/, '');
    } catch { return null; }
  }
  path = path.replace(/\.git$/, '');
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9_.-]{1,100}$/.test(path)) return null;
  if (['.', '..'].includes(path.split('/')[1])) return null;
  return path;
}

export function compactNumber(value: number | null): string {
  return value === null ? '—' : new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}
