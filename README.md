# PathoScribe

PathoScribe는 보건의료정보관리사 업무를 지원하는 폐암 병리 전사·검수 웹 시제품입니다. 육안 소견, 병리 결과, 위탁검사 결과의 원문과 구조화 결과를 비교해 누락과 불일치 가능성을 확인하는 업무 흐름을 보여 줍니다.

이 프로젝트는 실제 의료기관의 화면, 로고, 내부 지침, 권한체계 또는 정보시스템을 모방하거나 연결하지 않습니다. 폐암 진단, 병리 판독, 예후 예측, 치료 추천, AJCC 병기 자동판정, 결과 자동확정 기능을 제공하지 않습니다.

## 화면 구성

첫 화면의 기본 메뉴는 세 가지로 제한합니다.

- **서비스 소개**: 프로젝트 목적, 세 가지 핵심 전사업무, 사용 제한을 30초 안에 확인합니다.
- **업무 시연**: 역할을 선택한 뒤 직군별 업무 메뉴와 고정 가상 사례를 통해 육안 소견·병리 결과·위탁검사 검수 흐름을 실행합니다.
- **서비스 설명**: 문제-기능-기대효과, 생성형 AI 활용 방식, 실제 측정 여부와 개발 상세를 요약합니다.

서비스 설명의 문제-기능-기대효과 표는 전체 연결 항목을 한 번에 보여 줍니다. 생성형 AI 활용, 안전장치·한계, 기술 상세 내용은 기존 섹션과 접기 영역에서 제공합니다.

데이터 출처와 역할별 세부 화면은 업무 시연을 보조하는 사이드바 항목으로 유지합니다. AI 평가 요약은 실제 측정된 값만 표시하며, 현재 35건 일괄 실행 지표는 미측정 상태입니다.

## 핵심 업무

1. 육안 소견 입력·검수: 장기, 검체, 부위, 좌우, 크기, 개수, 절단면, 병변 위치, 블록 수를 원문 근거와 함께 비교합니다.
2. 병리 결과 입력·검수: 원문에 명시된 검체·장기·좌우·부위·시술·진단·조직학적 유형·종양 크기·분화도·절제연·림프절·병기·면역병리·분자병리 값을 구조화 입력 템플릿에 배치하고, 용어·숫자·단위·검사정보의 오류 가능성을 검수합니다.
3. 위탁검사 결과 입력·매칭: 교육용 가상 결과지 fixture와 가상 내부 의뢰정보를 항목별로 비교합니다.

모든 구조화 화면은 원문, AI 또는 규칙 기반 추출값, 담당자 수정값을 분리해 표시합니다. 원문에 값이 없으면 `null`로 처리하고, 좌우처럼 원문 안에서 값이 충돌하거나 결과 형식이 불완전하면 발견한 표현과 근거를 보존한 채 `확인 필요`로 표시합니다. 사용자가 확인하기 전에는 확정하지 않습니다.

### 중요 누락·불일치 대응

PathoScribe는 중요한 오류를 자동으로 해결하거나 의료적 판단을 대신하지 않습니다. 원문에 존재하는 중요한 누락·불일치가 경고 없이 넘어갈 위험을 줄이기 위해 다음을 함께 표시합니다.

- 좌우 충돌의 원문 표현과 관련 필드값
- 종양 크기·검체 수·블록 수의 숫자·단위 불일치
- 절제연, 림프절, 면역병리 결과, 보고일 등 교육용 필수 항목의 누락
- 위탁검사의 의뢰번호, 검사명, 검체명과 가상 내부 의뢰정보의 불일치

양성·음성, 좌우, 병기, 크기·단위, 절제연, 림프절, 면역표지자·유전자 결과, 검사번호·검체명은 자동수정하지 않고 `원문 확인 필요`로 남깁니다. 오류 미탐률은 전체 평가를 실제로 실행해 측정하기 전까지 수치로 표시하지 않습니다.

오류 포함 평가사례에서는 `원문 추출 대조`와 `오류 검수`를 구분합니다. 예를 들어 원문에서 병변 위치가 빠진 경우 AI가 `null`을 반환하는 것은 원문 추출에는 일치하지만, 같은 필드의 기준값과 대조하면 `병변 위치 누락` 오류로 탐지됩니다. 오류 영향 필드에는 관련된 모든 필드의 `현재값`, 필요할 때 `기준값`, 원문 근거, 탐지 상태를 함께 표시해 실제 충돌값을 확인할 수 있습니다.

