'use client';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Compass, FolderGit2, Clock3, ArrowUpRight, ChevronDown, LogIn, LogOut, X, GitBranch, Bot, Puzzle } from 'lucide-react';
import { DemoProvider, useDemo } from './demo-provider';
import { WorkspaceProvider, useWorkspace } from './workspace-provider';
import { AgentProvider } from './agent-provider';
import { EditorialBridge } from './editorial-bridge';
import { GithubIcon } from './github-icon';
import type { ChatGPTUser } from '@/app/chatgpt-auth';
import { chatGPTSignInPath, chatGPTSignOutPath } from '@/lib/chatgpt-auth-paths';

type ShellProps = { children: React.ReactNode; user: ChatGPTUser | null; localPreview: boolean };
export function AppShell({ children, user, localPreview }: ShellProps) {
  return <WorkspaceProvider><DemoProvider><AgentProvider><Shell user={user} localPreview={localPreview}>{children}</Shell></AgentProvider></DemoProvider></WorkspaceProvider>;
}
function Shell({ children, user, localPreview }: ShellProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const returnTo = `${pathname}${query ? `?${query}` : ''}`;
  const { notice, notify } = useDemo();
  const { project } = useWorkspace();
  const navigation = [
    { href: '/', title: '트렌딩', icon: Compass, active: pathname === '/' || pathname.startsWith('/explore') },
    { href: '/skills', title: '스킬', icon: Puzzle, active: pathname === '/skills' },
    { href: '/project', title: '내 프로젝트', icon: FolderGit2, active: pathname === '/project' },
    { href: '/agent', title: '내 에이전트', icon: Bot, active: pathname === '/agent' },
    { href: '/history', title: '분석 기록', icon: Clock3, active: pathname === '/history' || pathname.startsWith('/analysis') },
  ];
  return <div className="app-shell">
    {user && <EditorialBridge/>}
    <a href="#main-content" className="skip-link">본문으로 건너뛰기</a>
    <aside className="sidebar">
      <Link href="/" className="brand" aria-label="RepoFit 홈"><span className="brand-symbol"><GitBranch size={21} strokeWidth={2.2}/></span>RepoFit</Link>
      <div className="nav-caption">작업 공간</div>
      <nav aria-label="주 메뉴">{navigation.map(item => <Link key={item.href} href={item.href} className={`nav-item ${item.active ? 'active' : ''}`} aria-current={item.active ? 'page' : undefined}><item.icon size={19} strokeWidth={1.7}/><span>{item.title}</span></Link>)}</nav>
      <div className="sidebar-project"><div className="nav-caption">내 프로젝트</div>{project ? <Link href="/project" className="sidebar-repo"><FolderGit2 size={17}/><span>{project.id.split('/')[1]}<small>{project.id.split('/')[0]}</small></span></Link> : <Link href="/project" className="sidebar-add"><span>＋</span> 프로젝트 추가</Link>}</div>
      <div className="sidebar-bottom"><a href="https://github.com/trending?since=daily" target="_blank" rel="noreferrer" className="sidebar-source"><GithubIcon size={15}/> GitHub Trending <ArrowUpRight size={13}/></a></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div className="breadcrumb"><span>작업 공간</span><span className="slash">/</span><strong>{pathname === '/account' ? 'ChatGPT 계정' : pathname.startsWith('/explore') ? '오픈소스 해설' : navigation.find(item => item.active)?.title ?? '분석 보고서'}</strong></div><div className="topbar-actions">{localPreview && <span className="preview-label">로컬 미리보기</span>}{user ? <details className="account-menu"><summary aria-label="ChatGPT 계정 메뉴"><span className="avatar">{user.displayName.slice(0, 1).toUpperCase()}</span><ChevronDown size={13}/></summary><div className="account-popover"><strong>{user.displayName}</strong><span>{user.email}</span><p>{localPreview ? '로컬 테스트 계정' : 'ChatGPT 계정으로 로그인됨'}</p><Link href="/account">계정 및 AI 연결 <ArrowUpRight size={15}/></Link><a href={chatGPTSignOutPath(returnTo)} target="_top"><LogOut size={15}/> {localPreview ? '테스트 로그아웃' : '로그아웃'}</a></div></details> : localPreview ? <Link className="login-button" href={`/account?return_to=${encodeURIComponent(returnTo)}`}><LogIn size={15}/> ChatGPT 로그인</Link> : <a className="login-button" href={chatGPTSignInPath(returnTo)} target="_top"><LogIn size={15}/> ChatGPT로 계속하기</a>}</div></header>
      <main id="main-content" className="main-content">{children}</main>
    </div>
    <nav className="mobile-nav" aria-label="모바일 주 메뉴">{navigation.map(item => <Link key={item.href} href={item.href} aria-current={item.active ? 'page' : undefined} className={item.active ? 'active' : ''}><item.icon size={21} strokeWidth={1.7}/><span>{item.title}</span></Link>)}</nav>
    {notice && <div className="toast" role="status">{notice}<button className="icon-button" aria-label="알림 닫기" onClick={() => notify('')}><X size={16}/></button></div>}
  </div>;
}
