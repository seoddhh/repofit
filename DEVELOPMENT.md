# RepoFit 개발 안내

Apple HIG의 정보 계층·일관성 원칙을 바탕으로 만든 공개 레포 탐색·적용 검토 작업 공간입니다. GitHub Trending과 레포 조회는 실제 자료이며, 적용 계획은 규칙 기반 초기 검토입니다. 모델 추론과 계정별 서버 기록은 아직 연결하지 않았습니다.

## 실행

Node.js 22.13 이상(권장: 24 LTS)을 사용합니다.

```sh
npm ci
npm run dev
```

기본 주소는 `http://localhost:5173`입니다. GitHub와 GitHub API에 대한 서버 측 HTTPS 연결이 필요합니다. 별도 키 없이 공개 레포를 읽으며 GitHub의 비인증 요청 한도에 영향을 받습니다.

## 확인

```sh
npm run typecheck
npm run build
node scripts/verify-repositories.mjs
node scripts/verify-auth.mjs
node scripts/verify-agent.mjs
```

저장한 실제 GitHub Trending HTML을 추가로 검증하려면 `node scripts/verify-repositories.mjs /absolute/path/trending.html`을 실행합니다. 이 스크립트의 기본 검사는 네트워크 없이 실행됩니다.

화면 이동 변경은 `npm run build` 후 `npm start`의 프로덕션 서버에서도 검증합니다. 트렌딩 → 내 프로젝트 → 분석 기록 → 프로젝트 열기와 브라우저 뒤로 가기를 확인하고, 개선 목표와 현재 탭의 검토 기록이 유지되는지 확인합니다. `vite.config.ts`의 클라이언트 `preserveEntrySignatures: "strict"`는 Vinext의 지연 로드 라우터가 필요한 내보내기를 유지하도록 합니다. 이 설정이 없으면 빌드는 성공해도 배포 브라우저의 링크 클릭과 RSC 프리페치가 함수 누락 오류로 실패할 수 있습니다.

## 화면

- `/`: 실제 GitHub Trending Today. 원본 목록 순서를 순위로 사용합니다. 검색·언어 필터는 원래의 전체 언어 순위를 유지합니다. 수집 시각, 5분 캐시와 오래된 자료 상태를 표시합니다. 실패하면 가짜 순위로 대체하지 않습니다.
- `/project`: 내 공개 레포와 개선 목표 입력. 커밋 SHA를 고정해 메타데이터·README·루트 package.json·파일 경로를 조회합니다. 오픈소스 후보를 입력하거나 트렌딩에서 전달받아 경로 후보, 공통 의존성과 적용 검토 순서를 확인합니다.
- `/history`: 현재 탭의 적용 검토 기록을 다시 열거나 삭제합니다. 이전 localStorage 데모 기록이 있는 경우 별도 접힌 영역에서 보존합니다.
- `/analysis/[runId]`: 기존 UI 데모 보고서. 실제 데이터와 혼동하지 않도록 예시임을 표시합니다.
- `/account`: ChatGPT 계정 상태, 정보 사용 안내, 로그인·로그아웃. 로컬 테스트 인증과 배포된 Sites의 실제 인증을 구분합니다.
- `/agent`: 에이전트에 도입할 오픈소스 스킬 탐색·도입 검토 요청, 스킬 다운로드, 실행 요청 전달, 진행 상태와 구조화된 결과. 사이트의 GitHub API 사전 조회 없이 요청을 만들 수 있습니다.
- `/api/session`: Sites가 전달한 현재 방문자 인증 상태. `private, no-store`이며 AI 플랜 사용 권한과 별도로 응답합니다.

## 실제 조회 경계

`lib/github-server.ts`가 GitHub 자료 조회와 메모리 캐시, 응답 크기·시간 제한을 담당합니다. `lib/trending-parser.ts`는 HTML 파서로 Trending 목록을 읽습니다. `GET /api/trending`, `POST /api/repository`가 UI와 서버를 연결합니다. 레포 입력은 github.com의 owner/repository만 허용하며 임의 URL로 요청하지 않습니다.

