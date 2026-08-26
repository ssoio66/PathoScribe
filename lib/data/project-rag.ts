export type ProjectRagEntry = {
  id: string;
  title: string;
  subtitle: string | null;
  definition: string;
  source: {
    provider: string;
    collection: string;
    sourcePage: string | null;
    sourceFile: string;
    sourceRecordId: string;
    asOf: string;
  };
};

// These entries are intentionally small, auditable excerpts for the prototype RAG.
// They describe product rules and educational workflow constraints; they are not clinical guidance.
export const PROJECT_RAG_ENTRIES: ProjectRagEntry[] = [
  {
    id: "project-definition",
    title: "PathoScribe 서비스 정의",
    subtitle: "문제·기능·범위",
    definition: "PathoScribe는 육안 소견, 병리 판독 결과, 위탁검사 결과의 원문과 구조화 결과를 비교해 누락·불일치 가능성을 검수하는 교육용 업무지원 시제품이다. 진단, 예후 예측, 치료 권고, 병리 판독 대체 기능은 제공하지 않는다.",
    source: {
      provider: "PathoScribe 서비스",
      collection: "서비스 소개 및 범위",
      sourcePage: null,
      sourceFile: "README.md",
      sourceRecordId: "project-definition",
      asOf: "2026-08-24",
    },
  },
  {
    id: "input-format-review",
    title: "병리 입력 형식 검수 지침",
    subtitle: "원문·AI·담당자 3단 비교",
    definition: "원문에 없는 항목은 null 또는 확인 필요로 표시한다. 숫자·단위·좌우·검체 수·검사 결과 형식은 원문과 입력값을 비교해 불일치를 표시하며, 담당자가 직접 수정한 값은 AI 추출값과 별도로 표시한다.",
    source: {
      provider: "PathoScribe 서비스",
      collection: "교육용 입력 형식 지침",
      sourcePage: null,
      sourceFile: "README.md",
      sourceRecordId: "input-format-review",
      asOf: "2026-08-24",
    },
  },
  {
    id: "workflow-education",
    title: "교육용 병리업무 흐름",
    subtitle: "검사 의뢰부터 검수 완료까지",
    definition: "가상 사례는 검사 의뢰, 검체 접수, 육안 소견, 블록, 병리 결과, 면역병리, 분자병리, 위탁검사, 검수 완료 순서의 타임라인으로 연결한다. 연결 ID는 모두 시제품용 가상 ID이며 실제 병원 시스템의 권한이나 기록을 의미하지 않는다.",
    source: {
      provider: "PathoScribe 서비스",
      collection: "교육용 병리업무 흐름",
      sourcePage: null,
      sourceFile: "docs/pathology-workflow-data-model.md",
      sourceRecordId: "workflow-education",
      asOf: "2026-08-24",
    },
  },
  {
    id: "error-examples",
    title: "교육용 오류 사례",
    subtitle: "누락·불일치·확인 필요",
    definition: "오류 사례는 필수 항목 누락, 숫자·단위 불일치, 좌우 부위 불일치, 검사번호·검체·날짜·결과 불일치, 촬영 상태 불량에 따른 확인 필요로 분류한다. 사례는 개인정보 없는 가상 자료이며 실제 환자 오류율을 나타내지 않는다.",
    source: {
      provider: "PathoScribe 서비스",
      collection: "교육용 오류 사례 fixture",
      sourcePage: null,
      sourceFile: "data/fixtures/outsourced-test/referral-fixtures.json",
      sourceRecordId: "error-examples",
      asOf: "2026-08-24",
    },
  },
  {
    id: "ihc-ttf1-format",
    title: "TTF-1 면역병리 입력 형식",
    subtitle: "서비스 교육용 마커 참고",
    definition: "TTF-1은 이 시제품에서 면역병리 입력 형식 예시로만 안내한다. 입력 형식은 TTF-1: positive/negative 또는 TTF-1: 양성/음성으로 기록하며, 개별 검사 결과나 진단을 자동으로 판단하지 않는다.",
    source: {
      provider: "PathoScribe 서비스",
      collection: "서비스 자체 교육 자료",
      sourcePage: null,
      sourceFile: "components/pathoscribe-app.tsx",
      sourceRecordId: "ihc-ttf1-format",
      asOf: "2026-08-24",
    },
  },
  {
    id: "ihc-pdl1-format",
    title: "PD-L1 면역병리 입력 형식",
    subtitle: "서비스 교육용 마커 참고",
    definition: "PD-L1은 이 시제품에서 면역병리 입력 형식 예시로만 안내한다. 원문에 TPS 비율이 명시된 경우에만 PD-L1 TPS: 0-100% 형식으로 기록하며, 개별 검사 결과나 치료 판단을 자동으로 생성하지 않는다.",
    source: {
      provider: "PathoScribe 서비스",
      collection: "서비스 자체 교육 자료",
      sourcePage: null,
      sourceFile: "components/pathoscribe-app.tsx",
      sourceRecordId: "ihc-pdl1-format",
      asOf: "2026-08-24",
    },
  },
  {
    id: "ai-safety-policy",
    title: "AI 안전정책",
    subtitle: "근거·확인·확정 제한",
    definition: "Gemini는 원문에 명시된 값만 추출하고, 원문에 없는 값은 null로 둔다. 각 값에는 원문 근거와 신뢰도 또는 확인 상태를 붙인다. 병기·진단·치료를 추론하지 않으며, 사용자가 원문을 확인하기 전 AI 결과를 자동 확정하거나 저장하지 않는다.",
    source: {
      provider: "PathoScribe 서비스",
      collection: "AI 안전정책",
      sourcePage: null,
      sourceFile: "app/api/analyze/route.ts",
      sourceRecordId: "ai-safety-policy",
      asOf: "2026-08-24",
    },
  },
  {
    id: "stage-review-scope",
    title: "AJCC·TNM 입력 검수 범위",
    subtitle: "병리의사 최종 판정",
    definition: "pT, pN, pM, Stage는 원문에 실제로 적힌 토큰의 허용 형식과 누락 여부만 검수한다. T·N·M 조합으로 병기를 계산하거나 최종 병기를 산출하지 않으며, 최종 병기 판정은 병리의사가 수행한다.",
    source: {
      provider: "PathoScribe 서비스",
      collection: "병기 입력 검수 범위",
      sourcePage: null,
      sourceFile: "lib/stage-review.ts",
      sourceRecordId: "stage-review-scope",
      asOf: "2026-08-24",
    },
  },
];
