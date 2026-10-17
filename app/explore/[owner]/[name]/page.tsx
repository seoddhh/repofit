import { notFound } from 'next/navigation';
import { RepositoryExplanation } from '@/components/repository-explanation';
import { repositoryId } from '@/lib/repository-types';

export default async function Page({ params }: { params: Promise<{ owner: string; name: string }> }) {
  const { owner, name } = await params;
  const id = repositoryId(`${owner}/${name}`);
  if (!id) notFound();
  return <RepositoryExplanation key={id} repository={id}/>;
}
