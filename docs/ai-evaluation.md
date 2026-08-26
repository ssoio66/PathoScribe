# Gemini 평가 실행과 해석 기준

## 실행 범위

전체 평가는 공개 웹페이지, production build, Vercel Preview/Production 배포, 일반 페이지 접속 과정에서 자동 실행되지 않는다. 로컬 개발 서버에서만 다음 명령을 명시적으로 실행한다.

```powershell
npm.cmd run dev
npm.cmd run evaluate:gemini
npm.cmd run evaluate:gemini -- --confirm --base-url http://127.0.0.1:3000
```

첫 명령은 호출 계획만 출력하며 Gemini를 호출하지 않는다. 두 번째 명령에서만 `--confirm`으로 35건 순차 호출을 승인한다. 로컬 서버는 `PATHOSCRIBE_DEMO_MODE=false`여야 하며, `PATHOSCRIBE_PUBLIC_DEPLOYMENT=true`, `VERCEL=1`, `NODE_ENV=production` 환경에서는 실행기가 중단된다.

| 항목 | 값 |
| --- | --- |
| 육안 소견 | 10건 |
| 병리 결과 | 15건 |
| 위탁검사 | 10건 |
| 합계 | 35건 |
| 예상 호출 수 | 35회 |
| 예상 시간 | 약 5~15분 |
| 모델 | 실행 응답의 `model` 값으로 확정, 기본값 `gemini-3.6-flash` |
| promptVersion | `public-evaluation-v1` |

실행기는 기존 로컬 Route에 고정 `caseId` 또는 등록 fixture ID만 보낸다. 자유 원문, 실제 환자정보, 임의 업로드 파일, API 키는 실행기에서 다루지 않는다.

## 결과 파일

실행 성공·실패 결과는 다음 위치에 버전과 실행 시각을 포함한 JSON으로 저장한다.

```text
data/evaluation/results/evaluation-fixtures-v1.1.3-<실행시각>.json
```

파일에는 `evaluatedAt`, `model`, `promptVersion`, `caseVersion`, 전체·성공·실패·제외 사례 수, 지연시간, 계산된 지표와 사례별 요약만 기록한다. API 키, 전체 내부 프롬프트, 원문 전체, 실제 환자정보는 저장하지 않는다. `index.json`은 서비스 설명 화면이 표시할 최신 결과의 안전한 요약만 가진다.

## 지표 계산

- 필수항목 추출률: ground truth가 `null`이 아닌 필드 중 정규화 후 정확히 일치한 필드 비율
- 불일치 탐지율: 현재 하이브리드 규칙과 직접 매칭 가능한 오류 유형만 분모에 포함한 탐지 비율
- 원문에 없는 값 생성률: ground truth가 `null`인 필드에 비어 있지 않은 값을 반환한 비율. 낮을수록 좋다.
- 원문 근거 연결률: ground truth가 있는 필드 중 응답의 `evidenceText`가 가상 원문에 그대로 존재하는 비율
- JSON 스키마 통과율: 필드 키, 중복, `value`·`evidenceText`·`status` 조합이 Route의 검증 규칙을 통과한 사례 비율

분모가 0인 지표는 `N/A`로 저장하며 화면의 핵심 지표에는 표시하지 않는다. 실패한 호출은 성공 사례와 지표 분자에 포함하지 않는다. 서비스 설명 화면은 실제 값이 있는 지표 중 필수항목 추출률, 불일치 탐지율, 원문에 없는 값 생성률 순으로 최대 3개만 표시한다.

## 정규화 기준

- `null`, 빈 문자열, `not_found`, `N/A`는 `null`로 정규화한다.
- Unicode NFKC, 앞뒤 공백 제거, 연속 공백 축소, 대소문자 무시를 적용한다.
- `×`와 `x`, 숫자·단위 주변 공백은 정규화한다.
- `cm`와 `mm`는 서로 환산하지 않는다.
- 진단명, 병기, 의학용어의 동의어는 자동 동치 처리하지 않는다. 임상적 의미를 추정해 일치로 처리하지 않기 위함이다.

## 방식 비교와 한계

이 실행기는 기존 공개 Route가 반환한 Gemini+규칙 하이브리드 결과만 측정한다. 규칙 기반 단독과 Gemini 단독 결과를 실제로 별도 실행하기 전에는 비교표에서 `N/A`로 표시하며 임의 수치를 만들지 않는다.

이 평가는 공개 폐암 합성데이터에서 파생한 교육용 ground truth와 프로젝트 생성 가상 문장을 대상으로 한다. 국립암센터 데이터 또는 실제 병리 업무의 성능으로 일반화하지 않으며, 실제 진단·판독·치료·병기 판정 성능을 주장하지 않는다.
