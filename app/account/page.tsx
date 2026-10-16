import Link from 'next/link';
import { ArrowRight, Check, LogIn, LogOut, ShieldCheck, UserRound } from 'lucide-react';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { chatGPTSignInPath, chatGPTSignOutPath, safeRelativeReturnPath } from '@/lib/chatgpt-auth-paths';

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<{ return_to?: string }> }) {
  const user = await getChatGPTUser();
  const params = await searchParams;
  const returnTo = safeRelativeReturnPath(params.return_to ?? '/project');
  const localPreview = process.env.NODE_ENV !== 'production';
  return <>
    <div className="page-heading"><div><div className="eyebrow">계정과 연결</div><h1>ChatGPT 계정</h1><p>익숙한 계정으로 로그인하고, 연결 상태를 확인하세요.</p></div></div>
    <div className="account-layout">
      <section className="surface account-identity" aria-labelledby="account-title">
        <span className="account-symbol"><UserRound size={28} strokeWidth={1.5}/></span>
        <h2 id="account-title">{user ? user.displayName : 'ChatGPT로 시작하세요.'}</h2>
        <p>{user ? user.email : '별도의 비밀번호 없이 ChatGPT 계정으로 RepoFit에 로그인합니다.'}</p>
        {user && <span className="account-status"><Check size={14}/>{localPreview ? '로컬 테스트 계정' : 'ChatGPT 계정 인증됨'}</span>}
        {localPreview && <div className="auth-preview-note"><strong>현재는 로컬 미리보기입니다.</strong><p>아래 테스트 로그인은 화면 확인용 계정입니다. 실제 ChatGPT 인증은 배포된 chatgpt.site에서 진행됩니다.</p></div>}
        <div className="account-primary-actions">{user ? <><Link href={returnTo === '/account' ? '/project' : returnTo} className="primary-button">작업 공간으로 <ArrowRight size={16}/></Link><a href={chatGPTSignOutPath('/account')} target="_top" className="text-button"><LogOut size={15}/>{localPreview ? '테스트 로그아웃' : '로그아웃'}</a></> : <a href={chatGPTSignInPath(localPreview ? '/account' : returnTo)} target="_top" className="primary-button"><LogIn size={16}/>{localPreview ? '로컬 테스트 로그인' : 'ChatGPT로 계속하기'}</a>}</div>
      </section>
      <div className="account-information">
        <section className="surface"><div className="section-heading"><h2><ShieldCheck size={18}/> 계정 정보</h2></div><p>RepoFit은 Sites가 인증한 계정 식별자, 이메일과 표시 이름을 받습니다. 계정 식별자는 사용자 구분에, 이름과 이메일은 계정 표시에 사용합니다.</p><p>ChatGPT 비밀번호나 대화 기록은 받지 않습니다. 현재 프로젝트와 적용 검토는 이 탭에서만 보관됩니다.</p></section>
        <section className="surface"><div className="section-heading"><h2>사용자의 ChatGPT 플랜</h2><span className="subtle-badge">연결 준비 중</span></div><p>로그인과 AI 실행 권한은 별도입니다. 사용자 플랜으로 분석하는 기능은 이 배포 환경의 지원과 사용 동의를 확인한 뒤 제공됩니다.</p><p>프로젝트의 에이전트 검토와 내 에이전트의 스킬 탐색을 사용할 수 있습니다. 사용자가 쓰는 에이전트가 자신의 계정과 권한으로 검토하고, RepoFit은 결과를 표시합니다.</p></section>
      <Link href="/agent" className="secondary-button">에이전트에 추가할 스킬 찾기 <ArrowRight size={15}/></Link></div>
    </div>
  </>;
}
