# 추적 가능한 평가사례

기준일: 2026-08-26

## 생성 결과

| 사례 유형 | 정상 | 오류 포함 | 합계 |
| --- | ---: | ---: | ---: |
| 육안 소견 | 4 | 6 | 10 |
| 병리 결과 | 5 | 10 | 15 |
| 위탁검사 결과 | 3 | 7 | 10 |
| 합계 | 12 | 23 | 35 |

평가사례는 `data/evaluation/evaluation-cases.json`에 저장한다. 각 사례의 `sourceRowId`는 서로 다르며 모두 원본 XLSX의 테스트 시트 행을 가리킨다. 실제 환자·검체·보고서 ID가 아니라 공개 합성데이터 행을 추적하기 위한 프로젝트 식별자이다.

## 실제 XLSX 확인 결과

원본 ZIP `data/raw/ncc-lung-synthetic-20250107.zip` 내부에는 XLSX가 1개 있다.

| 시트명 | 실제 범위 | 데이터 행 | 평가 사용 |
| --- | --- | ---: | --- |
| `Adjusted_synlung_trainset` | `A1:AH10001` | 10,000 | 원본 구조 확인, 평가사례에는 사용하지 않음 |
| `Adjusted_synlung_test` | `A1:AH5001` | 5,000 | 35개 고유 행 선택 |

실제 헤더는 A부터 AH까지 34개이다.

| 열 | 실제 원본 헤더 |
| --- | --- |
| A | `순번(No)` |
| B | `진단시연령(AGE)` |
| C-E | `조직학적진단명 코드 설명(Adenocarcinoma)`, `조직학적진단명 코드 설명(Large cell carcinoma)`, `조직학적진단명 코드 설명(Squamous cell carcinoma)` |
| F-P | `병기STAGE(TX)`, `병기STAGE(T0)`, `병기STAGE(T1)`, `병기STAGE(T1a)`, `병기STAGE(T1b)`, `병기STAGE(T1c)`, `병기STAGE(T2)`, `병기STAGE(T2a)`, `병기STAGE(T2b)`, `병기STAGE(T3)`, `병기STAGE(T4)` |
| Q-S | `병기STAGE(N1)`, `병기STAGE(N2)`, `병기STAGE(N3)` |
| T-V | `병기STAGE(M1a)`, `병기STAGE(M1b)`, `병기STAGE(M1c)` |
| W | `음주종류(Type of Drink)` |
| X | `흡연여부(Smoke)` |
| Y-Z | `신장값(Height)`, `체중측정값(Weight)` |
| AA-AB | `FEV 검사 값(FEV1_FVC_P)`, `DLCO 검사 값(DLCO_VA_P)` |
| AC | `EGFR mutation 발견 여부(EGFR mutation Detection)` |
| AD | `수술여부(Operation)` |
| AE-AF | `항암치료여부(Chemotherapy)`, `방사선치료여부(Radiation Therapy)` |
| AG | `사망여부(Death)` |
| AH | `암진단후생존일수(Survival period)` |

원본 헤더가 하나라도 달라지면 생성기는 임의 매핑하지 않고 실패한다.

## 원본값과 생성값 분리

각 사례는 다음 구조로 provenance를 보존한다.

- `sourceFields`: 조직학 3개, T 11개, N 3개, M 3개, EGFR, 수술 여부 등 22개 원본 셀의 헤더·셀 주소·원시값을 `public_synthetic`으로 저장한다.
- `generatedFields`: 자유서술 문장, 장기·검체·좌우·크기·절제연·림프절 수, 위탁기관·날짜·의뢰번호 등 원본에 없는 값만 `generated_demo`로 저장한다.
- `groundTruth.sourceContext`: 원본 행의 활성 조직학/T/N/M 플래그, EGFR 0/1, 수술 여부 0/1을 구조화해 보존한다.
- `groundTruth.referenceFields`: 원본 구조화 값과 문장 템플릿의 의도한 기준값을 저장한다.
- `groundTruth.expectedExtraction`: 오류를 주입한 뒤 `inputText`에 실제로 존재하는 추출 정답을 저장한다. 근거가 없는 값은 `null`이다.
- `expectedReview`: 저화질 문서처럼 값 오류와 별개로 수동 대조가 필요한 사례를 표시한다. 현재 `EVAL-OUT-002`만 `low_quality_document`로 분류한다.

