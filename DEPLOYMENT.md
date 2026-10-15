# Sites 배포와 ChatGPT 로그인 검토

검토일: 2026-10-16 (한국 시간)

## 결론

RepoFit의 Vinext/Vite 앱과 서버 API는 ChatGPT Sites의 Cloudflare Workers 배포 구조에 맞습니다. `sites()` 빌드 통합, Worker 진입점과 배포 manifest를 유지합니다. Sites가 실제 사이트 주소를 발급하며, 별도의 gpt.site 도메인을 직접 등록하는 구조가 아닙니다.

Sites 프로젝트: `appgprj_6ad104133f7c8191832f78754beccb69`. 최초 검증 배포는 소유자만 접근하는 비공개 범위로 진행합니다. 공개 서비스로 전환할 때는 Sites의 사이트 접근 범위를 별도로 변경해야 합니다.

## 로그인 연결

- 플랫폼이 소유하는 `/signin-with-chatgpt` → 인증 → `/callback` → 원래 화면 흐름을 사용합니다. 별도 OAuth 클라이언트 시크릿이나 앱 자체 토큰 저장소를 만들지 않습니다.
- 일반 링크와 최상위 탐색을 사용하며 외부 반환 URL과 인증 경로로의 루프를 차단합니다. 프로젝트 후보 등 기존 쿼리는 보존합니다.
- Sites가 전달한 사용자 식별자·이메일·선택적 표시 이름을 서버에서 읽습니다. `/account`에서 실제 로그인 여부와 정보 사용 목적을 안내합니다.
- `/api/session`은 방문자 상태만 반환하고 캐시를 금지합니다. 사용자 식별자는 브라우저에 추가로 노출하지 않습니다. 로그인·계정 변경 시 탭의 작업 공간 상태가 재설정됩니다.
- 로컬 테스트 로그인은 실제 인증과 구분해 표시합니다. hosted 검증은 배포된 사이트의 실제 방문자 세션으로 진행해야 합니다. 서비스 우회 토큰을 사용한 요청은 방문자 인증 검증이 아닙니다.

## 사용자 ChatGPT 기능으로 AI 실행

제품 방향은 사용자의 ChatGPT 플랜과 동의로 AI 분석을 실행하는 것입니다. 사이트 로그인 자체가 모델 호출 권한이나 플랜 사용 토큰을 제공하지는 않습니다. 현재 Sites의 인증 헤더만으로 방문자 플랜 사용 가능 여부·잔여 사용량을 알 수 없습니다.

공식 문서의 open-source/local-hosted용 동적 OAuth 등록 흐름을 원격 Sites 앱에 그대로 적용하지 않습니다. 원격 호스팅 앱의 ChatGPT plan usage는 별도 참여 절차와 실제 승인된 연동 계약 확인이 필요합니다. 지원이 확인되기 전에는 개인 API 키 입력, 계정 쿠키 수집, 비공식 ChatGPT 엔드포인트 호출로 대체하지 않습니다. 현재 UI와 세션 API는 AI 플랜을 `not_connected`로 표시하고 실제 사용량을 소비하지 않습니다.

승인된 원격 앱 통합이 제공되면 로그인과 별도인 플랜 사용 동의, 서버 측 권한 검증, 토큰 만료·회수·한도 오류 처리, 분석 시작 시 사용자의 명시적 실행 동작을 연결합니다. 별도 대안으로 Sites MCP 도구를 사용자의 ChatGPT 대화에서 호출하는 구조가 있으나, 웹사이트 안에서 직접 에이전트를 실행하는 UX와는 다릅니다.

## 현재 기능과 남은 작업

공개 GitHub Trending과 공개 레포 조회, 규칙 기반 적용 계획은 서버에서 실행됩니다. 코드 실행과 AI 추론은 수행하지 않습니다. 기록은 현재 탭 메모리이며 영구 보관을 위해서는 사용자별 D1 저장과 소유권 검증을 추가해야 합니다.

배포 검증은 타입 검사, 빌드, 레포 조회 회귀 검사, 인증 반환 URL·미인증·세션 캐시 검사와 실제 브라우저 로그인 상태 확인으로 나눕니다. 빌드 성공과 비공개 배포 성공은 별도로 확인합니다.

## 근거

- [Sites: Sign in with ChatGPT](https://learn.chatgpt.com/docs/sites?surface=app)
- [Sign in with ChatGPT quickstart](https://developers.openai.com/siwc/quickstart)
- [ChatGPT plan usage: 원격 호스팅 앱의 별도 참여](https://developers.openai.com/siwc/token-sharing-open-source)
