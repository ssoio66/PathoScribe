# 가상 병리 업무 테이블 컬럼 정의서

## 공통 규칙

- 모든 기본키와 연결키는 교육용 가상 ID다.
- `source_record_id`는 합성 XLSX의 시트 구분과 `순번(No)`를 결합한 행 식별자이며 환자 ID가 아니다.
- `source_type = public_synthetic`: 국립암센터 공개 폐암 합성데이터 XLSX의 실제 컬럼에서 직접 매핑했다.
- `source_type = generated_demo`: 원본에 없는 업무 흐름을 시제품에서 모사하기 위해 생성했다.
- `source_type = public_aggregate`: 공공데이터 API의 집계 응답이다. 이 연결 테이블의 개별 사례 값으로는 사용하지 않는다.
- `source_type = reference_metadata`: 메타정보 또는 용어사전 항목이다. 이 연결 테이블의 개별 사례 값으로는 사용하지 않는다.
- 모든 `review_status`는 담당자 원문 대조가 필요하며 자동 확정을 허용하지 않는다.

## pathology_orders

| 컬럼 | 형식 | 키 | 출처 | 정의 |
|---|---|---|---|---|
| `order_id` | string | PK | 생성 | `ORD-LUNG-2026-00001` 형식의 가상 검사 의뢰 ID |
| `source_record_id` | string |  | 생성 | 합성 원본 행 연결 ID |
| `order_category` | string |  | 생성 | 가상 병리 검사 흐름 구분 |
| `requested_workflow` | string |  | 생성 | 전사·검수 시제품 업무명 |
| `workflow_sequence` | integer |  | 생성 | 화면 정렬용 가상 순서 |
| `review_status` | string |  | 생성 | 담당자 대조 필요 상태 |
| `source_type` | enum |  | 생성 | 항상 `generated_demo` |

## specimens

| 컬럼 | 형식 | 키 | 출처 | 정의 |
|---|---|---|---|---|
| `specimen_id` | string | PK | 생성 | `SPC-LUNG-2026-00001` 형식의 가상 검체 ID |
| `order_id` | string | FK | 생성 | `pathology_orders.order_id` |
| `source_record_id` | string |  | 생성 | 합성 원본 행 연결 ID |
| `organ` | string |  | 생성 | 폐 합성데이터 범위의 가상 장기 값 |
| `specimen_category` | string |  | 생성 | 가상 절제/생검 검체 구분 |
| `laterality` | string |  | 생성 | 원본에 없어 확인 필요 |
| `specimen_count` | integer |  | 생성 | 가상 검체 개수 |
| `source_type` | enum |  | 생성 | 항상 `generated_demo` |

## gross_descriptions

| 컬럼 | 형식 | 키 | 출처 | 정의 |
|---|---|---|---|---|
| `gross_description_id` | string | PK | 생성 | `GRS-LUNG-2026-00001` 형식의 가상 육안 소견 ID |
| `order_id` | string | FK | 생성 | `pathology_orders.order_id` |
| `specimen_id` | string | FK | 생성 | `specimens.specimen_id` |
| `source_record_id` | string |  | 생성 | 합성 원본 행 연결 ID |
| `gross_text` | string |  | 생성 | 검수 화면 시험용 가상 원문 |
| `lesion_location` | string |  | 생성 | 원본 미제공으로 확인 필요 |
| `margin_description` | string |  | 생성 | 원본 미제공으로 확인 필요 |
| `review_status` | string |  | 생성 | 담당자 대조 필요 상태 |
| `source_type` | enum |  | 생성 | 항상 `generated_demo` |

## blocks

| 컬럼 | 형식 | 키 | 출처 | 정의 |
|---|---|---|---|---|
| `block_id` | string | PK | 생성 | `BLK-LUNG-2026-00001-A1` 형식의 가상 블록 ID |
| `order_id` | string | FK | 생성 | `pathology_orders.order_id` |
| `specimen_id` | string | FK | 생성 | `specimens.specimen_id` |
| `source_record_id` | string |  | 생성 | 합성 원본 행 연결 ID |
| `block_label` | string |  | 생성 | 가상 블록 라벨 A1/B1 |
| `material_type` | string |  | 생성 | 가상 FFPE 블록 |
| `purpose` | string |  | 생성 | 일반/부가검사 시제품 구분 |
| `source_type` | enum |  | 생성 | 항상 `generated_demo` |

## pathology_reports

| 컬럼 | 형식 | 키 | 출처 | 정의 |
|---|---|---|---|---|
| `report_id` | string | PK | 생성 | `RPT-LUNG-2026-00001` 형식의 가상 병리 보고서 ID |
| `order_id` | string | FK | 생성 | `pathology_orders.order_id` |
| `specimen_id` | string | FK | 생성 | `specimens.specimen_id` |
| `source_record_id` | string |  | 생성 | 합성 원본 행 연결 ID |
| `histology_source_flags` | string[] |  | 직접 매핑 | 값이 1인 실제 조직형 플래그명 배열 |
| `histology_flag_status` | string |  | 직접 매핑 규칙 | 없음/단일/복수 플래그 검수 상태 |
| `stage_t_source_flags` | string[] |  | 직접 매핑 | 값이 1인 실제 T 플래그명 배열 |
| `stage_n_source_flags` | string[] |  | 직접 매핑 | 값이 1인 실제 N 플래그명 배열 |
| `stage_m_source_flags` | string[] |  | 직접 매핑 | 값이 1인 실제 M 플래그명 배열 |
| `stage_flag_status` | object |  | 직접 매핑 규칙 | T/N/M별 없음/단일/복수 상태 |
| `operation_source_value` | integer |  | 직접 매핑 | 실제 `수술여부(Operation)` 0/1 값 |
| `report_status` | string |  | 생성 | 담당자 대조 필요 상태 |
| `source_type` | enum |  | 직접 매핑 | `public_synthetic` |

