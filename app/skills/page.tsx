import { SkillsCatalog } from '@/components/skills-catalog';

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string; skill?: string }> }) {
  const { q, skill } = await searchParams;
  return <SkillsCatalog key={`${q ?? ''}:${skill ?? ''}`} initialQuery={typeof q === 'string' ? q.slice(0, 100) : ''} initialSkill={typeof skill === 'string' ? skill.slice(0, 600) : ''}/>;
}
