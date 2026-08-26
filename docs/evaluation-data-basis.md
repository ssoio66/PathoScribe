# 평가자료 설계 근거

기준일: 2026-08-25

## 목적과 범위

PathoScribe의 평가사례는 폐암 병리 전사·검수 화면이 원문에 있는 값을 빠뜨리거나 바꾸지 않고 구조화하는지 확인하기 위한 교육용 가상자료이다. 실제 병리보고서, 실제 환자정보, 실제 의료기관 문서 또는 의료기관 내부 지침은 사용하지 않는다.

ICCR 자료는 자체 평가 스키마의 상위 필드 범주를 정하는 참고자료로만 사용한다. 원문 문장, 체크리스트, 설명문, 선택지, 표 또는 문서 파일을 프로젝트에 복사하거나 재배포하지 않는다.

## 근거자료별 역할

| 근거 ID | 자료 | 평가사례에서의 역할 | 사용하지 않는 방식 |
| --- | --- | --- | --- |
| `ncc_lung_synthetic_20250107` | 국립암센터 암 임상 라이브러리 합성데이터(폐암) | 실제 XLSX에 존재하는 조직학·병기·분자 관련 합성 변수의 값 범위와 결측 사례 참고 | 자유서술 병리 원문, 실제 환자 사례 또는 원본에 없는 필드의 근거로 사용하지 않음 |
| `ncc_lung_registry_metadata_20200110` | 국립암센터 폐암 레지스트리 메타정보 | 데이터 항목명, 형식, 테이블 관계를 참고하는 데이터 사전 | 환자별 값이나 병리 결과 정답으로 사용하지 않음 |
| `ncc_lung_diagnosis_aggregate` | 폐암 세부진단 종류별 공개데이터 | 가상 진단 문자열 후보와 집계 분류 참고 | 개인 진단 결정이나 정답 산출에 사용하지 않음 |
| `ncc_lung_immunopathology_aggregate` | 폐암 면역병리 종류별 공개데이터 | 검사 종류와 입력 형식 범주 참고 | 개인 검사 결과 생성에 사용하지 않음 |
| `ncc_lung_pathologic_stage_aggregate` | 폐암 외과병리 병리학적 병기값 공개데이터 | 병기 필드의 존재와 집계 범위 참고 | pT·pN·pM·Stage 계산 또는 정답 판정에 사용하지 않음 |
| `iccr_lung_cancer_4e` | ICCR Lung Cancer Dataset | 폐암 절제 검체 보고에 필요한 상위 정보 범주와 구조 참고 | ICCR 문구·데이터셋 본문·선택지를 복사하거나 ICCR 준수 보고서로 표시하지 않음 |
| `pathoscribe_authored` | PathoScribe 자체 작성 가상자료 | 개인정보 없는 가상 원문, 기대 추출값, 근거 구절, 기대 경고를 작성하는 직접 출처 | 실제 임상 사실 또는 외부 기관 자료로 표현하지 않음 |

## PathoScribe 자체 필드 구조

아래 필드는 ICCR의 공개 보고항목 상위 범주, 국립암센터 메타정보, 현재 PathoScribe 화면의 입력 항목을 비교해 자체 명칭으로 정규화한 것이다. 외부 문서의 필드명, 필수 여부, 선택지 또는 설명문을 재현한 것이 아니다.

| PathoScribe 영역 | 자체 필드 | 평가 목적 | 참고 근거 |
| --- | --- | --- | --- |
| 육안 소견 | `organ`, `specimen`, `site`, `laterality`, `size`, `count`, `cutSurface`, `lesionLocation`, `blockCount` | 장기·검체·위치·숫자·단위·개수·블록 수의 원문 일치 여부 검수 | PathoScribe 기존 업무 정의, 국립암센터 메타정보 |
| 병리 결과 | `organ`, `specimen`, `laterality`, `site`, `procedure`, `diagnosis`, `histologicType`, `tumorSize`, `grade`, `margin`, `lymphNodes` | 구조화 템플릿 배치, 보고항목 누락, 값 변형, 원문 근거 유무 검수 | ICCR 상위 보고 범주, 국립암센터 세부진단 집계·메타정보 |
| 병기 입력 | `pathologicT`, `pathologicN`, `pathologicM`, `pathologicStage` | 원문에 명시된 문자열의 추출·허용 형식·입력값 일치 여부만 검수 | ICCR 상위 보고 범주, 공개 병기 집계, 프로젝트 병기 안전정책 |
| 보조검사 | `immunopathology`, `molecularPathology` | 검사명·결과 표현의 누락과 원문 근거 검수 | 국립암센터 면역병리 집계, 프로젝트 입력 지침 |
| 위탁검사 | `order_number`, `institution`, `test_name`, `specimen`, `received_date`, `reported_date`, `result`, `reference_note` | 가상 결과지 추출값과 내부 가상 의뢰정보의 문자열 대조 | PathoScribe 자체 가상 위탁검사 자료 |

병기 필드는 원문에 실제로 적힌 값만 평가 대상으로 삼는다. 종양 크기, 침범 또는 전이 설명을 이용해 pT·pN·pM·Stage를 계산하지 않는다.

## 평가사례 출처 표기 규칙

각 평가사례는 `data/evaluation/evaluation-case.schema.json`을 따르며 다음 정보를 가져야 한다.

- `sourceRowId`와 `sourceLocation`: 원본 합성 XLSX의 시트·행 추적 정보
- `sourceFields`: 원본 헤더·셀 주소·원시값과 `public_synthetic` 표시
- `generatedFields`: 원본에 없는 문장화 값과 `generated_demo` 표시
- `groundTruth.sourceContext`: 원본 행의 조직학/T/N/M·EGFR·수술 여부 구조화 값
- `groundTruth.referenceFields`: 원본값과 프로젝트 템플릿의 의도한 기준값
- `groundTruth.expectedExtraction`: `inputText`에 실제로 존재하는 추출 정답과 근거 구절
- `injectedErrors`와 `expectedWarnings`: 주입 오류와 기대 검수 경고

외부 근거자료는 필드 구조를 설계한 참고 출처이며, 개별 가상 사례의 임상적 정답 출처가 아니다. 개별 사례의 문장과 기대값은 PathoScribe가 직접 작성하고 교차 검토해야 한다.

35건의 사례 분포, 실제 시트·헤더, 오류 유형과 자동 검증 범위는 `docs/evaluation-cases.md`에 기록한다.

## 공식 출처 링크

- 국립암센터 공개데이터: <https://www.data.go.kr/>
- ICCR Lung Cancers, Lung Cancer Histopathology Reporting Guide 4th edition: <https://www.iccr-cancer.org/datasets/published-datasets/thorax/lung/>

ICCR 공식 페이지는 Lung Cancer Histopathology Reporting Guide 4판을 2023년 4월 판본으로 안내한다. 판본이 변경되면 링크와 기준일을 다시 확인하되, 기존 평가 결과와 새 판본의 결과를 섞지 않는다.

## 저작권과 재배포 제한

- ICCR 문서 파일을 `data`, `public`, `docs` 또는 배포 산출물에 저장하지 않는다.
- 외부 문서의 표, 문장, 체크리스트, 주석 또는 선택지를 전사하지 않는다.
- 자체 필드명과 가상 원문만 저장하고 공식 출처 링크와 참고 판본을 기록한다.
- PathoScribe 평가 결과를 ICCR 인증, 적합성 또는 공식 준수 결과로 표현하지 않는다.
