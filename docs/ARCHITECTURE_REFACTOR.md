# 아키텍처 리팩토링

## 분석과 변경 계획 (2026-11-03)

React 19·TypeScript·App Router 관례의 Vinext/Vite 앱이며 Cloudflare Worker와 D1을 사용한다. `app/layout.tsx` → `AppShell` → 화면별 context와 페이지가 브라우저 실행 경로이고, `app/api/**/route.ts`와 `app/mcp/route.ts`가 서버 진입점이다. 로컬 CLI는 `scripts/local-agent.mjs`, 호스팅 진입점은 `build/sites-worker.ts`다.

기존 `app/`, `db/`, `drizzle/`, 빌드·배포 스크립트는 역할이 명확하다. 반면 `lib/`와 `components/`의 평면 구조에는 저장소 탐색, 해설, 스킬, 검토 요청, 로컬 연결, 코칭, 활용 분석, 데모가 섞여 있다. 같은 기능을 고치려면 두 디렉터리에서 파일을 찾아야 한다.

확인한 구조 문제:

- 코칭·활용 분석이 HTTP 오류를 쓰려고 로컬 기기 저장 모듈을 가져온다.
- 기기·코칭·활용 분석 저장 모듈에 같은 24바이트 토큰 생성과 SHA-256 해시가 중복된다.
- 보고서 다운로드가 다른 기능의 전체 화면 모듈에 의존한다.
- 스킬 원본 근거 타입이 코칭에 있어 스킬 조회가 상위 소비 기능을 참조한다.
- 회귀 검증에서 TS 임시 컴파일 코드가 반복되고 평면 파일 경로를 가정한다.

### 변경 단위와 경계

1. `features/` 아래 실제 도메인별로 UI·타입·서버 파일을 모은다. 작은 파일에 계층이나 barrel 파일을 추가하지 않는다. 도메인 내부는 상대 import, 도메인 외부는 명시적인 파일 참조를 유지한다.
2. 오류·토큰 처리·텍스트 다운로드만 공통 모듈로 추출한다. 스킬 근거 타입은 스킬 도메인이 소유한다.
3. 기존 검증의 기대값은 유지하고 실제 디렉터리 구조를 보존하는 임시 컴파일 도구를 공유한다.
4. 타입·검증·lint·프로덕션 빌드와 참조·순환 의존성을 확인한다.

유지하는 영역: 모든 URL과 API 응답, UI와 상태 전이, 인증, DB 테이블 및 마이그레이션, 환경 변수, 정적 스킬과 JSON 스키마, 배포 설정, CLI 경로와 프로토콜. 운영 DB·배포·원격 push는 수행하지 않는다.

### 변경 전 검증

- `npm run typecheck`: 통과.
- `scripts/verify-*.mjs` 10개: 전부 통과. SQLite 임시 DB로 마이그레이션·소유권·lease·취소·데이터 호환성 확인 포함.
- `npm run lint`: 기존 오류 11개, 경고 9개. React effect/purity, 임시 산출물 `outputs/`, 검증 스크립트의 `module` 변수 및 미사용 변수 경고가 있다. 무관한 UI 상태 처리는 이번 구조 변경에서 다시 작성하지 않는다.

## 삭제 및 보존 원칙

단순 검색 결과만으로 삭제하지 않는다. 파일 기반 라우트, MCP/WebMCP 도구, 원격 기기 요청, 공개 정적 스킬, CLI와 빌드 파일을 진입점으로 함께 확인한다. 기존 기능 파일은 삭제하지 않고 이동한다. 원래 위치에서 제거되는 코드는 공통 구현으로 완전히 대체되는 중복 정의뿐이다.

`skills-server.ts`와 `skill-source.ts`는 현재 저장 카탈로그 흐름에서 직접 호출되지 않지만 과거 공개 검색·원본 확인의 계약 및 검증이 남아 있어 보존한다. `/analysis/[runId]`의 데모, 과거 localStorage 기록, 설문 모드, 연결·MCP 호환 경로도 명시적 진입점이 있어 유지한다. `components/ui/`는 레지스트리 제공 코드이고 동적 사용 가능성이 있으므로 그대로 둔다. `examples/`, 로컬 생성물 `outputs/`·`work/`, 배포 지원 코드도 삭제하지 않는다.

## 최종 구조와 책임

