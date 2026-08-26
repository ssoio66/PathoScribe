import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const fixturePath = process.argv[2] ?? "data/fixtures/outsourced-test/referral-fixtures.json";
const orderPath = process.argv[3] ?? "data/fixtures/outsourced-test/internal-referral-orders.json";
const evaluationPath = process.argv[4] ?? "data/evaluation/evaluation-cases.json";
const fixtureDirectory = "output";
const load = async (path) => JSON.parse(await readFile(path, "utf8"));
const fixtures = await load(fixturePath);
const orders = await load(orderPath);
const evaluation = await load(evaluationPath);
const issues = [];
const watermark = "교육용 가상자료·실제 의료기록 아님";
const required = new Map([
  ["outsourced-match", "EVAL-OUT-001"],
  ["outsourced-id-mismatch", "EVAL-OUT-004"],
  ["outsourced-specimen-mismatch", "EVAL-OUT-006"],
  ["outsourced-test-mismatch", "EVAL-OUT-005"],
  ["outsourced-received-date-mismatch", "EVAL-OUT-007"],
  ["outsourced-report-date-missing", "EVAL-OUT-008"],
  ["outsourced-revised-report", "EVAL-OUT-003"],
  ["outsourced-result-mismatch", "EVAL-OUT-009"],
  ["outsourced-result-missing", "EVAL-OUT-010"],
  ["outsourced-image-poor", "EVAL-OUT-002"],
]);
const privacy = /\b\d{6}-?[1-4]\d{6}\b|\b01[016789]-?\d{3,4}-?\d{4}\b|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const normalize = (value) => String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en");

if (fixtures.length !== 10) issues.push(`fixture는 10건이어야 합니다: ${fixtures.length}`);
if (orders.length !== fixtures.length) issues.push("fixture와 내부 의뢰정보 건수가 다릅니다.");
const fixtureIds = new Set();
const evalById = new Map(evaluation.cases.map((item) => [item.caseId, item]));
for (const fixture of fixtures) {
  if (fixtureIds.has(fixture.id)) issues.push(`중복 fixture id: ${fixture.id}`);
  fixtureIds.add(fixture.id);
  if (!required.has(fixture.id)) issues.push(`필수 fixture가 아닌 id: ${fixture.id}`);
  if (required.get(fixture.id) !== fixture.evaluation_case_id) issues.push(`${fixture.id}: evaluation_case_id 연결 불일치`);
  if (fixture.source_type !== "generated_demo") issues.push(`${fixture.id}: source_type은 generated_demo여야 합니다.`);
  if (fixture.watermark !== watermark) issues.push(`${fixture.id}: 워터마크 누락`);
  if (fixture.asset_path !== `/fixtures/outsourced-test/${fixture.file_name}`) issues.push(`${fixture.id}: 배포용 asset_path 불일치`);
  if (!evalById.has(fixture.evaluation_case_id)) issues.push(`${fixture.id}: 평가사례를 찾을 수 없습니다.`);
  if (privacy.test(JSON.stringify(fixture))) issues.push(`${fixture.id}: 개인정보 형식 문자열 발견`);
  const filePath = fixture.format === "pdf" ? `${fixtureDirectory}/pdf/outsourced-test/${fixture.file_name}` : `${fixtureDirectory}/images/outsourced-test/${fixture.file_name}`;
  if (!existsSync(filePath)) issues.push(`${fixture.id}: 파일이 없습니다: ${filePath}`);
  else {
    const bytes = await readFile(filePath);
    if (bytes.length < 1000) issues.push(`${fixture.id}: 파일 크기가 너무 작습니다.`);
    if (fixture.format === "pdf" && bytes.subarray(0, 8).toString("ascii") !== "%PDF-1.4") issues.push(`${fixture.id}: PDF 헤더 오류`);
    if (fixture.format === "image" && bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") issues.push(`${fixture.id}: PNG 헤더 오류`);
  }
  if (!existsSync(`public${fixture.asset_path}`)) issues.push(`${fixture.id}: 배포용 public 파일이 없습니다.`);
  const order = orders.find((item) => item.fixture_id === fixture.id);
  if (!order) { issues.push(`${fixture.id}: 내부 의뢰정보 누락`); continue; }
  const pairs = [
    ["order_number", order.order_id], ["institution", order.institution], ["test_name", order.test_name], ["specimen", order.specimen],
    ["received_date", order.received_date], ["reported_date", order.reported_date], ["amendment_status", order.amendment_status], ["result", order.expected_result],
  ];
  if (fixture.id === "outsourced-match" || fixture.id === "outsourced-revised-report") {
    for (const [key, expected] of pairs) if (normalize(fixture.extracted[key]) !== normalize(expected)) issues.push(`${fixture.id}: ${key} 정상 대조 실패`);
  }
  if (fixture.id === "outsourced-id-mismatch" && normalize(fixture.extracted.order_number) === normalize(order.order_id)) issues.push("검사번호 불일치 사례가 일치합니다.");
  if (fixture.id === "outsourced-specimen-mismatch" && normalize(fixture.extracted.specimen) === normalize(order.specimen)) issues.push("검체 불일치 사례가 일치합니다.");
  if (fixture.id === "outsourced-test-mismatch" && normalize(fixture.extracted.test_name) === normalize(order.test_name)) issues.push("검사명 불일치 사례가 일치합니다.");
  if (fixture.id === "outsourced-received-date-mismatch" && normalize(fixture.extracted.received_date) === normalize(order.received_date)) issues.push("접수일 불일치 사례가 일치합니다.");
  if (fixture.id === "outsourced-report-date-missing" && fixture.extracted.reported_date !== null) issues.push("보고일 누락 사례에 보고일이 있습니다.");
  if (fixture.id === "outsourced-result-mismatch" && normalize(fixture.extracted.result) === normalize(order.expected_result)) issues.push("결과 불일치 사례가 일치합니다.");
  if (fixture.id === "outsourced-result-missing" && fixture.extracted.result !== null) issues.push("결과 누락 사례에 결과가 있습니다.");
  if (fixture.id === "outsourced-image-poor" && Object.entries(fixture.extracted).some(([key, value]) => key !== "reference_note" && value !== null)) issues.push("저화질 이미지 자동 추출값은 모두 null이어야 합니다.");
}

if (issues.length) {
  console.error(`위탁검사 fixture 검증 실패 (${issues.length}건)`);
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}
console.log("위탁검사 fixture 검증 통과: PDF 9건, PNG 1건, 워터마크·평가사례 연결·내부 의뢰정보·오류 유형 확인 완료.");
