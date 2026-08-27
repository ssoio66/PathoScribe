# PathoScribe 최종 검증 보고서

- 검증일: 2026-08-25
- 검증 대상: 로컬 개발·production build, 고정 교육용 평가사례, 공개 배포 보안 Route
- 실제 Gemini 호출: `EVAL-GROSS-001` 1건만 실행
- 전체 35건 Gemini 평가: 미실행
- 비밀정보: API 키 값과 전체 내부 프롬프트를 기록하지 않음

## 결과 요약

| 검증 항목 | 검증 방법 | 결과 | 근거 | 남은 조치 |
|---|---|---|---|---|
| 정보구조 | JSX 메뉴·사이드바 구조 검색 | 통과 | 서비스 소개, 업무 시연, 서비스 설명을 중심으로 구성하고 데이터 출처는 공통 메뉴로 배치 | 후속 명칭 지시에 따라 화면에서는 `프로젝트` 대신 `서비스`를 사용 |
| AI 설명·평가 위치 | 화면 컴포넌트 검사 | 통과 | 생성형 AI 활용 4개 항목과 AI 검증 요약은 서비스 설명 안에 있고 상세값은 `details` 안에 있음 | 없음 |
| 첫 화면 30초 이해도 | 실제 사용자 관찰 | 미실행 | 현재 세션에서 브라우저 연결 불가 | 배포 Preview에서 채용담당자 관점 1회 관찰 테스트 |
| 대표 평가사례 API | `/api/evaluation/cases` 통합 테스트 | 통과 | 육안 10건, 병리 15건 응답 검증 | 실제 브라우저 클릭은 미실행 |
| 육안·병리 데모 분석 | `/api/analyze` 통합 테스트 | 통과 | demo 응답 스키마, 규칙 경고, `not_found` 검증 | 실제 화면 조작은 미실행 |
| 위탁검사 대조 | fixture·비교 Route 테스트 | 통과 | PDF 9건·PNG 1건, 정상·불일치·누락·수정·저화질 사례 검증 | 실제 Gemini 문서 재추출은 이번 검증에서 미실행 |
| 4단 비교 | 코드·응답 구조 검사 | 통과 | 원문, AI 결과, ground truth, 사용자 확정값을 분리해 렌더링 | 실제 브라우저 편집은 미실행 |
| evidenceText | 실제 Gemini 1건 및 런타임 검증 | 통과 | HTTP 200, 9개 추출 필드 모두 원문 근거 확인 | 없음 |
| not_found | demo 통합 테스트 | 통과 | null·근거 null·`not_found` 조합 확인 | 실제 Gemini 사례는 모든 필드가 있어 실호출 확인은 미실행 |
| 검수 PDF 저장 | `window.print()` 코드·print CSS 검사 | 미실행 | 버튼과 인쇄 스타일은 존재 | 브라우저 인쇄 대화상자와 A4 잘림 수동 확인 필요 |
| AI 검증 요약 | 결과 API·화면 코드 검사 | 통과 | 결과 인덱스가 비어 있으면 35건 데이터셋 구성·대표 사례 시연 제공·전체 정량 성능평가 미실시를 표시하고 모델·지표를 추정하지 않음 | 35건 승인 평가 후 실제 지표 생성 |
| 데이터 출처·안전고지 | 화면 코드 검사 | 통과 | 공개 합성·가상자료, 서버 키, 사용자 확인, 환자정보 금지 표시 | 브라우저 가시성 수동 확인 필요 |
| 실제 Gemini smoke | `POST /api/analyze` 고정 caseId 1건 | 통과 | HTTP 200, `gemini-3.6-flash`, `mode=gemini`, 17필드 스키마, 근거 15개, `not_found` 2개, 9,971ms | 전체 35건 평가는 별도 승인 필요 |
| 전체 Gemini 평가 | 평가 인덱스 확인 | 미실행 | `latest=null`, 결과 파일 없음 | `--confirm`을 명시한 개발자 평가로만 실행 |
| API 키 서버 전용 | Route·클라이언트 번들 검색 | 통과 | 키 참조는 서버 Route와 서버 설정에만 존재, `.next/static` 비밀 이름·키 형태 검색 0건 | Vercel 배포 후 번들 재확인 |
| 허용되지 않은 caseId | 공개 모드 HTTP 요청 | 통과 | 미등록 caseId HTTP 404 | 없음 |
| 자유 원문 실호출 차단 | 공개 모드 HTTP 요청 | 통과 | 임의 `text` 본문 HTTP 403 | 없음 |
| 임의 위탁 파일 차단 | 공개 모드 HTTP 요청 | 통과 | `fixtureId` 외 본문 키 HTTP 403; 고정 fixture 파일만 서버에서 읽음 | 없음 |
| 요청 크기 제한 | 70KB 요청 | 통과 | HTTP 413 | 없음 |
| 호출 제한 | Upstash 미설정 공개 모드 | 부분 통과 | `rate_limit_not_configured`, 실시간 분석 fail-closed | Preview/Production에 Upstash 연결 후 HTTP 429 검증 |
| 중복 클릭 방지 | 컴포넌트 정적 검사 | 부분 통과 | 분석 중 `loading`/`geminiLoading`으로 버튼 비활성화 | 실제 동시 클릭·다중 탭 요청은 미실행 |
| 실패 결과 처리 | Route·UI 검사 | 통과 | `analysisState=live_failed`, 가짜 성공 응답 없음, 저장 예시와 실시간 결과 라벨 분리 | 배포 장애 시나리오 수동 확인 권장 |
| Gemini 오류 사용자 안내 | `npm.cmd run test:v1.1` 오류 분류 단위검사·Route 코드 검사 | 통과(코드) | 429 할당량, 5xx, timeout, 응답 스키마 오류를 구분하고 저장된 교육용 사례 이용 안내를 반환 | Vercel에서 실제 무료 할당량 소진 응답은 미실행 |
| 평가 계산 원칙 | 평가 실행기 검사 | 통과 | ground truth 항목만 계산, 분모 0은 null/N/A, 실패 호출 제외, 버전 메타데이터 기록 | 실제 35건 지표는 미실행 |
| 웹 핵심 지표 수 | 컴포넌트 검사 | 통과 | `displayedMetricKeys` 중 최대 3개만 표시 | 없음 |
| TypeScript | `npm.cmd run typecheck` | 통과 | 종료 코드 0 | 없음 |
| lint | `npm.cmd run lint` | 통과 | 종료 코드 0 | 없음 |
| 데이터 무결성 테스트 | `npm.cmd test` | 통과 | 9개 테이블 150,000행, 중복·고아 FK·누락 0건 | 일반 단위 테스트 프레임워크는 없음 |
| 평가 fixture 테스트 | 평가·위탁 fixture 검증 명령 | 통과 | 평가 35건, PDF 9건, PNG 1건 검증 | 없음 |
| 통합 테스트 | production 서버에서 `npm.cmd run test:web` | 통과 | 25/25 HTTP 검사 통과 | 브라우저 E2E는 미실행 |
| production build | `npm.cmd run build` | 통과 | Next.js 16.2.11 build 성공, 15개 페이지 생성 | 없음 |
| 종료 모델 검색 | 애플리케이션·서버·스크립트 `rg` 검색 | 통과 | 종료된 이전 Gemini 모델 참조 0건 | 없음 |
| 현재 모델 적용 | Route·평가 실행기 검색 | 통과 | `gemini-3.6-flash` 기본값 확인 | 공식 지원 상태는 배포 전 재확인 |
| `.env` Git 제외 | `git check-ignore`, `git ls-files` | 통과 | `.env` ignore 확인, 추적 목록에 없음 | 최초 커밋 후 CI에서 재확인 |
| `.env.example` 비밀값 | 키 이름과 대입부 검사 | 통과 | 비밀 키 항목은 빈 값, 모델·제한 기본값만 포함 | 없음 |
| 미사용 코드 | 참조 검색 | 통과 | 이전 상단 메뉴의 미사용 CSS 제거 | 전용 dead-code 분석 도구는 미사용 |
| PC·태블릿·모바일 | CSS media query 검사 | 부분 통과 | 1100px·760px·720px 반응형 규칙 존재 | 실제 스크린샷·오버플로 검증 미실행 |
| 키보드·포커스 | JSX·CSS 검사 | 부분 통과 | 의미 요소, ARIA, `:focus-visible`, 탭 상태 구현 | 키보드 전용 수동 이동 미실행 |
| 색상 외 상태 표시 | 화면 코드 검사 | 통과 | 일치·불일치·누락 텍스트와 아이콘·상태칩 병행 | 색각 사용자 수동 검증 권장 |
| 로딩·성공·실패 | 화면·Route 코드 검사 | 통과 | spinner, disabled, 오류 문구, 성공/실시간 라벨 존재 | 실제 브라우저 전환 미실행 |
| 긴 문장 줄바꿈 | CSS 검사 | 통과 | `word-break: keep-all`, `text-wrap: balance`, ID 영역 `overflow-wrap` 적용 | 실제 viewport 확인 필요 |
| A4 PDF 시각 검증 | PDF 렌더러 확인 | 미실행 | 현재 환경에 Poppler와 Python PDF 렌더링 패키지가 없음 | 브라우저 PDF와 fixture를 렌더링해 글자·표 잘림 확인 |