생성기는 `evaluation-fixtures-v1.1.3`의 고정 행 목록과 고정 템플릿만 사용하며 난수 함수를 사용하지 않는다. `v1.1.3`은 오류 원문에 실제로 존재하는 좌우 충돌 표현과 결과가 빠진 면역병리 검사 표현을 `null`로 지우지 않고 `needs_review`로 보존하도록 교정한 버전이다. 실제로 문구가 생략된 필드만 `null`로 유지한다. 기존 35개 `caseId`와 원본 행 선택은 유지한다.

조직학·T/N/M 플래그와 EGFR 값은 원본에서 직접 가져오지만 한글 진단명, `p` 접두사, `Detected/Not detected` 표시는 선언된 변환 규칙을 거친다. 이 변환은 진단 또는 병기 산출이 아니라 입력 문자열을 만들기 위한 표시 변환이다. 최종 Stage는 원본에 없으므로 모든 병리 결과 평가사례에서 `null`로 유지한다.

## 원본에 없는 값

원본 XLSX에는 자유서술 육안 소견, 종양 크기, 좌우, 절단면, 병변 위치, 블록 수, 절제연, 림프절 개수, 면역병리 결과, 위탁검사 기관·의뢰번호·검체·날짜·참고사항이 없다. 이 값들은 원본값으로 주장하지 않고 모두 `generated_demo`로 표시한다.

## 오류 사례 범위

- 육안 소견: 단위 누락, 좌우 불일치, 검체 수 불일치, 절단면 누락, 병변 위치 누락, 블록 수 누락
- 병리 결과: 진단 문자열 불일치, 단위 누락, 좌우 불일치, 절제연 누락, 림프절 분자·분모 모순, pT·pN 불일치, 원본 근거 없는 pM, EGFR 불일치, 면역병리 결과 누락
- 위탁검사: 의뢰번호·검사명·검체·접수일 불일치, 보고일 누락, 수정 보고서 상태 누락, EGFR 결과 불일치, 결과 누락

오류 사례 화면에서는 원문 추출 정답과 깨끗한 기준값을 구분한다. 예를 들어 `EVAL-GROSS-009`는 입력 원문에 병변 위치가 없으므로 추출 정답은 `null`이지만, 오류 검수 기준값은 `중엽 말초`이다. 따라서 AI가 `null`을 반환하면 원문 추출은 일치하고, 병변 위치 누락은 별도 오류로 탐지된다.

## 생성과 검증

```powershell
npm.cmd run data:generate:evaluation
npm.cmd run data:test:evaluation
npm.cmd run test:case-audit
```

검증기는 다음을 확인한다.

- 사례 35건과 유형별 정상·오류 분포
- `caseId`와 `sourceRowId` 중복
- 원본 2개 시트·34개 헤더 확인 기록
- 각 사례의 22개 원본 셀과 기존 원본 매핑 테이블의 조직학/T/N/M·EGFR·수술 여부 일치
- `public_synthetic`과 `generated_demo` provenance 분리
- `expectedExtraction.evidenceText`의 `inputText` 포함 여부
- 원문에 없는 최종 Stage의 `null` 유지
- 개인정보 형식 문자열과 안전 고지 누락
- 고정 fixture 버전, 난수 없는 생성 모드, 요구된 오류 유형의 최소 1건 이상 포함

## 현재 한계

이 단계는 실행 가능한 평가 입력과 정답 구조를 만든 것이다. 데모 엔진 또는 Gemini를 35건에 자동 실행한 결과, precision·recall·F1, 필드 정확도, 경고 재현율은 아직 산출하지 않았다. 따라서 평가사례 구축 완료와 AI 성능검증 완료를 구분한다.

위탁검사 시연 파일은 `npm.cmd run data:generate:outsourced-fixtures`로 이 평가 JSON의 10개 outsourced 사례에서 파생한다. 정상 일치, 검사번호·검체·검사명·접수일·결과 불일치, 보고일 누락, 수정 보고서, 결과 누락 PDF 9개와 촬영 상태 불량 PNG 1개를 생성하며, 파일별 `evaluation_case_id`와 `source_row_id`를 함께 기록한다.
