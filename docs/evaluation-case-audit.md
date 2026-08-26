# 평가사례 사례별 감사

이 문서는 고정된 교육용 평가사례 35건을 하나씩 다시 실행한 결과다. 실제 Gemini를 호출하지 않는 데모 모드에서 원문 추출값, `status`, `evidenceText`, 평가 경고, 일반 규칙 경고를 함께 확인했다.

- 정상 사례: 원문값·상태가 정답과 일치하고 예상하지 않은 오류 경고가 없는지 확인
- 오류 사례: 오류가 포함된 원문값을 보존하면서 `needs_review` 또는 `null` 상태가 적절한지, 예상 경고만 재현되는지 확인
- 저화질 위탁검사: 문서 내용 자체의 오류가 아니라 영상 품질 때문에 모든 항목을 수동 확인으로 보류하는 별도 사례

`null`은 원문에 해당 값이 없는 경우만 사용한다. 원문 안의 값이 서로 충돌하거나 결과 형식이 불완전하면 발견한 값과 근거를 보존하고 `needs_review`로 표시한다.

| 사례 | 업무 | 의도한 상태 | 실제 점검 결과 | 판정 |
| --- | --- | --- | --- | --- |
| EVAL-GROSS-001 | 육안 소견 | 정상 | 추출 9/9; 확인 필요 없음; null 없음; 경고 없음 | 통과 |
| EVAL-GROSS-002 | 육안 소견 | 정상 | 추출 9/9; 확인 필요 없음; null 없음; 경고 없음 | 통과 |
| EVAL-GROSS-003 | 육안 소견 | 정상 | 추출 9/9; 확인 필요 없음; null 없음; 경고 없음 | 통과 |
| EVAL-GROSS-004 | 육안 소견 | 정상 | 추출 9/9; 확인 필요 없음; null 없음; 경고 없음 | 통과 |
| EVAL-GROSS-005 | 육안 소견 | MISSING_UNIT | 추출 8/9; 확인 필요 size; null 없음; 경고 MISSING_UNIT | 통과 |
| EVAL-GROSS-006 | 육안 소견 | LATERALITY_CONFLICT | 추출 7/9; 확인 필요 laterality, lesionLocation; null 없음; 경고 LATERALITY_CONFLICT | 통과 |
| EVAL-GROSS-007 | 육안 소견 | SPECIMEN_COUNT_MISMATCH | 추출 8/9; 확인 필요 count; null 없음; 경고 SPECIMEN_COUNT_MISMATCH | 통과 |
| EVAL-GROSS-008 | 육안 소견 | MISSING_FIELD | 추출 8/9; 확인 필요 없음; null cutSurface; 경고 MISSING_FIELD | 통과 |
| EVAL-GROSS-009 | 육안 소견 | MISSING_FIELD | 추출 8/9; 확인 필요 없음; null lesionLocation; 경고 MISSING_FIELD | 통과 |
| EVAL-GROSS-010 | 육안 소견 | BLOCK_COUNT_MISSING | 추출 8/9; 확인 필요 없음; null blockCount; 경고 BLOCK_COUNT_MISSING | 통과 |
| EVAL-PATH-001 | 병리 결과 | 정상 | 추출 15/17; 확인 필요 없음; null pathologicN, pathologicStage; 경고 없음 | 통과 |
| EVAL-PATH-002 | 병리 결과 | 정상 | 추출 15/17; 확인 필요 없음; null pathologicM, pathologicStage; 경고 없음 | 통과 |
| EVAL-PATH-003 | 병리 결과 | 정상 | 추출 15/17; 확인 필요 없음; null pathologicM, pathologicStage; 경고 없음 | 통과 |
| EVAL-PATH-004 | 병리 결과 | 정상 | 추출 15/17; 확인 필요 없음; null pathologicN, pathologicStage; 경고 없음 | 통과 |
| EVAL-PATH-005 | 병리 결과 | 정상 | 추출 14/17; 확인 필요 없음; null pathologicN, pathologicM, pathologicStage; 경고 없음 | 통과 |
| EVAL-PATH-006 | 병리 결과 | SOURCE_VALUE_MISMATCH | 추출 14/17; 확인 필요 diagnosis; null pathologicM, pathologicStage; 경고 SOURCE_VALUE_MISMATCH | 통과 |
| EVAL-PATH-007 | 병리 결과 | MISSING_UNIT | 추출 14/17; 확인 필요 tumorSize; null pathologicN, pathologicStage; 경고 MISSING_UNIT | 통과 |
| EVAL-PATH-008 | 병리 결과 | LATERALITY_CONFLICT | 추출 15/17; 확인 필요 laterality; null pathologicStage; 경고 LATERALITY_CONFLICT | 통과 |
| EVAL-PATH-009 | 병리 결과 | MARGIN_MISSING | 추출 14/17; 확인 필요 없음; null margin, pathologicM, pathologicStage; 경고 MARGIN_MISSING | 통과 |
| EVAL-PATH-010 | 병리 결과 | LYMPH_NODE_FRACTION_INCONSISTENCY | 추출 15/17; 확인 필요 lymphNodes; null pathologicStage; 경고 LYMPH_NODE_FRACTION_INCONSISTENCY | 통과 |
| EVAL-PATH-011 | 병리 결과 | PATHOLOGIC_T_MISMATCH | 추출 15/17; 확인 필요 pathologicT; null pathologicStage; 경고 PATHOLOGIC_T_MISMATCH | 통과 |
| EVAL-PATH-012 | 병리 결과 | PATHOLOGIC_N_MISMATCH | 추출 14/17; 확인 필요 pathologicN; null pathologicM, pathologicStage; 경고 PATHOLOGIC_N_MISMATCH | 통과 |
| EVAL-PATH-013 | 병리 결과 | VALUE_NOT_IN_SOURCE | 추출 14/17; 확인 필요 pathologicM; null pathologicN, pathologicStage; 경고 VALUE_NOT_IN_SOURCE | 통과 |
| EVAL-PATH-014 | 병리 결과 | SOURCE_VALUE_MISMATCH | 추출 15/17; 확인 필요 molecularPathology; null pathologicStage; 경고 SOURCE_VALUE_MISMATCH | 통과 |
| EVAL-PATH-015 | 병리 결과 | IMMUNOPATHOLOGY_RESULT_MISSING | 추출 15/17; 확인 필요 immunopathology; null pathologicStage; 경고 IMMUNOPATHOLOGY_RESULT_MISSING | 통과 |
| EVAL-OUT-001 | 위탁검사 | 정상 | 대조 match; 불일치 없음; 누락 없음; 경고 없음 | 통과 |
| EVAL-OUT-002 | 위탁검사 | 정상 내용·저화질 수동 확인 | 대조 needs_review; 불일치 없음; 누락 order_number, test_name, specimen, received_date, reported_date, amendment_status, result; 경고 없음 | 통과 |
| EVAL-OUT-003 | 위탁검사 | 정상 | 대조 match; 불일치 없음; 누락 없음; 경고 없음 | 통과 |
| EVAL-OUT-004 | 위탁검사 | ORDER_NUMBER_MISMATCH | 대조 mismatch; 불일치 order_number; 누락 없음; 경고 ORDER_NUMBER_MISMATCH | 통과 |
| EVAL-OUT-005 | 위탁검사 | TEST_NAME_MISMATCH | 대조 mismatch; 불일치 test_name; 누락 없음; 경고 TEST_NAME_MISMATCH | 통과 |
| EVAL-OUT-006 | 위탁검사 | SPECIMEN_MISMATCH | 대조 mismatch; 불일치 specimen; 누락 없음; 경고 SPECIMEN_MISMATCH | 통과 |
| EVAL-OUT-007 | 위탁검사 | AMENDMENT_STATUS_MISSING, DATE_MISMATCH | 대조 needs_review; 불일치 received_date; 누락 amendment_status; 경고 AMENDMENT_STATUS_MISSING, DATE_MISMATCH | 통과 |
| EVAL-OUT-008 | 위탁검사 | REPORT_DATE_MISSING | 대조 needs_review; 불일치 없음; 누락 reported_date; 경고 REPORT_DATE_MISSING | 통과 |
| EVAL-OUT-009 | 위탁검사 | SOURCE_VALUE_MISMATCH | 대조 mismatch; 불일치 result; 누락 없음; 경고 SOURCE_VALUE_MISMATCH | 통과 |
| EVAL-OUT-010 | 위탁검사 | MISSING_FIELD | 대조 needs_review; 불일치 없음; 누락 result; 경고 MISSING_FIELD | 통과 |

## 범위와 한계

- 이 감사는 프로젝트가 생성한 고정 가상 사례와 데모·규칙 엔진의 일관성을 검증한다.
- 실제 Gemini 35건 전체 평가나 의료적 정확도 평가는 수행하지 않았다.
- 병기 계산, 진단 확정, 치료 권고는 감사 범위에 포함하지 않는다.

