import { ProjectWorkspace } from '@/components/project-workspace';
export default async function Page({ searchParams }: { searchParams: Promise<{ candidate?: string; review?: string }> }) {
  const params = await searchParams;
  return <ProjectWorkspace key={`${params.candidate ?? ''}-${params.review ?? ''}`} initialCandidate={params.candidate ?? ''} reviewId={params.review ?? ''}/>;
}