## v1.1 병리 결과 보조 기능

기존 병리 결과 입력·검수 화면에 **구조화 입력 템플릿**과 **의학용어 오탈자 검수**를 통합했습니다. 원문, Gemini 추출값, 구조화 템플릿, 담당자 확정값을 분리해 보여 주며 템플릿 배치는 승인 완료를 의미하지 않습니다.

- 템플릿 필드: 검체, 장기, 좌우·부위, 시술·수술, 조직학적 진단·유형, 종양 크기, 분화도, 절제연, 림프절, 면역병리, 분자병리, 원문 병기 pT·pN·pM
- 담당자 확정값: 항목 성격에 따라 교육용 선택 후보 또는 원문 표기 직접 입력을 사용합니다. 선택지는 `우측 (right)`, `선암 (adenocarcinoma)`처럼 한글·영어를 하나의 메뉴값으로 병기합니다. 장기·부위·진단·유형·분화도 등은 `기타 직접 입력`을 제공하고, 좌우·절제연·pT/pN/pM·Stage는 원문에서 추출된 값 또는 `확인 필요`만 직접 선택합니다.
- 원문 값이 `null` 또는 `not_found`이면 직군과 항목 종류에 관계없이 선택 후보를 숨기고 빈 자유 입력칸과 `원문 확인 필요` 안내만 표시합니다. 값 입력 권한은 기존 역할 정책을 따릅니다.
- 용어 자료: 암정보사전 고정 스냅샷, 폐암 세부진단·면역병리 참고 데이터, 레지스트리 메타정보, 프로젝트 자체 목록, 평가사례 용어
- 낮은 위험 단순 오탈자만 수정 후보로 제시하며 `제안 적용`은 담당자 확정값에만 반영합니다. 원문·AI 값은 변경하지 않습니다.
- 양성·음성, 좌우, 병기, 크기·단위, 절제연, 림프절, 유전자·면역표지자, 검사번호·검체명은 자동 수정하지 않고 원문 확인을 요구합니다.
- 새 Gemini 호출이나 외부 용어 API를 추가하지 않았고, 기존 서버 전용 키·고정 caseId·공개 호출 제한을 유지합니다.

## 평가 사례 시연

육안 소견과 병리 결과 화면은 처음 열 때 정상 평가사례를 자동으로 입력합니다. `평가 사례 불러오기`에서 오류 포함 사례를 고른 뒤 `AI 구조화 분석 실행`을 누르면, AI 응답과 해당 사례의 `groundTruth`를 다음 상태로 자동 대조합니다.

- `정확 일치`: AI 추출값과 평가 정답이 같습니다.
- `의미상 일치`: 검체·진단명·조직학적 유형처럼 주변 설명이 함께 반환될 수 있는 항목에서 핵심 용어가 같고 다른 후보와 충돌하지 않습니다.
- `누락`: 원문에 있는 평가 정답을 AI가 `null`로 남겼습니다.
- `불일치`: AI 추출값이 평가 정답과 다릅니다.
- `원문 밖 생성값`: 평가 정답이 `null`인데 AI가 값을 제시했습니다.

평가 비교는 필드별로 적용합니다. 검체·진단명·조직학적 유형은 확장된 표현을 `의미상 일치`로 구분하지만, 좌우·종양 크기·단위·병기·절제연·림프절·검사번호 등 고위험 항목은 전체 값을 엄격하게 비교합니다. 원문과 AI 응답은 변경하지 않으며, 의미상 일치도 담당자 최종 확인을 대신하지 않습니다.

담당자 확정값은 AI 추출값과 별도 입력이며, 담당자 수정 이후에도 AI-정답 대조 결과는 바뀌지 않습니다. 위탁검사 화면은 정상 일치 fixture를 기본 선택하고, 평가사례 10건에서 파생한 교육용 PDF 9개·PNG 1개의 공개 경로를 열어 원문과 항목별 대조 결과를 함께 확인할 수 있습니다. 세 화면 모두 브라우저 인쇄 대화상자를 통해 교육용 검수 결과를 PDF로 저장할 수 있습니다.

### 작업 목록 연결 원칙