## immunohistochemistry_results

| 컬럼 | 형식 | 키 | 출처 | 정의 |
|---|---|---|---|---|
| `ihc_result_id` | string | PK | 생성 | `IHC-LUNG-2026-00001` 형식의 가상 면역병리 결과 ID |
| `order_id` | string | FK | 생성 | 가상 검사 ID |
| `specimen_id` | string | FK | 생성 | 가상 검체 ID |
| `block_id` | string | FK | 생성 | 가상 블록 ID |
| `report_id` | string | FK | 생성 | 가상 보고서 ID |
| `source_record_id` | string |  | 생성 | 합성 원본 행 연결 ID |
| `marker_name` | string |  | 생성 | 시제품용 가상 표지자명 |
| `result_value` | string |  | 생성 | 시제품용 가상 결과 값 |
| `interpretation` | null |  | 생성 | 자동 판정 금지로 비워 둠 |
| `review_status` | string |  | 생성 | 담당자 대조 필요 상태 |
| `source_type` | enum |  | 생성 | `generated_demo` |

## molecular_pathology_results

| 컬럼 | 형식 | 키 | 출처 | 정의 |
|---|---|---|---|---|
| `molecular_result_id` | string | PK | 생성 | `MOL-LUNG-2026-00001` 형식의 가상 분자병리 결과 ID |
| `order_id` | string | FK | 생성 | 가상 검사 ID |
| `specimen_id` | string | FK | 생성 | 가상 검체 ID |
| `block_id` | string | FK | 생성 | 가상 블록 ID |
| `report_id` | string | FK | 생성 | 가상 보고서 ID |
| `source_record_id` | string |  | 생성 | 합성 원본 행 연결 ID |
| `test_name` | string |  | 직접 매핑 | 실제 헤더가 지칭하는 EGFR 발견 여부 검사 |
| `egfr_detection_source_value` | integer |  | 직접 매핑 | 실제 0/1/99 값 |
| `detected` | boolean/null |  | 직접 매핑 규칙 | 1=true, 0=false, 99=null |
| `result_status` | string |  | 직접 매핑 규칙 | 유효 값 또는 해당사항 없음 |
| `review_status` | string |  | 생성 | 담당자 대조 필요 상태 |
| `source_type` | enum |  | 직접 매핑 | `public_synthetic` |

## outsourced_test_results

| 컬럼 | 형식 | 키 | 출처 | 정의 |
|---|---|---|---|---|
| `outsourced_id` | string |  | 생성 | `EXT-LUNG-2026-00001` 형식의 가상 위탁검사 ID |
| `outsourced_result_id` | string | PK | 생성 | `outsourced_id`와 같은 값으로 둔 호환용 결과 ID |
| `external_request_id` | string |  | 생성 | 가상 외부 의뢰 ID |
| `order_id` | string | FK | 생성 | 가상 검사 ID |
| `internal_order_id` | string |  | 생성 | 내부 의뢰정보 대조용 가상 검사 ID |
| `specimen_id` | string | FK | 생성 | 가상 검체 ID |
| `internal_specimen_id` | string |  | 생성 | 내부 의뢰정보 대조용 가상 검체 ID |
| `block_id` | string | FK | 생성 | 가상 블록 ID |
| `report_id` | string | FK | 생성 | 가상 보고서 ID |
| `source_record_id` | string |  | 생성 | 합성 원본 행 연결 ID |
| `organization` | string |  | 생성 | 실제 기관이 아닌 가상 검사기관 |
| `test_name` | string |  | 생성 | 시제품용 가상 위탁검사명 |
| `result_value` | string |  | 생성 | 시제품용 가상 결과 값 |
| `interpretation` | null |  | 생성 | 자동 판정 금지로 비워 둠 |
| `review_status` | string |  | 생성 | 담당자 대조 필요 상태 |
| `source_type` | enum |  | 생성 | `generated_demo` |

## transcription_reviews

| 컬럼 | 형식 | 키 | 출처 | 정의 |
|---|---|---|---|---|
| `review_id` | string | PK | 생성 | `REV-LUNG-2026-00001` 형식의 가상 검수 ID |
| `order_id` | string | FK | 생성 | 가상 검사 ID |
| `specimen_id` | string | FK | 생성 | 가상 검체 ID |
| `gross_description_id` | string | FK | 생성 | 가상 육안 소견 ID |
| `report_id` | string | FK | 생성 | 가상 보고서 ID |
| `ihc_result_id` | string | FK | 생성 | 가상 면역병리 결과 ID |
| `molecular_result_id` | string | FK | 생성 | 가상 분자병리 결과 ID |
| `outsourced_id` | string | FK | 생성 | 가상 위탁검사 ID |
| `source_record_id` | string |  | 생성 | 합성 원본 행 연결 ID |
| `reviewer_role` | string |  | 생성 | 보건의료정보관리사 중심 데모 역할 |
| `review_step` | string |  | 생성 | 화면 타임라인의 검수 완료 단계 |
| `review_status` | string |  | 생성 | 담당자 원문 대조 후 교육용 확정 상태 |
| `confirmed_value_policy` | string |  | 생성 | 원문·AI 추출값·담당자 확정값 비교 정책 |
| `issue_count` | integer |  | 생성 | 플래그 상태 기반 데모 이슈 수 |
| `source_type` | enum |  | 생성 | `generated_demo` |
