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
```

저장한 실제 GitHub Trending HTML을 추가로 검증하려면 `node scripts/verify-repositories.mjs /absolute/path/trending.html`을 실행합니다. 이 스크립트의 기본 검사는 네트워크 없이 실행됩니다.

## 화면

- `/`: 실제 GitHub Trending Today. 원본 목록 순서를 순위로 사용합니다. 검색·언어 필터는 원래의 전체 언어 순위를 유지합니다. 수집 시각, 5분 캐시와 오래된 자료 상태를 표시합니다. 실패하면 가짜 순위로 대체하지 않습니다.
- `/project`: 내 공개 레포와 개선 목표 입력. 커밋 SHA를 고정해 메타데이터·README·루트 package.json·파일 경로를 조회합니다. 오픈소스 후보를 입력하거나 트렌딩에서 전달받아 경로 후보, 공통 의존성과 적용 검토 순서를 확인합니다.
- `/history`: 현재 탭의 적용 검토 기록을 다시 열거나 삭제합니다. 이전 localStorage 데모 기록이 있는 경우 별도 접힌 영역에서 보존합니다.
- `/analysis/[runId]`: 기존 UI 데모 보고서. 실제 데이터와 혼동하지 않도록 예시임을 표시합니다.
- `/account`: ChatGPT 계정 상태, 정보 사용 안내, 로그인·로그아웃. 로컬 테스트 인증과 배포된 Sites의 실제 인증을 구분합니다.
- `/api/session`: Sites가 전달한 현재 방문자 인증 상태. `private, no-store`이며 AI 플랜 사용 권한과 별도로 응답합니다.

## 실제 조회 경계

`lib/github-server.ts`가 GitHub 자료 조회와 메모리 캐시, 응답 크기·시간 제한을 담당합니다. `lib/trending-parser.ts`는 HTML 파서로 Trending 목록을 읽습니다. `GET /api/trending`, `POST /api/repository`가 UI와 서버를 연결합니다. 레포 입력은 github.com의 owner/repository만 허용하며 임의 URL로 요청하지 않습니다.

README는 최대 64KB, 파일 경로는 최대 500개를 표시합니다. 루트와 얕은 경로를 먼저 보존하며 잘림·자료 조회 실패를 안내합니다. 민감한 이름의 파일 경로를 제외하고 파일 본문은 README와 루트 package.json만 읽습니다. 모노레포의 하위 패키지·다른 언어의 의존성·실제 소스 내부 동작은 분석하지 않습니다.

`lib/integration-plan.ts`는 확인한 경로와 루트 의존성에 기반한 초기 검토를 만듭니다. 후보의 루트 package.json 이름은 모노레포의 배포 패키지 이름과 다를 수 있습니다. 따라서 설치 명령, 확정적인 적합도나 버전 호환성은 생성하지 않습니다. 개선 목표는 검토 맥락으로 보관하며 모델로 의미 분석하지 않습니다.

프로젝트와 검토 결과는 React context의 현재 탭 메모리에 보관되며 새로고침하면 사라집니다. 적용 계획은 Markdown으로 다운로드할 수 있습니다. Sites 로그인은 연결했으며 추론 권한·사용자별 D1 기록은 후속 범위입니다. `.openai/hosting.json`의 저장소 binding은 미설정입니다. 배포와 사용자 플랜의 지원 경계는 `DEPLOYMENT.md`를 참고하세요.

## 인증

Sites Dispatch가 `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`을 처리합니다. 이 경로를 앱 라우트로 구현하지 않습니다. 로그인·로그아웃은 `target="_top"`인 일반 링크로 이동하고, 안전한 상대 경로와 원래 쿼리를 `return_to`로 전달합니다. UI는 `lib/chatgpt-auth-paths.ts`, 서버는 `app/chatgpt-auth.ts`를 사용합니다.

사용자 정보는 서버의 `getChatGPTUser()`로만 읽습니다. 인증이 필요한 서버 작업은 `requireChatGPTUser()` 또는 API에서의 명시적인 미인증 거부를 적용해야 합니다. 미래의 저장 기록은 이메일이 아닌 Sites의 사이트별 사용자 식별자를 소유자 키로 사용해야 합니다. 현재 읽기 전용 공개 GitHub 조회는 로그인 여부와 무관합니다.

`npm run dev`의 Sites 플러그인은 루프백에서만 테스트 쿠키를 받고 테스트 사용자를 주입합니다. 외부 요청의 사용자 헤더는 제거하며, 실제 GPT 인증·AI 플랜 동의를 대신하지 않습니다. 배포 빌드에는 이 Vite 개발 서버 미들웨어가 포함되지 않습니다. 직접 노출한 임의 서버의 사용자 헤더를 인증 근거로 사용하면 안 됩니다.

## 디자인

`app/globals.css`에 색상, 시스템 글꼴, 표면, 글래스 소재의 공통 토큰을 정의합니다. 탐색 UI에는 반투명 소재·배경 흐림·밝은 테두리를 사용하고 자료·코드·보고서는 불투명한 표면에서 읽도록 구성했습니다. 모바일 하단 내비게이션, native dialog, 키보드 초점, 동작·투명도 줄이기와 backdrop-filter 미지원 대체 표면을 제공합니다.

근거와 화면 구성 원칙은 `DESIGN.md`를 참고하세요.
