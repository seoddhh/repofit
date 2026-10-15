import type { RepositoryOverview } from './repository-types';

export function integrationPlan(project: RepositoryOverview, candidate: RepositoryOverview) {
  const existing = candidate.packageName ? project.dependencies[candidate.packageName] : undefined;
  const text = `${candidate.id} ${candidate.description}`.toLowerCase();
  const kind = /query|fetch|http|api client/.test(text) ? 'data' : /component|design system|\bui\b/.test(text) ? 'ui' : /agent|\bai\b|llm|model/.test(text) ? 'ai' : 'tool';
  const patterns: Record<typeof kind, RegExp> = {
    data: /(^|\/)(hooks|services|api|lib)\/[^/]+\.(tsx?|jsx?|py)$/,
    ui: /(^|\/)(components|views|screens)\/[^/]+\.(tsx?|jsx?|vue|svelte)$/,
    ai: /(^|\/)(api|services|lib|server)\/[^/]+\.(tsx?|jsx?|py)$/,
    tool: /(^|\/)(package\.json|pyproject\.toml|Cargo\.toml|go\.mod|vite\.config\.[^/]+|README\.md)$/,
  };
  let paths = project.paths.filter(path => patterns[kind].test(path)).slice(0, 3);
  if (!paths.length) paths = project.paths.filter(path => /(^|\/)(package\.json|pyproject\.toml|Cargo\.toml|go\.mod|README\.md)$/.test(path)).slice(0, 3);
  const overlap = Object.keys(candidate.dependencies).filter(name => name in project.dependencies).slice(0, 8);
  return {
    existing,
    headline: existing ? '이미 사용하는 패키지입니다.' : '구조를 기준으로 적용 경계를 검토하세요.',
    description: existing ? `${candidate.packageName} ${existing}가 프로젝트 의존성에 있습니다. 추가 설치보다 현재 사용 위치와 업그레이드 필요성을 먼저 확인하세요.` : 'README와 루트 의존성, 파일 경로를 확인했습니다. 아래 경로는 적용 위치 후보이며, 소스 내부 동작과 버전 호환성은 아직 검증하지 않았습니다.',
    paths,
    overlap,
    steps: [
      { title: '필요한 역할부터 확인', body: `후보의 README에서 해결하는 문제와 실행 방식을 확인하세요. ${candidate.id}가 라이브러리인지, 별도 서비스인지, 개발 도구인지에 따라 도입 방식이 달라집니다.` },
      { title: existing ? '기존 사용 범위 점검' : '한 곳에서 작게 적용', body: existing ? '현재 의존성을 유지한 채 사용 중인 코드와 설정을 찾고, 필요한 기능이 이미 있는지 확인하세요.' : '아래 경로 후보의 실제 코드를 읽고 기존 역할과 겹치는지 확인하세요. 호환 버전과 실행 환경이 확인되면 한 기능에서 먼저 시도하세요.' },
      { title: '변경 전후 비교', body: '개선 목표에 해당하는 동작을 기존 구성과 비교하세요. 프로젝트의 빌드·테스트를 실행하고 오류 처리, 성능과 운영 부담을 확인한 뒤 적용 범위를 넓히세요.' },
    ],
  };
}