```text
app/                 # 페이지·API·MCP와 인증 진입점 (기존 URL 유지)
features/
  repositories/      # 저장소 조회·트렌딩·프로젝트 검토·탭 상태
  editorial/         # 공개 해설·근거 수집·소유자 WebMCP 브리지
  skills/            # 스킬 검색·카탈로그·공개 원문 파싱·근거 타입
  agent-review/      # 탭 기반 검토 요청·상태 전이·WebMCP·수동 전달
  local-agent/       # 기기 연결·토큰 인증·스킬 목록
  coach/             # 설문·규칙 기반 코칭·로컬 보고서 작업·사례 요약
  usage/             # 기록 기반 활용 분석·보고서·MCP·로컬 작업
  demo/              # 예시 데이터·이전 localStorage 기록·데모 보고서
components/          # 앱 셸·분석 기록·공유 콘텐츠 패널·모달 훅
  ui/                # 기존 레지스트리 컴포넌트
lib/                 # 기능 중립 도구·인증 경로·커넥터 런타임
  service-error.ts   # HTTP 상태를 가진 서비스 오류, DB 의존성 없음
  server-secrets.ts  # 기기·작업 lease 토큰 생성 및 SHA-256
  download-text.ts   # 브라우저 텍스트 다운로드
scripts/test-support/
  compile-fixture.mjs # 실제 폴더 구조를 보존하는 검증용 TS 컴파일
db/                  # 공통 D1 접근·스키마
drizzle/             # 기존 마이그레이션 이력 (변경 없음)
```

각 기능은 UI·타입·서버 코드를 같은 디렉터리에 둔다. Client 컴포넌트의 `'use client'` 경계와 서버 파일 분리를 유지하며, 서버 코드를 클라이언트로 끌어들이는 통합 barrel은 만들지 않았다. 공통 도구는 기능 저장 모듈을 import하지 않는다. 해설과 스킬은 저장소 조회를 재사용하고, 코칭·활용 분석은 스킬 카탈로그와 로컬 연결 기능을 참조한다. DB 스키마의 도메인 참조는 기존과 동일하게 `import type`뿐이며 런타임 순환을 만들지 않는다.

### 이동한 파일 43개

파일명은 유지했다. 아래 각 행의 파일을 모두 `features/<기능>/`로 옮겼다.

| 기능 | 기존 `lib/` 파일 | 기존 `components/` 파일 |
| --- | --- | --- |
| repositories | repository-types.ts, github-server.ts, trending-parser.ts, trending-client.ts, integration-plan.ts | dashboard.tsx, project-workspace.tsx, workspace-provider.tsx |
| editorial | brief-types.ts, brief-evidence.ts, brief-store.ts | repository-explanation.tsx, editorial-bridge.tsx |
| skills | catalog-types.ts, catalog-store.ts, skills-types.ts, skills-server.ts, skill-source.ts, skills-public.mjs | skills-catalog.tsx |
| agent-review | agent-review.ts, agent-tools.ts | agent-provider.tsx, agent-workspace.tsx |
| local-agent | local-agent-types.ts, local-agent-store.ts, local-agent-http.ts | local-agent-inventory.tsx |
| coach | coach-types.ts, coach-rules.ts, coach-server.ts, coach-store.ts | agent-coach.tsx |
| usage | usage-types.ts, usage-store.ts, usage-mcp.ts | usage-analysis.tsx, usage-report.tsx |
| demo | fixtures.ts, demo-agent.ts | demo-provider.tsx, analysis.tsx, repo-detail.tsx |

모든 소비 import, DB의 타입 참조, 검증 및 카탈로그 생성 스크립트, 개발 문서와 관련 설계 문서의 경로를 함께 수정했다. Alias·빌드·라우팅 설정을 변경할 필요는 없었다.

### 통합 및 의존성 개선

- 기기·코칭·활용 분석의 토큰 생성 3개와 해시 구현 3개를 `lib/server-secrets.ts`의 두 함수로 통합했다. 기존 24바이트 난수 → 48자리 소문자 hex, SHA-256 → 64자리 hex 형식과 인코딩을 유지했다. 발급 토큰의 저장값을 Node crypto 결과와 비교하는 회귀 검증 2개를 추가했다.
- `LocalAgentError` 정의를 기능 중립적인 `ServiceError`로 옮기고 모든 throw·catch를 함께 수정했다. 메시지·기본 상태 400·응답 상태·응답 본문은 유지했다. 다른 서비스가 오류 클래스만 사용하려고 기기 저장 모듈을 로드하지 않는다.
- `AgentWorkspace`의 `downloadText`를 `lib/download-text.ts`로 옮겨 코칭·활용 보고서가 다른 화면 컴포넌트에 의존하지 않게 했다. Blob 생성·파일명·MIME·URL 해제 시점은 동일하다.
- `SkillSource` 타입은 스킬 도메인으로 옮겼다. 스킬 조회가 소비자인 코칭 타입에 의존하던 방향을 바로잡았다. 저장 데이터 구조는 바뀌지 않는다.
- 8개 검증 스크립트에서 중복된 임시 TS 컴파일을 공유했다. 실제 상대 경로를 그대로 실행하고 `@/`와 기존 플랫폼 mock만 임시 경로로 바꾼다. 기존 검증의 assertion과 기대값은 모두 보존했다. 나머지 2개 VM 기반 검증은 유지했다.