`검수 작업 목록`은 가상 주문의 `source_record_id`와 평가사례의 `sourceRowId`가 정확히 같은 경우에만 해당 `EVAL-...` 사례를 엽니다. 예를 들어 `ORD-LUNG-2026-10001`은 `NCC-LUNG-TST-00000`을 통해 `EVAL-GROSS-001`과 연결됩니다. 연결이 없는 행은 임의의 정상 사례를 열지 않고, 선택한 주문 ID가 유지되는 `가상 연결 데이터` 화면으로 이동합니다.

## 전체 Gemini 평가

서비스 설명 화면의 `AI 검증 요약`은 실행된 결과 파일이 있을 때만 모델, 실행일, 실제 계산된 핵심 지표 최대 3개를 표시합니다. 결과 파일이 없을 때는 35건 평가 데이터셋 구성, 실시간 대표 사례 시연 제공, 전체 정량 성능평가 미실시만 안내합니다. 전체 35건 평가는 공개 URL에서 자동 실행하지 않으며, 로컬 개발 서버에서 명시적으로 승인해야 합니다.

```powershell
npm.cmd run dev
npm.cmd run evaluate:gemini
npm.cmd run evaluate:gemini -- --confirm --base-url http://127.0.0.1:3000
```

기본 명령은 예상 호출 수·모델·버전·실행 시간을 보여 주는 계획 확인이며 실제 호출은 하지 않습니다. `--confirm` 실행은 로컬 `127.0.0.1` 또는 `localhost`만 허용하고, 공개 배포·production 환경에서는 중단됩니다. 결과 파일은 `data/evaluation/results/`에 저장하며 API 키, 전체 내부 프롬프트, 실제 환자정보는 저장하지 않습니다. 계산 방식과 한계는 [Gemini 평가 기준](./docs/ai-evaluation.md)을 확인합니다.

## 기술 스택

- Next.js 16 App Router, React 19, TypeScript
- 서버 Route Handler 기반 API
- `@google/genai` 서버 전용 Gemini 호출
- 로컬 JSON 스냅샷과 Node.js·PowerShell 데이터 처리 스크립트
- 직접 작성한 반응형 CSS와 Lucide 아이콘

구현하지 않은 기술: 데이터베이스, 실제 병원 인증·권한 연동, 실제 전자서명, 실제 PIS/EMR 연동, 범용 OCR, 음성인식, 서버 PDF 생성기.

## 실행

Node.js 20 이상과 npm이 필요합니다. 원본 XLSX를 다시 처리할 때는 Windows PowerShell 5.1 이상도 필요합니다.

```powershell
npm.cmd install
npm.cmd run dev
```

브라우저에서 `http://127.0.0.1:3000`을 엽니다.