## 실제 Gemini smoke test

승인 범위에 따라 고정 교육용 사례 `EVAL-GROSS-001` 한 건만 호출했다.

| 항목 | 결과 |
|---|---|
| HTTP | 200 |
| mode | `gemini` |
| model | `gemini-3.6-flash` |
| analysisState | `live` |
| promptVersion | `public-evaluation-v1` |
| caseVersion | `evaluation-fixtures-v1.1.0:gross-eval-v1.1.0` |
| latencyMs | 13,483 |
| JSON/런타임 스키마 | 통과 |
| evidenceText | 9/9 필드 확인 |
| not_found | 해당 정상 사례에 미존재 필드가 없어 실호출 확인 불가 |

키 값과 전체 프롬프트는 기록하지 않았다. 이 smoke test를 35건 전체 평가 또는 서비스 성능 지표로 해석하지 않는다.

## Vercel 배포 준비

Preview와 Production에 다음 서버 전용 환경변수명을 동일하게 등록한다. 실제 값은 이 문서에 기록하지 않는다.

```text
GEMINI_API_KEY
GEMINI_MODEL
PATHOSCRIBE_DEMO_MODE
PATHOSCRIBE_PUBLIC_DEPLOYMENT
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
KV_REST_API_URL
KV_REST_API_TOKEN
PATHOSCRIBE_RATE_LIMIT_SALT
PATHOSCRIBE_RATE_LIMIT_REQUESTS
PATHOSCRIBE_RATE_LIMIT_WINDOW_SECONDS
```