README는 최대 64KB, 파일 경로는 최대 500개를 표시합니다. 루트와 얕은 경로를 먼저 보존하며 잘림·자료 조회 실패를 안내합니다. 민감한 이름의 파일 경로를 제외하고 파일 본문은 README와 루트 package.json만 읽습니다. 모노레포의 하위 패키지·다른 언어의 의존성·실제 소스 내부 동작은 분석하지 않습니다.

`lib/integration-plan.ts`는 확인한 경로와 루트 의존성에 기반한 초기 검토를 만듭니다. 후보의 루트 package.json 이름은 모노레포의 배포 패키지 이름과 다를 수 있습니다. 따라서 설치 명령, 확정적인 적합도나 버전 호환성은 생성하지 않습니다. 개선 목표는 검토 맥락으로 보관하며 모델로 의미 분석하지 않습니다.

프로젝트와 검토 결과는 React context의 현재 탭 메모리에 보관되며 새로고침하면 사라집니다. 적용 계획은 Markdown으로 다운로드할 수 있습니다. Sites 로그인은 연결했으며 추론 권한·사용자별 D1 기록은 후속 범위입니다. `.openai/hosting.json`의 저장소 binding은 미설정입니다. 배포와 사용자 플랜의 지원 경계는 `DEPLOYMENT.md`를 참고하세요.

## 사용자 에이전트 검토

`public/skills/repofit-review/SKILL.md`는 사용자가 설치할 검토 워크플로입니다. `lib/agent-review.ts`가 요청·결과 계약과 상태 전이를, `lib/agent-tools.ts`가 페이지 도구를 정의합니다. `AgentProvider`는 앱 셸에서 도구를 등록하고 계정 변경·페이지 종료 시 등록을 해제합니다. 지원하지 않는 브라우저에서도 요청 텍스트 다운로드와 결과 JSON 가져오기를 사용할 수 있습니다.

| 페이지 도구 | 동작 |
| --- | --- |
| `repofit_get_context` | 현재 선택한 요청 ID와 이 탭의 요청 목록 조회 |
| `repofit_get_task` | 고정된 대상·후보·목표, 현재 상태와 revision 조회 |
| `repofit_update_progress` | 실제 검토 시작·진행 또는 실패 보고 |
| `repofit_submit_review` | 판단·근거·변경 제안·검증 보고·한계를 결과 패널에 표시 |

요청 생성은 `queued`이며 에이전트 실행을 의미하지 않습니다. 사용자가 에이전트에 실행을 요청한 뒤 도구로 `running`을 보고하고 결과를 제출합니다. 변경 요청은 `expectedRevision`을 확인합니다. 취소·실패·완료된 작업의 후속 쓰기는 거부하며, 알 수 없는 요청을 새로 생성하지 않습니다. 수동 JSON 가져오기도 같은 결과 검증과 상태 전이를 사용합니다.

RepoFit 서버는 모델을 호출하지 않고 에이전트 토큰을 받지 않습니다. 도구는 로컬 파일을 읽거나 코드를 실행하지 않습니다. 사용자의 기존 에이전트가 허용된 범위에서 검토하며 결과는 에이전트가 작성한 내용으로 표시합니다. 초기 요청은 검토 전용이고 코드 변경·의존성 설치·테스트 실행을 자동 승인하지 않습니다. 요청과 결과는 현재 탭 메모리만 사용하며 서버 저장·새로고침 복원·다른 탭 동기화는 제공하지 않습니다.

