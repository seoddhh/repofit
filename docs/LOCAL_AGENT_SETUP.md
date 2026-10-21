# Mac의 스킬 목록 연결

첫 구현 범위는 **프로젝트 한 개의 Codex·Claude Code 스킬 목록 조회와 사이트 표시**다. 분석, 설치, 기존 에이전트 대화 조작, 사용 이력 수집은 포함하지 않는다.

## 로컬에서 사용

Node.js 22.13 이상과 RepoFit 소스가 필요하다. 별도 연결 패키지는 아직 배포하지 않았다.

1. `npm ci` 후 `npm run build`를 실행한다.
2. 로컬 D1에 아직 적용하지 않은 SQL만 파일명 순서로 적용한다. 기존 테이블은 삭제하지 않는다. 처음 설치하는 경우 `drizzle/0000_tricky_paibok.sql`부터, 이번 기능을 추가하는 경우 아래 두 파일을 순서대로 적용한다.

   ```sh
   node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_shallow_medusa.sql
   node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0002_magenta_maestro.sql
   ```

3. `npm run dev`로 서버를 실행하고 `/agent`에서 로컬 테스트 로그인한다.
4. **Mac 연결**을 눌러 일회용 코드를 만든다. 조회할 프로젝트의 절대 경로를 입력한다.
5. RepoFit 소스 폴더의 터미널에서 화면의 명령을 실행한다. 예:

   ```sh
   npm run local-agent -- --site http://localhost:5173 --project /Users/me/Desktop/my-project
   ```

6. 터미널의 질문에 일회용 코드를 붙여넣는다. 사이트에 목록이 자동으로 나타난다. 연결 프로그램은 60초마다 새 목록을 전송하고 화면은 10초마다 수신 결과를 조회한다.

`Ctrl+C`로 프로그램을 종료한다. 기기 토큰은 디스크에 저장하지 않으므로 다시 실행할 때 새 연결 코드를 만든다. 사이트의 **연결 해제**는 저장 목록과 토큰을 삭제하고 다음 전송을 차단한다. 여러 프로젝트는 각각 별도 연결로 추가하고 화면에서 선택한다. 연결은 최대 10개, 기기 토큰은 30일, 미사용 코드는 10분 뒤 만료된다.

전송 없이 확인하려면:

```sh
npm run local-agent -- --project /Users/me/Desktop/my-project --inspect
```

`--once`는 한 번 전송한 뒤 종료한다. 실행 파일 `codex`, `claude`가 터미널 PATH에 있어야 한다. macOS 권한이나 샌드박스 때문에 실행이 막히면 해당 에이전트에 오류를 표시하며 빈 목록을 정상 조회로 보고하지 않는다.

## 호스팅된 사이트

웹 코드와 D1 마이그레이션을 함께 배포한다. 운영 사이트의 `/agent`에서 **Mac 연결**을 눌러 코드를 만들고 화면의 사이트 주소를 사용해 로컬 프로그램을 실행한다. 사이트는 기존 방문자 인증을 유지하고, 기기 전송은 사이트 로그인 쿠키 대신 연결 코드로 교환한 기기 토큰을 사용한다.

```sh
npm run local-agent -- --site https://repofit.fizzybean4.chatgpt.site --project /Users/me/Desktop/my-project
```

소유자 전용 Sites는 Dispatch가 앱의 기기 토큰을 검사하기 전에 서비스 접근 인증을 요구할 수 있다. 해당 사이트의 지원되는 서비스 접근 토큰을 사용자 로컬 환경변수에 두고 `--service-token-env REPOFIT_SITE_ACCESS_TOKEN`을 추가한다. 연결 프로그램은 이를 같은 사이트에만 `OAI-Sites-Authorization` 헤더로 전달한다. 토큰을 코드·DB·명령 인자·공유 문서에 넣지 않는다. 이 기능을 위해 사이트를 공개로 전환하지 않는다. 멀티 사용자 운영에 서비스 접근 경로를 제공할 수 없다면 별도 기기 API의 호스팅을 먼저 결정해야 한다. 운영 Dispatch 인증은 로컬 테스트 로그인으로 검증할 수 없다.

## 표시 상태와 범위

- **Codex / 에이전트 인식:** `codex app-server`를 별도 로컬 프로세스로 시작하고 `initialize` → `initialized` → `skills/list`(`cwds`, `forceReload`)만 호출한다. 모델 턴·분석·승인을 실행하지 않는다. 현재 열려 있는 데스크톱 대화와 CLI의 설정·플러그인 범위는 다를 수 있다. App Server는 실험적이므로 조회 실패를 화면에 표시한다.
- **Claude / 설정 확인:** 개인 `~/.claude/skills`, 프로젝트 `.claude/skills`, `/Library/Application Support/ClaudeCode/skills`, 설치 레지스트리에 있는 해당 프로젝트·개인 플러그인의 스킬을 읽는다. 기본 `skills/`와 플러그인 manifest의 추가 `skills` 경로를 지원한다. 개인·프로젝트·로컬·관리 설정의 `enabledPlugins`, `skillOverrides`, `strictPluginOnlyCustomization`을 반영한다. 플러그인 활성 설정이 없으면 인식 미확인으로 표시한다. 중복 이름은 시스템 → 개인 → 프로젝트 순서로 표시한다.
- Claude 내장 스킬, 구형 `.claude/commands`, 세션의 `--plugin-dir`·추가 디렉터리·일시적 설정, 중첩 프로젝트에서 동적으로 로딩된 스킬, MDM·원격 관리 정책·계정 동기화 상태는 완전히 재현하지 않는다. 따라서 Claude 목록은 런타임 검증으로 표시하지 않는다. 프로젝트 루트 폴더를 지정하는 사용을 기준으로 한다.
- 인증 파일·전체 홈 폴더·레포 소스·`.env`·대화 기록은 수집하지 않는다. 설정은 필요한 값만 사용하고 원문은 전송하지 않는다. SKILL.md 본문은 해시 계산에만 사용하며 사이트에는 이름·설명·범위·출처·상태·해시만 보낸다. 경로는 홈/프로젝트 기준으로 줄이고 프로젝트 절대 경로는 해시 식별자로 대체한다. 파일 출처의 이름·설명에 포함한 개인정보는 그대로 전달될 수 있으므로 공유 범위를 확인한다.
- 승인한 스킬 경로 밖으로 나가는 링크와 다른 프로젝트에만 설치한 플러그인은 제외한다. 스킬 목록은 에이전트별 최대 1,000개, 전송은 1MB, 파일은 256KB로 제한한다. 목록은 서버에서 소유자별로 분리하며 토큰·코드는 해시로만 저장한다. 원본 스킬은 변경하지 않는다.

## 검증

```sh
npm run typecheck
node scripts/verify-local-agent.mjs
node scripts/verify-agent.mjs
node scripts/verify-auth.mjs
npm run build
```

`verify-local-agent.mjs`는 실제 SQLite와 가짜 CLI 프로세스로 프로토콜, 코드 재사용·만료, 타 사용자 접근, 연결 해제, 경로 탈출, 설정·스킬 본문 비전송을 검증한다. 실제 Mac 목록은 `--inspect`, 전체 연결은 사이트의 연결 코드와 로컬 CLI로 별도 확인한다.
