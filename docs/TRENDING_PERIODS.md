# 트렌딩 기간별 수집과 해설 중복 방지

작성일: 2026-11-01 KST. 배포 전 로컬 변경을 설명하며 운영 반영과 예약 실행은 별도 검증합니다.

## 화면에 표시하는 저장소

| 버튼 | RepoFit 요청 | GitHub 원본 | 받은 스타 원문 |
| --- | --- | --- | --- |
| 오늘 | `/api/trending?since=daily` | [일간](https://github.com/trending?since=daily) | `stars today` |
| 이번 주 | `/api/trending?since=weekly` | [주간](https://github.com/trending?since=weekly) | `stars this week` |
| 이번 달 | `/api/trending?since=monthly` | [월간](https://github.com/trending?since=monthly) | `stars this month` |

버튼을 바꾸면 해당 기간의 GitHub Trending HTML을 기존 방식으로 수집합니다. GitHub가 각 페이지에 선정한 전체 언어 저장소 목록과 원본 순서를 그대로 사용합니다. RepoFit이 오늘 목록을 합산하거나 자체 기준으로 주간·월간 승격, 누적 스타 정렬, 별도 후보 선정을 하지 않습니다. 검색과 언어 필터는 선택한 목록 안에서만 작동합니다.

기간은 GitHub의 집계를 따릅니다. 한국 시간 월요일 또는 매월 1일을 경계로 직접 계산하지 않으며, GitHub의 내부 선정 공식이나 집계 경계를 단정하지 않습니다. 목록 길이는 고정하지 않습니다. `TrendingRepo.today`는 기존 호환용 이름이며 실제 값은 요청한 기간에 받은 스타 수입니다.

2026-11-01 01:56 KST 로컬 API 확인 예시:

| 기간 | 전체 수 | 원본 순서의 첫 3개 |
| --- | --- | --- |
| 오늘 | 14 | `thedotmack/claude-mem`, `mattpocock/skills`, `Donchitos/Claude-Code-Game-Studios` |
| 이번 주 | 15 | `Nutlope/hallmark`, `cloudflare/security-audit-skill`, `AgriciDaniel/claude-seo` |
| 이번 달 | 19 | `cloudflare/security-audit-skill`, `heygen-com/hyperframes`, `Nutlope/hallmark` |

당시 세 목록은 총 48회 등장, 고유 저장소 36개였습니다. 12회의 중복 등장은 해설 작업에서 제외합니다. 수와 이름은 당시 관측값이며 다음 수집 때 바뀔 수 있습니다. 같은 저장소가 여러 탭에 함께 표시되는 것은 정상입니다.

## 조회와 해설 예약

화면은 선택한 한 기간을 조회합니다. 브라우저·서버의 5분 캐시와 진행 중 요청은 기간마다 분리합니다. 전환 중 늦게 도착한 이전 요청은 현재 목록을 덮어쓰지 않습니다. 수집 실패 시 다른 기간의 캐시를 대신 표시하지 않습니다.

`get_editorial_queue({})`는 세 기간을 모두 수집한 뒤 `owner/repository`의 대소문자를 구분하지 않고 합칩니다. 해설은 저장소당 D1에 하나만 저장하며 세 탭에서 공유합니다. 중복 저장소의 수집 근거는 오늘, 이번 주, 이번 달 순서로 하나를 선택합니다. 주간·월간에만 있는 저장소도 대상이며 저장된 근거에 해당 기간을 표시합니다.

README 본문·SHA, 공식 릴리스, 설명, 언어, 라이선스, 일반 출처, 경고의 내용 지문을 비교합니다. 트렌딩 기간·출처 URL·순위·스타·수집 시각·날짜 변화는 재작성 조건에서 제외합니다. 목록에서 빠졌다 다시 등장해도 실제 자료가 같으면 기존 글을 유지합니다. 서로 다른 저장소는 각각 조사하고, 같은 저장소의 반복 등장만 제거합니다.

신규 또는 자료 변경 항목만 최대 3개씩 작성 큐로 보냅니다. 변경 없는 항목은 추가 검색·작성·게시를 생략하고 본문과 작성 시각을 유지합니다. 같은 근거의 게시 요청이 반복되어도 서버는 `unchanged: true`로 기존 결과를 반환합니다. 근거 확인은 저장소별 1시간 캐시를 사용하므로 그 사이의 변경은 다음 확인에서 감지될 수 있습니다.

응답의 `periods`는 기간별 원본 수·출처·수집 시각, `totalRepositories`는 중복 제거 후 저장소 수입니다. `dueRepositories`에는 미검사 후보와 실패 항목도 남으므로 모든 배치 후 `queue`가 비고 `dueRepositories: 0`, `failures: []`인지 확인해야 합니다. 한 기간이라도 목록 수집이 실패하거나 이전 자료라면 해당 호출은 게시 큐를 만들지 않습니다. 개별 저장소 수집 실패는 기존 글을 유지하고 `failures`로 보고합니다.

## 배포와 예약 상태

2026-11-01 Sites 조회에서 기존 **RepoFit 오픈소스 해설 자동 갱신** 예약은 매일 09:17 Asia/Seoul 일정으로 등록되어 있으나 일시중지 상태였습니다. 이 작업에서는 재개하거나 중복 예약을 만들지 않습니다. 클라우드 예약 본문 수정 계약을 현재 도구에서 확인하지 못해 원격 본문은 변경하지 않았습니다. [저장할 예약 지침](EDITORIAL_SCHEDULE_PROMPT.md)을 준비했으며 서버 지침과 중복 게시 방지는 기존 빈 객체 호출에도 적용됩니다.

배포 전 타입 검사·회귀 검사·빌드를 확인합니다. 배포 후 MCP 큐의 `changeDetection: source-content-v2`, 세 기간의 `periods`, 중복 제거 수를 확인해야 합니다. 운영 쓰기와 예약 재개는 이번 배포 전 문서 작업에 포함하지 않습니다. DB 스키마 변경이나 기존 해설 일괄 재작성은 필요하지 않습니다.