WebMCP 검증은 지원되는 브라우저에서 도구를 실제로 발견하고, 요청 읽기 → 진행 보고 → 결과 제출 → 화면 반영을 확인해야 합니다. 이전 revision과 취소된 요청에 대한 쓰기 거부도 확인합니다. 요청은 purpose로 구분합니다. `project`는 `/project?mode=agent`에서 프로젝트와 후보를 비교하고, `skills`는 `/agent`에서 agentProfile과 관심 작업을 기준으로 스킬을 탐색합니다. skills의 currentSkills와 candidate는 선택 사항이며 결과에는 skillFit이 필수입니다. 두 화면은 해당 종류의 요청만 표시하고 기록의 링크도 각 화면으로 돌아갑니다. 자동 스킬 순위 수집·로컬 목록 자동 조회는 아직 제공하지 않습니다.

## 인증

Sites Dispatch가 `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`을 처리합니다. 이 경로를 앱 라우트로 구현하지 않습니다. 로그인·로그아웃은 `target="_top"`인 일반 링크로 이동하고, 안전한 상대 경로와 원래 쿼리를 `return_to`로 전달합니다. UI는 `lib/chatgpt-auth-paths.ts`, 서버는 `app/chatgpt-auth.ts`를 사용합니다.

사용자 정보는 서버의 `getChatGPTUser()`로만 읽습니다. 인증이 필요한 서버 작업은 `requireChatGPTUser()` 또는 API에서의 명시적인 미인증 거부를 적용해야 합니다. 미래의 저장 기록은 이메일이 아닌 Sites의 사이트별 사용자 식별자를 소유자 키로 사용해야 합니다. 현재 읽기 전용 공개 GitHub 조회는 로그인 여부와 무관합니다.

`npm run dev`의 Sites 플러그인은 루프백에서만 테스트 쿠키를 받고 테스트 사용자를 주입합니다. 외부 요청의 사용자 헤더는 제거하며, 실제 GPT 인증·AI 플랜 동의를 대신하지 않습니다. 배포 빌드에는 이 Vite 개발 서버 미들웨어가 포함되지 않습니다. 직접 노출한 임의 서버의 사용자 헤더를 인증 근거로 사용하면 안 됩니다.

## 디자인

`app/globals.css`에 색상, 시스템 글꼴, 표면, 글래스 소재의 공통 토큰을 정의합니다. 탐색 UI에는 반투명 소재·배경 흐림·밝은 테두리를 사용하고 자료·코드·보고서는 불투명한 표면에서 읽도록 구성했습니다. 모바일 하단 내비게이션, native dialog, 키보드 초점, 동작·투명도 줄이기와 backdrop-filter 미지원 대체 표면을 제공합니다.

근거와 화면 구성 원칙은 `DESIGN.md`를 참고하세요.
## 오픈소스 해설 개발

트렌딩 상세의 가운데 해설은 `components/repository-explanation.tsx`, 공개 조회는 `/api/brief`, 소유자 전용 수집·게시는 `/mcp`에서 제공합니다. D1의 `editorial_sources`는 다음 작성을 위한 자료, `repository_briefs`는 게시한 설명과 그 설명이 사용한 자료를 보관합니다. 루트 `.openai/hosting.json`의 DB 바인딩과 `drizzle/` 마이그레이션을 유지하세요. 방문자 프로젝트 기록과는 별개입니다.

런타임 `REPOFIT_EDITOR_EMAIL`은 Sites가 인증한 소유자의 이메일과 비교하는 서버 전용 설정입니다. 미설정 상태와 다른 사용자에게는 게시를 허용하지 않습니다. 예약 실행은 [EDITORIAL.md](./EDITORIAL.md)를 따릅니다. 브라우저의 소유자 세션에서도 같은 서버 도구를 WebMCP로 사용할 수 있습니다. 이 브리지는 초기 게시와 수동 재시도용이며 무인 실행은 호스팅된 MCP 연결을 사용합니다.

검증: `node scripts/verify-briefs.mjs`는 SQLite에서 수집·게시·재조회, 자료 지문과 출처 제한, 갱신 실패 시 기존 근거 보존, 배치 재시도, 오래된 설명, 소유자 권한을 확인합니다. 기존 `verify-repositories.mjs`, `verify-auth.mjs`, `verify-agent.mjs`도 회귀 검사에 포함합니다.