검사 명령:

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run test:v1.1
npm.cmd run test:normal-cases
npm.cmd run test:error-cases
npm.cmd run test:case-audit
npm.cmd run test:web
npm.cmd run data:test:outsourced-fixtures
npm.cmd run build
```

`test:web`은 개발 서버가 실행 중일 때 주요 화면과 API의 성공·실패 경로를 확인합니다. `test:responsive`는 반응형 CSS, 키보드 포커스, 역할 요약 ARIA, 아코디언, 긴 ID 처리와 색상 외 상태 라벨을 정적으로 검사합니다(실제 브라우저 스크린샷은 별도 확인 필요). `test:normal-cases`는 실제 Gemini를 호출하지 않는 데모 모드에서 정상 육안·병리 9건, 정상 위탁검사 2건, 저화질 확인 필요 1건을 재현해 정답 불일치와 규칙 오탐을 검사합니다. `test:error-cases`는 오류 사례 23건에서 원문 추출 정답과 주입 오류별 예상 경고 코드가 모두 재현되는지 검사합니다. `test:case-audit`는 35건을 개별 실행하여 값·상태·근거·기대 경고와 의도하지 않은 추가 경고를 함께 점검하고 감사표를 갱신합니다.
위탁검사 fixture는 `npm.cmd run data:generate:outsourced-fixtures`로 평가 ground truth에서 재생성하고 `npm.cmd run data:test:outsourced-fixtures`로 파일·워터마크·대조 유형을 검증합니다.
평가사례는 `npm.cmd run data:generate:evaluation`로 결정론적으로 재생성하고 `npm.cmd run data:test:evaluation`로 원본 매핑과 정답 구성을 검증합니다. `npm.cmd run test:worklist-links`는 작업 목록 미리보기와 평가사례의 `source_record_id`·`sourceRowId` 정확한 연결을 검증합니다.

## 환경변수

`.env.example`을 참고해 로컬 `.env`에 서버 전용 값을 설정합니다. 실제 키 값은 Git에 포함하지 않습니다.

```dotenv
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.6-flash
PATHOSCRIBE_DEMO_MODE=true
LUNG_CANCER_LIBRARY_DETAILED_DIAGNOSIS_API_KEY=
LUNG_CANCER_LIBRARY_IMMUNOPATHOLOGY_BY_TYPE_API_KEY=
LUNG_CANCER_LIBRARY_SURGICAL_PATHOLOGY_PATHOLOGIC_STAGE_API_KEY=
LUNG_CANCER_LIBRARY_BRONCHOSCOPY_BY_TYPE_API_KEY=
```

Gemini는 [서버 Route](./app/api/analyze/route.ts)에서만 호출됩니다. `PATHOSCRIBE_DEMO_MODE=true`이면 교육용 규칙 기반 데모를 명확히 표시합니다. 데모 모드를 끈 상태에서 Gemini 호출이 실패하면 오류를 반환하며 가짜 AI 결과로 대체하지 않습니다.

Gemini Developer API는 `@google/genai` SDK와 `gemini-3.6-flash` 모델을 사용합니다. 서버와 동일한 SDK 방식으로 짧은 실제 요청을 실행해 HTTP 200과 응답 수신을 확인했습니다. 교육용 데모 모드에서는 실제 호출을 실행하지 않으며, 호출 실패 시 가짜 AI 결과를 반환하지 않습니다.

실시간 호출이 실패하면 오류 유형에 따라 사용자용 안내를 표시합니다. 무료 API 할당량 소진(429), Gemini 상위 API 오류(5xx), 시간 초과, 응답 스키마 오류를 구분하며, 공통적으로 저장된 교육용 사례와 검수 화면은 계속 확인할 수 있음을 안내합니다. 실패 응답은 성공 결과나 저장 예시로 대체하지 않습니다.

## Vercel 공개 배포

Vercel Production과 Preview 모두 아래 **서버 전용 환경변수**를 등록합니다. 어떠한 변수도 `NEXT_PUBLIC_` 접두어로 만들지 않습니다.

```dotenv
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.6-flash
PATHOSCRIBE_DEMO_MODE=false
PATHOSCRIBE_PUBLIC_DEPLOYMENT=true
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
# Vercel Upstash for Redis may create these names instead of UPSTASH_*.
# PathoScribe accepts either pair.
# KV_REST_API_URL=
# KV_REST_API_TOKEN=
PATHOSCRIBE_RATE_LIMIT_SALT=
PATHOSCRIBE_RATE_LIMIT_REQUESTS=12
PATHOSCRIBE_RATE_LIMIT_WINDOW_SECONDS=3600
```

Vercel의 `VERCEL=1` 시스템 환경변수를 사용할 수도 있지만, Preview와 Production 모두에서 확실히 공개 제한을 적용하려면 `PATHOSCRIBE_PUBLIC_DEPLOYMENT=true`를 함께 등록합니다. `GEMINI_API_KEY`, Upstash URL·토큰·salt 중 하나라도 없으면 빌드는 성공하지만 공개 페이지의 실시간 Gemini 버튼은 비활성화되고 서버도 요청을 거부합니다.

공개 URL의 `/api/analyze`는 `caseId`와 `kind`만 허용하며, 서버가 `data/evaluation/evaluation-cases.json`의 고정 평가사례인지 다시 검증합니다. 임의 `text`, 실제 환자정보, 업로드 파일은 분석 대상으로 전송할 수 없습니다. 위탁검사 Gemini Route는 `data/fixtures/outsourced-test/referral-fixtures.json`에 등록된 PDF·이미지 fixture만 읽습니다. 두 Route는 Upstash Redis REST의 원자적 카운터로 IP 해시별 시간당 12회 제한을 적용하며, 호출 제한 저장소에 접근하지 못하면 fail-closed로 실제 호출을 하지 않습니다.

배포 후에는 다음 순서로 확인합니다.

1. Vercel Preview에서 `/api/gemini/status`의 `liveAvailable`이 `true`인지 확인합니다.
2. 육안 소견 또는 병리 결과 화면에서 `EVAL-GROSS-001` 또는 `EVAL-PATH-001`을 불러와 실시간 분석을 실행합니다.
3. 응답의 `mode=gemini`, `model`, `latencyMs`, `promptVersion`, `caseVersion`, `evaluatedAt`을 확인합니다.
4. 개발자 도구 Network에서 `/api/analyze` 요청 본문이 `caseId`와 `kind`뿐인지 확인합니다.
5. `caseId` 없는 요청, 임의 `text` 요청, 미등록 caseId 요청이 각각 거부되는지 확인합니다.
6. 위탁검사 화면에서 등록된 가상 PDF·이미지 fixture만 Gemini 문서 재추출 버튼이 동작하는지 확인합니다.

## 데이터 사용

- 국립암센터 폐암 임상 라이브러리 합성데이터: 가상 작업목록, 연결 타임라인, 데이터 품질 현황에 사용합니다. 자유서술 병리 원문으로 사용하지 않습니다.
- 폐암 세부진단·면역병리·병기값 API 스냅샷: 집계 참고, 용어 후보, 입력 형식 상태 확인에만 사용합니다. 개인 결과 판단에 사용하지 않습니다.
- IASLC/AJCC 폐암 TNM 9판 교육용 참조: 원문에 적힌 pN2a·pN2b·pM1c1·pM1c2 문자열의 형식 검수와 출처 표시에만 사용합니다. 종양 크기·침범·전이 내용에서 병기나 최종 Stage를 계산하지 않습니다.
- 암정보사전 스냅샷과 폐암 레지스트리 메타정보: 근거 검색과 데이터 사전에 사용합니다. 암정보사전 3,544개 용어는 자유 검색과 40개 단위 목차 탐색으로 확인할 수 있으며, 폐·흉부/병리·조직/면역·표지자/분자·유전 분류는 공식 의학 분류가 아닌 화면 탐색용 키워드 분류입니다. 배포 빌드에서는 국가암지식정보센터 공식 OPEN API 응답을 검증해 로컬 검색용 정제본을 생성합니다.
- 자체 생성 가상 병리문·위탁검사 fixture: 입력·비교 시연에 사용합니다. 실제 환자 또는 실제 의료기관 자료가 아닙니다.
- 기관지내시경검사 종류별 API: 검증된 공개 집계 스냅샷을 가상 연결 데이터의 보조 정보로 표시합니다. 개별 검사 이력이나 검체 채취 사실로 사용하지 않습니다.

정확한 데이터명, 건수, 위치, 출처, 기준일과 한계는 [데이터 카탈로그](./docs/data-catalog.md)를 확인합니다.

Vercel 배포에는 개인정보 없는 `data/generated/web_preview.json`만 포함합니다. 이 파일은 검사·검체·블록·보고서 타임라인 48건을 표시하기 위한 가상 미리보기이며, 전체 15,000건 대용량 생성 테이블과 원본 ZIP/XLSX는 Git에 포함하지 않습니다.

## 안전 원칙

- 실제 환자정보 입력 금지
- 공개 합성데이터와 개인정보 없는 가상 자료만 사용
- 원문에 없는 내용 생성 금지
- 진단·판독·병기·치료 추론 금지
- 담당자 확인 전 자동 저장·자동 확정 금지
- 질문과 결과를 데이터베이스나 서버 로그에 저장하지 않음
- AI 결과와 담당자 수정값을 화면 상태에서 분리
- 모든 결과에 담당자 원문 대조 필요 표시

세부 정책은 [AI 안전정책](./docs/ai-safety.md)을 확인합니다.

## 문서

- [최종 검증 보고서](./docs/final-verification.md)
- [v1.1 회귀 검증 보고서](./docs/v1.1-verification.md)
- [평가사례 사례별 감사](./docs/evaluation-case-audit.md)

- [평가자료 설계 근거와 자체 스키마](./docs/evaluation-data-basis.md)
- [추적 가능한 평가사례](./docs/evaluation-cases.md)
- [데이터 카탈로그](./docs/data-catalog.md)
- [사용자 업무 흐름](./docs/user-workflow.md)
- [AI 안전정책](./docs/ai-safety.md)
- [한계](./docs/limitations.md)
- [구현 및 검증 TODO](./TODO.md)
- [연결 데이터 모델](./docs/pathology-workflow-data-model.md)
- [연결 데이터 컬럼 정의](./docs/pathology-workflow-column-dictionary.md)