### 삭제 내역

기능 파일·공개 API·테스트·라이브러리는 삭제하지 않았다. 위 43개 파일의 원래 경로는 이동으로 없어졌으며 실제 구현은 새 위치에 보존했다. 중복 토큰/해시 정의와 기존 오류 클래스·다운로드 함수·스킬 근거 타입의 원래 정의, 검증 스크립트의 중복 컴파일 코드는 위 공통 구현으로 완전히 대체했다. 이번 이동으로 미사용이 된 import만 제거했다. 불확실성으로 보존한 항목은 앞의 보존 원칙에 기록했다.

## 최종 검증

| 검증 | 결과 |
| --- | --- |
| `npm run typecheck` | 통과 |
| `npm run build` | 변경 전·후 모두 통과. 클라이언트·RSC·Worker 빌드 완료 |
| `for check in scripts/verify-*.mjs; do node "$check" || exit; done` | 10개 모두 통과 |
| `npm run lint` | 변경 전과 동일한 기존 오류 11개·경고 9개. 새 진단 없음 |
| TS AST로 로컬 정적·동적 import와 export 참조 검사 | 191개 모듈, 누락 경로 0개, 런타임·타입 포함 순환 참조 모두 0개 |
| 이동 전·후 import를 제외한 코드 비교 | 공통 구현 추출과 오류/함수명 변경 외 동작 코드 동일 |
| `git diff --check` | 통과 |
| 로컬 프로덕션 브라우저 | 프로젝트 → 에이전트 → 스킬 이동, 300개 로딩, 상세 모달 열기·닫기, 프로젝트 이동 후 뒤로 가기 통과. 콘솔 오류 없음 |

기존 회귀 검증에는 URL·캐시·원본 순위, 인증·소유권·동의, 기기 토큰·일회용 코드, 작업 lease·취소·revision 충돌, MCP·WebMCP 계약, 공개 해설과 300개 카탈로그, 보고서 렌더링, 이전 형식 보고서와 SQLite 마이그레이션 보존이 포함된다. 프로덕션 smoke test는 `/private/tmp/repofit-refactor-smoke-state`의 새 로컬 D1에만 기존 마이그레이션을 적용했다. 저장소의 기존 `.wrangler` 데이터와 운영 DB에는 접근하거나 변경하지 않았다.

### 검증 한계와 남은 위험

- 실제 Sites 로그인·운영 DB·호스팅된 MCP·외부 GitHub/skills.sh 실시간 연결·물리 기기 Codex 실행은 재검증하지 않았다. 해당 경로의 자동 검사는 mock/임시 SQLite를 사용한다.
- 기존 React effect/purity lint 오류와 일부 경고는 남아 있다. 기능·상태 동작을 바꾸는 수정은 이번 구조 변경에 섞지 않았다. `outputs/brief-types-validation.cjs`의 기존 lint 오류도 해당 파일을 삭제하거나 숨기지 않고 그대로 보고한다.
- 프로젝트 화면이 과거 데모와 탭 기반 검토를 함께 다루는 기존 결합은 보존했다. 새 저장/실행 계층을 추가하거나 상태 모델을 전면 교체하지 않았다.
- Vinext가 일부 페이지를 `Unknown`으로 분류한다는 기존 빌드 안내는 변경 전·후 동일하다. 프로덕션 브라우저에서 링크 및 뒤로 가기를 별도로 검증했다.

## 평가

기능 관련 파일을 한곳에서 찾을 수 있고, 공통 오류·토큰·다운로드 처리의 소유자가 분명해졌다. 스킬 근거 타입의 의존성 방향과 화면 간 불필요한 참조를 개선했다. 실제 중복 구현을 줄이되 작은 파일을 추가 계층으로 쪼개지 않았으며 의존성 추가도 없다. API·DB·UI 정책과 실행 결과는 기존 검증으로 확인한 범위에서 유지된다. 사용 여부를 확정할 수 없는 호환성·데모·지원 코드는 보존했다. 배포·원격 push는 수행하지 않았다.
