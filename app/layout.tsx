import type { Metadata } from 'next';
import { getChatGPTUser } from './chatgpt-auth';
import { AppShell } from '@/components/app-shell';
import './globals.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'RepoFit — 내 레포에 맞는 오픈소스',
  description: '오늘 주목받는 오픈소스, 쓸모를 발견하는 가장 좋은 방법. RepoFit으로 탐색하고 분석하세요.',
  icons: { icon: '/favicon.svg' },
};
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getChatGPTUser();
  return <html lang="ko"><body><AppShell key={user?.userId ?? 'anonymous'} user={user} localPreview={process.env.NODE_ENV !== 'production'}>{children}</AppShell></body></html>;
}
