export const NCC_LUNG_SUMMARY = {
  source: {
    provider: "국립암센터",
    title: "암 임상 라이브러리 합성데이터 (폐암)",
    archiveDate: "2025-01-07",
    guideDate: "2023-07-01",
    archiveSha256: "89A1350DD6A9560803389ACF7779058A719270716D026AC49CECF5B398B96AAC",
    workbookSha256: "234A35E8483CA9DEFDF441DD45D57648E8E5A80F989F6ECE2444A568A3F321E6",
  },
  records: {
    total: 15_000,
    train: 10_000,
    test: 5_000,
    workbookColumns: 34,
    dataColumnsExcludingSequence: 33,
    blankCells: 0,
  },
  histologyFlags: [
    { label: "Adenocarcinoma", count: 9_823 },
    { label: "Squamous cell", count: 4_949 },
    { label: "Large cell", count: 3_458 },
  ],
  completeness: {
    egfrKnown: 5_979,
    egfrNotApplicable: 9_021,
    histologyUnflagged: 2_615,
  },
  limitations: {
    immunopathology: "면역병리 검사 종류 컬럼이 없습니다.",
    linkage: "외과병리·분자병리 테이블 간 연계키가 없습니다.",
    sourceText: "육안소견·병리 결과문 같은 자유 텍스트가 없습니다.",
    variableCount: "설명서는 폐암 32개 변수로 안내하지만 실제 파일은 순번 제외 33개 변수입니다.",
  },
} as const;

export const NCC_LUNG_DERIVED = {
  egfrKnownRate: NCC_LUNG_SUMMARY.completeness.egfrKnown / NCC_LUNG_SUMMARY.records.total,
  egfrNotApplicableRate: NCC_LUNG_SUMMARY.completeness.egfrNotApplicable / NCC_LUNG_SUMMARY.records.total,
  histologyUnflaggedRate: NCC_LUNG_SUMMARY.completeness.histologyUnflagged / NCC_LUNG_SUMMARY.records.total,
} as const;
