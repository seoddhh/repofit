# RepoFit UI 원칙

참고: [Apple Design](https://developer.apple.com/kr/design/), [Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/), [Layout](https://developer.apple.com/design/human-interface-guidelines/layout), [Typography](https://developer.apple.com/design/human-interface-guidelines/typography), [Materials](https://developer.apple.com/design/human-interface-guidelines/materials).

Apple HIG를 웹 작업 공간에 맞게 해석했습니다. 네이티브 Apple 컴포넌트나 Liquid Glass API를 사용한 앱은 아닙니다.

- 정보 계층: 탐색 → 프로젝트 이해 → 적용 검토. 화면마다 주요 행동 하나를 우선하며 홍보용 일러스트·영문 슬로건·장식용 수치 카드를 제거합니다.
- 일관성: 시스템 글꼴, 절제된 파랑, 회색 계층, 공통 간격과 둥근 모서리. 레포 목록, 프로젝트, 기록, 예시 보고서가 같은 규칙을 사용합니다.
- 소재와 깊이: 청회색·라벤더·민트의 확산광 배경 위에 사이드바·상단 툴바·검색 도구·모바일 내비게이션을 띄웁니다. 탐색 층에는 CSS glassmorphism의 흐림·채도·밝은 가장자리·부드러운 그림자를 사용합니다. 본문은 높은 불투명도의 표면, 코드와 입력에는 흰 표면을 사용해 가독성을 유지합니다.
- 삭제 확인: native dialog의 위치를 `inset: 0; margin: auto`로 명시하고 작은 화면의 최대 높이를 제한합니다. 취소에 초기 초점을 두고 Esc·취소 후 호출 버튼으로 초점을 돌려줍니다. 삭제는 별도의 붉은 동작으로 구분합니다.
- 적응형 배치: 넓은 화면은 사이드바와 콘텐츠·보조 문맥을 함께 표시하고 좁은 화면은 단일 열과 하단 탐색으로 전환합니다.
- 접근성: 실제 label, 키보드 focus, native dialog의 초점 경계, 텍스트 상태 안내, reduced-motion, reduced-transparency와 blur 미지원 대체 색상을 사용합니다.
- 서비스 목적: 트렌딩의 인기도를 적합도로 포장하지 않습니다. 내 레포 입력을 주요 동작으로 연결하고, 적용 경로의 근거·분석 범위·미확인 사항을 함께 보여줍니다.
- 사실성: 실제 GitHub 자료, 규칙 기반 검토, 이전 데모 보고서를 각각 명시합니다. AI 추론·소스 분석·실행 검증을 수행한 것처럼 표시하지 않습니다.
