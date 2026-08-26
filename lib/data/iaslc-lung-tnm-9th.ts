export const IASLC_LUNG_TNM_9TH_FORMAT_REFERENCE = {
  id: "iaslc-lung-tnm-9th-format-reference",
  name: "IASLC/AJCC 폐암 TNM 9판 교육용 입력 형식 참조",
  provider: "International Association for the Study of Lung Cancer (IASLC)",
  sourceUrl: "https://www.iaslc.org/science-research/scientific-projects/iaslc-staging-project-lung-cancer-thymic-tumors-and",
  educationalSummaryUrl: "https://radiologyassistant.nl/chest/lung-cancer/tnm-classification-8th-edition-1",
  referenceDate: "IASLC 9판 2025-01 적용, 서비스 참조 확인 2026-08-24",
  sourceType: "reference_metadata" as const,
  allowedExamples: {
    pathologicT: "pT1c, pT2a, pTx",
    pathologicN: "pN0, pN1, pN2a, pN2b, pNx",
    pathologicM: "pM0, pM1a, pM1c1, pM1c2, pMx",
    pathologicStage: "원문에 적힌 Stage 또는 pT/pN/pM 문자열",
  },
  scope: "원문에 명시된 pT, pN, pM, Stage 문자열의 허용 형식과 누락·일치 여부만 교육용으로 검수합니다.",
  excluded: "종양 크기·침범·림프절·전이 설명에서 pT/pN/pM 또는 최종 Stage를 산출·조합·보완하지 않습니다.",
} as const;
