'use client';
import { createContext, useContext, useState } from 'react';
import type { RepositoryOverview } from '@/lib/repository-types';

export type Review = { id: string; project: RepositoryOverview; candidate: RepositoryOverview; goal: string; createdAt: string };
type Workspace = {
  project: RepositoryOverview | null; setProject: (project: RepositoryOverview | null) => void;
  goal: string; setGoal: (goal: string) => void; reviews: Review[];
  saveReview: (candidate: RepositoryOverview) => void; removeReview: (id: string) => void;
};
const Context = createContext<Workspace | null>(null);
export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [project, setProject] = useState<RepositoryOverview | null>(null);
  const [goal, setGoal] = useState('');
  const [reviews, setReviews] = useState<Review[]>([]);
  function saveReview(candidate: RepositoryOverview) {
    if (!project) return;
    setReviews(current => [{ id: crypto.randomUUID(), project, candidate, goal, createdAt: new Date().toISOString() }, ...current].slice(0, 20));
  }
  return <Context.Provider value={{ project, setProject, goal, setGoal, reviews, saveReview, removeReview: id => setReviews(current => current.filter(review => review.id !== id)) }}>{children}</Context.Provider>;
}
export function useWorkspace() {
  const context = useContext(Context);
  if (!context) throw new Error('WorkspaceProvider required');
  return context;
}
