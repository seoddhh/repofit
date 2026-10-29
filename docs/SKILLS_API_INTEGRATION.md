# skills.sh 연동

2026-10-27 확장: `/agent` 활용 보고서도 이 검색 API를 사용합니다. 추천 전에 별도로 GitHub 고정 원본을 확인하고, 내부 규칙과 로컬 Codex 해석을 분리합니다. [판단 로직과 실행 방법](./AGENT_COACH_IMPLEMENTATION.md)을 참고하세요. 아래의 검색 UI 자체는 이름·출처·설치 집계만 표시합니다.

확인: 2026-10-21 KST. `/skills`는 에이전트용 스킬 검색 전용 메뉴다. 기존 GitHub Trending의 수집·순위·스킬 저장소 노출은 유지한다. `/agent`는 내 구성과 도입 검토 화면이다.

## 확인한 API

- [문서화된 v1 API](https://skills.sh/docs/api): 목록·trending/hot·검색·상세 파일·감사 결과를 제공하지만 Vercel OIDC 인증이 필요하다. 인증 없는 `GET /api/v1/skills?view=trending&per_page=2`는 실제 `401 authentication_required`였다. 현재 Cloudflare 기반 사이트에 Vercel의 단기 토큰을 복사해 고정하거나 다른 서비스의 자격 증명을 재사용하지 않는다.
- [공식 CLI의 검색 코드](https://github.com/vercel-labs/skills/blob/main/src/find.ts): `GET https://skills.sh/api/search?q=...&limit=20`을 인증 없이 호출한다. 같은 요청으로 `200`과 실제 스킬 목록을 확인했다. 이번 구현은 이 공개 검색 API만 사용한다. v1 인증을 우회하거나 사이트 HTML을 수집하지 않는다.
- [이용 조건](https://skills.sh/terms)은 합리적 API 사용과 자체 캐시를 허용하며 한도 우회를 금지한다. 공개 검색은 버전 고정 계약이 아니므로 응답 변경·접근 제한을 오류로 처리한다.

## 표시와 한계

이름·출처·설치 집계·원문 링크를 표시한다. 공개 검색 응답에는 설명, 에이전트별 호환성, 파일 본문, 감사 결과가 없으므로 생성하거나 검증됐다고 표시하지 않는다. 자세한 설명과 설치 방법은 해당 skills.sh 원문으로 연결한다. 설치나 로컬 파일 변경은 실행하지 않는다.

첫 화면의 `agent`와 주제 버튼은 검색어다. 검색 응답 순서를 유지하고 전역 순위·트렌딩·추천 순위로 표시하지 않는다. 최대 20개를 표시하며 전체 카탈로그 탐색이나 페이지네이션을 약속하지 않는다. 설치 집계는 사용 횟수나 안전성·품질·내 에이전트 적합성 지표가 아니다.

## 서버 경계

브라우저 → `/api/skills?q=...` → 고정 `https://skills.sh/api/search` 순서로 요청한다. 로그인 쿠키·로컬 스킬 목록·레포 내용은 외부 API로 보내지 않고 입력한 검색어만 전달한다. 검색어는 2~100자, 호출당 20개, 응답 256KB, 시간 15초, 동시 외부 요청 8개로 제한한다. 동일 검색은 합치며 서버 인스턴스 메모리에 최대 100개 결과를 60초 캐시한다. 다른 Worker 인스턴스·재시작 사이의 공유 캐시는 아니다.

조회 실패 시 같은 검색어의 1시간 이내 자료만 이전 자료로 표시한다. 자료가 없으면 오류와 원문 링크를 보여 준다. 429는 Retry-After를 반영하고 자동 재시도하지 않는다. 반환된 출처를 검증해 skills.sh와 GitHub의 링크를 직접 생성한다. 응답의 임의 URL은 따라가지 않으며 설명을 HTML로 실행하지 않는다.

검증: `node scripts/verify-skills.mjs`, `npm run typecheck`, `npm run build`. 실제 연결은 `/api/skills?q=react`와 `/skills` 화면에서 별도 확인한다.
