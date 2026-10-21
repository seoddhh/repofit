import { SkillsCatalog } from '@/components/skills-catalog';

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  return <SkillsCatalog key={q ?? 'agent'} initialQuery={typeof q === 'string' && q.trim() ? q.slice(0, 100) : 'agent'}/>;
}