공공데이터 스냅샷을 다시 동기화할 때만 해당 공공데이터 API 키 환경변수도 배포 환경에 추가한다. 일반 사용자 화면 구동에는 로컬에 생성된 스냅샷을 사용한다.

배포 후 확인 순서:

1. `/`에서 서비스 소개, 업무 시연, 서비스 설명과 데이터 출처 메뉴를 확인한다.
2. `/api/gemini/status`에서 `publicDeployment=true`, `liveAvailable=true`를 확인한다.
3. 업무 시연에서 `EVAL-GROSS-001`을 불러와 실시간 분석 1건을 실행한다.
4. Network 응답의 `mode`, `model`, `latencyMs`, `promptVersion`, `caseVersion`, `evaluatedAt`만 확인한다.
5. 자유 원문, 미등록 caseId, 추가 파일 본문, 과대 요청이 각각 403·404·403·413으로 차단되는지 확인한다.
6. 호출 제한은 Preview에서 낮은 테스트 한도를 설정한 뒤 한도를 넘긴 고정 사례 요청이 429인지 확인하고, 검증 후 운영 한도로 되돌린다.
7. 배포 로그에는 HTTP 상태, 실패 범주, 응답시간만 확인하고 요청 원문·응답 전문·환경변수 값을 남기지 않는다.
8. 환경변수를 변경하면 Vercel의 해당 Preview 또는 Production deployment를 재배포한 뒤 status Route부터 다시 확인한다.
9. 배포 후 `/api/data/pathology-workflow`가 HTTP 200으로 가상 미리보기를 반환하고 `/api/knowledge/browse?category=all&page=1`이 암정보사전 3,544개를 보고하는지 확인한다.

## v1.1 변경 검증

상세 재검증 결과는 `docs/v1.1-verification.md`에 기록한다.

| 항목 | 검증 방법 | 결과 |
| --- | --- | --- |
| 병리 구조화 템플릿 | `/api/analyze` pathology 응답 필드 및 화면 상태 분리 확인 | 통과 |
| 로컬 용어 검수 | `termReviews` 응답, 원문 근거·출처·not_found 확인 | 통과 |
| 고위험 자동수정 차단 | `EVAL-PATH-001`에서 고위험 review의 `suggestedValue=null` 확인 | 통과 |
| 기존 사례·위탁자료 | 평가사례·위탁 fixture 검증 스크립트 | 통과 |
| 공개 보안 회귀 | 기존 웹 통합 26개 항목(caseId·자유 원문·실패 상태 포함) | 통과 |
| 실제 브라우저 승인 클릭 | 브라우저 자동화 환경 부재 | 미실행 |

## 미실행 범위

- 실제 브라우저 클릭, 모바일·태블릿·PC 스크린샷, 키보드 전용 이동
- 브라우저 인쇄 대화상자와 A4 PDF 시각 렌더링
- Upstash가 연결된 Vercel 환경의 실제 429 응답
- 위탁검사 PDF·이미지의 실제 Gemini 재추출
- 35건 전체 Gemini 평가와 성능 지표 산출

위 항목은 통과로 표시하지 않는다.
