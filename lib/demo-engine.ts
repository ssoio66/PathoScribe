import type { AnalyzeKind, AnalyzeResponse, ExtractedField, ReviewIssue } from "./types";
import { extractStageTokens, isStageValueAllowed, STAGE_FIELD_DEFINITIONS, STAGE_REVIEW_DISCLAIMER, stageKeyLabel, type StageReviewKey } from "./stage-review";
import { runTextRuleReview } from "./hybrid-review";

type FieldRule = {
  key: string;
  label: string;
  patterns: RegExp[];
  required?: boolean;
};

const GROSS_RULES: FieldRule[] = [
  { key: "organ", label: "장기", patterns: [/(폐|위|대장|결장|직장|간|췌장|유방|갑상선|담낭|신장)/, /(lung|stomach|colon|rectum|liver|pancreas|breast|thyroid|gallbladder|kidney)/i], required: true },
  { key: "specimen", label: "검체", patterns: [/(폐\s*(?:생검|절제)\s*검체)/, /((?:쐐기 절제|분절 절제|전절제|부분 절제|생검|절제술)\s*검체)/, /(wedge resection|segmental resection|total resection|biopsy)/i], required: true },
  { key: "site", label: "부위", patterns: [/(상엽|중엽|하엽|기관지|말초|문부|apex|upper lobe|middle lobe|lower lobe|bronchus|peripheral)/i] },
  { key: "laterality", label: "좌우", patterns: [/(좌측|우측|왼쪽|오른쪽|left|right)/i] },
  { key: "size", label: "크기", patterns: [
    /(\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?(?:\s*[x×]\s*\d+(?:\.\d+)?)?\s*(?:cm|mm))\b/i,
    /(\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?(?:\s*[x×]\s*\d+(?:\.\d+)?))(?=\s*(?:이다|입니다|[.。]|$))/i,
  ], required: true },
  { key: "count", label: "개수", patterns: [/(\d+\s*(?:개|조각|piece(?:s)?))/i], required: true },
  { key: "cutSurface", label: "절단면", patterns: [/절단면(?:은)?\s*([^.。\n]*)/i, /cut surface\s*[:：]?\s*([^.\n]*)/i] },
  { key: "lesionLocation", label: "병변 위치", patterns: [/병변(?:은)?\s*([^.。\n]*?)(?:에\s*위치(?:한다|함)?)(?:\.|。|$)/i, /lesion (?:is|was|located)\s*([^.\n]*)/i], required: true },
  { key: "blockCount", label: "블록 수", patterns: [/(?:블록|block)[^\d]*(\d+\s*(?:개|blocks?))/i] },
];

const PATHOLOGY_RULES: FieldRule[] = [
  { key: "laterality", label: "좌우", patterns: [/(좌측|우측|왼쪽|오른쪽|left|right)/i] },
  { key: "site", label: "부위", patterns: [/(상엽|중엽|하엽|upper lobe|middle lobe|lower lobe|bronchus|peripheral)/i] },
  { key: "procedure", label: "시술 또는 수술 종류", patterns: [/(lobectomy|wedge resection|segmentectomy|resection|biopsy|생검|절제술|엽절제)/i] },
  { key: "organ", label: "장기", patterns: [/(폐|위|대장|결장|직장|간|췌장|유방|갑상선|lung|stomach|colon|rectum|liver|pancreas|breast|thyroid)/i], required: true },
  { key: "specimen", label: "검체", patterns: [/(폐\s*(?:절제술|생검))/, /(쐐기 절제|엽절제|절제술|생검|resection|biopsy|lobectomy|wedge resection)/i], required: true },
  { key: "diagnosis", label: "조직학적 진단명", patterns: [/(선암|편평세포암|소세포암|대세포암|관상피내암|adenocarcinoma|squamous cell carcinoma|small cell carcinoma|large cell carcinoma|ductal carcinoma in situ)/i], required: true },
  { key: "histologicType", label: "조직학적 유형", patterns: [/(acinar predominant type|keratinizing type|large cell type|lepidic predominant type|papillary predominant type|micropapillary predominant type|solid predominant type|acinar|lepidic|papillary|micropapillary|solid|large cell|squamous|선방형|유두형|고형형|편평세포형|대세포형)/i] },
  { key: "tumorSize", label: "종양 크기", patterns: [
    /(?:종양(?:의)? 크기|tumou?r size)\s*[:：]?\s*(\d+(?:\.\d+)?\s*(?:cm|mm))\b/i,
    /(?:종양(?:의)? 크기|tumou?r size)\s*[:：]?\s*(\d+(?:\.\d+)?)(?!\.\d)(?=\s*[.。])/i,
  ], required: true },
  { key: "grade", label: "분화도", patterns: [/(고분화|중등도 분화|저분화|well differentiated|moderately differentiated|poorly differentiated|grade\s*[1-3])/i] },
  { key: "margin", label: "절제연 상태", patterns: [/(절제연[^.。\n]*|resection margin[^.\n]*|margin\s*[:：]?\s*(?:negative|positive|uninvolved|involved))/i], required: true },
  { key: "lymphNodes", label: "림프절 수", patterns: [/림프절\s*(\d+\s*개\s*\/\s*\d+\s*개)/i, /(\d+\s*\/\s*\d+\s*(?:nodes?)?)/i, /(림프절[^.。\n]*)/i] },
  { key: "pathologicT", label: "pT", patterns: [/pT(?:is|x|[0-4](?:[a-d])?)/i] },
  { key: "pathologicN", label: "pN", patterns: [/(?:pN|N)(?:x|[0-3](?:[a-d])?)/i] },
  { key: "pathologicM", label: "pM", patterns: [/(?:pM|M)(?:x|0|1(?:[a-c])?)/i] },
  { key: "pathologicStage", label: "Stage", patterns: [/(?:\bStage|병기군)\s*[:：]?\s*(?:0|[1-4]|[IVX]+)(?:\s*[A-C])?/i] },
  { key: "immunopathology", label: "면역병리 결과", patterns: [/(\b(?:TTF-1|Napsin A|p40|CK7|PD-L1|TPS|ER|PR|HER2)\b[^.。\n]*)/i] },
  { key: "molecularPathology", label: "분자병리 결과", patterns: [/(\b(?:EGFR|ALK|ROS1|KRAS|BRAF|MET|RET|NTRK)\b[^.。\n]*)/i] },
];

function extractWithEvidence(text: string, rule: FieldRule): ExtractedField {
  for (const pattern of rule.patterns) {
    const match = text.match(pattern);
    if (match) {
      const evidence = match[0].trim();
      const value = (match[1] ?? evidence).trim();
      return { key: rule.key, label: rule.label, value, evidence, evidenceText: evidence, status: "extracted" };
    }
  }
  return {
    key: rule.key,
    label: rule.label,
    value: null,
    evidence: null,
    evidenceText: null,
    status: "not_found",
  };
}

function buildIssues(text: string, fields: ExtractedField[], rules: FieldRule[]): ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  const requiredKeys = new Set(rules.filter((rule) => rule.required).map((rule) => rule.key));

  fields.forEach((field) => {
    if (!field.value && requiredKeys.has(field.key)) {
      issues.push({
        id: `missing-${field.key}`,
        severity: "warning",
        title: `${field.label} 확인 필요`,
        detail: "원문에서 명시적인 근거를 찾지 못했습니다. 내용을 자동 보완하지 않았습니다.",
      });
    }
  });

  const dimensions = text.match(/\d+(?:\.\d+)?(?:\s*[x×]\s*\d+(?:\.\d+)?){1,2}(?:\s*(?:cm|mm))?/gi) ?? [];
  if (dimensions.some((dimension) => !/(?:cm|mm)\s*$/i.test(dimension))) {
    issues.push({ id: "missing-unit", severity: "error", title: "크기 단위 누락 가능성", detail: "숫자 크기 표현 뒤에 cm 또는 mm 단위가 있는지 확인하세요." });
  }

  const hasLeft = /(좌측|왼쪽|left)/i.test(text);
  const hasRight = /(우측|오른쪽|right)/i.test(text);
  if (hasLeft && hasRight) {
    issues.push({ id: "laterality", severity: "error", title: "좌우 부위 불일치 가능성", detail: "한 결과문에서 좌측과 우측 표현이 함께 발견되었습니다.", evidence: "좌측/우측 표현" });
  }

  const testMentions = text.match(/(?:TTF-1|PD-L1|ALK|EGFR)[^.。\n]*/gi) ?? [];
  if (testMentions.some((mention) => !/(?:positive|negative|양성|음성|detected|not\s+detected|\d+\s*%)/i.test(mention))) {
    issues.push({ id: "test-format", severity: "warning", title: "검사 결과 형식 확인", detail: "검사명에 대응하는 판정 또는 수치 형식이 명확한지 확인하세요." });
  }

  const stageKeys = new Set(STAGE_FIELD_DEFINITIONS.map(({ key }) => key));
  fields.filter((field) => stageKeys.has(field.key as StageReviewKey)).forEach((field) => {
    const key = field.key as StageReviewKey;
    const sourceTokens = extractStageTokens(text, key);
    if (!sourceTokens.length) {
      if (field.value) issues.push({ id: `stage-not-in-source-${key}`, severity: "error", title: `${stageKeyLabel(key)} 원문 불일치`, detail: "원문에 해당 병기 표현이 없어 값을 생성하거나 보완하지 않았습니다." });
      return;
    }
    if (!field.value) {
      issues.push({ id: `stage-missing-${key}`, severity: "warning", title: `${stageKeyLabel(key)} 확인 필요`, detail: "원문에 명시된 값이 추출되지 않았습니다. 병리의사가 원문을 확인해야 합니다." });
      return;
    }
    if (!isStageValueAllowed(field.value, key) || !sourceTokens.some((token) => token.toLowerCase() === field.value?.toLowerCase())) {
      issues.push({ id: `stage-format-${key}`, severity: "error", title: `${stageKeyLabel(key)} 형식 확인`, detail: "허용된 pT/pN/pM 또는 Stage 문자열인지, 원문과 정확히 일치하는지 확인하세요." });
    }
  });

  if (issues.length === 0) {
    issues.push({ id: "source-check", severity: "info", title: "자동 규칙 검사 완료", detail: "명백한 형식 오류는 없지만 담당자의 원문 대조가 필요합니다." });
  }
  return issues;
}

export function analyzeDemo(text: string, kind: AnalyzeKind): AnalyzeResponse {
  const rules = kind === "gross" ? GROSS_RULES : PATHOLOGY_RULES;
  const fields = rules.map((rule) => extractWithEvidence(text, rule));
  return {
    fields,
    issues: buildIssues(text, fields, rules),
    mode: "demo",
    disclaimer: `AI 결과는 진단·판독이 아닌 전사 및 검수 지원용 초안입니다. ${STAGE_REVIEW_DISCLAIMER}`,
  };
}

export function validateEvidence(text: string, response: AnalyzeResponse, kind: AnalyzeKind = "pathology"): AnalyzeResponse {
  const rules = kind === "gross" ? GROSS_RULES : PATHOLOGY_RULES;
  const normalizedResponseFields = rules.map((rule) => response.fields.find((field) => field.key === rule.key) ?? {
    key: rule.key,
    label: rule.label,
    value: null,
    evidence: null,
    evidenceText: null,
    status: "not_found" as const,
  });
  const fields = normalizedResponseFields.map((field) => {
    const evidence = field.evidence ?? field.evidenceText ?? null;
    if (!field.value || !evidence || !text.includes(evidence)) {
      return { ...field, value: null, evidence: null, evidenceText: null, status: "not_found" as const };
    }
    return { ...field, evidence, evidenceText: evidence };
  });
  const stageKeys = new Set(STAGE_FIELD_DEFINITIONS.map(({ key }) => key));
  const stageIssues: ReviewIssue[] = [];
  const safeFields = fields.map((field) => {
    if (field.key === "laterality" && /(?:좌측|왼쪽|left)/i.test(text) && /(?:우측|오른쪽|right)/i.test(text)) {
      const combinedEvidence = text.match(/(?:좌측|왼쪽|left)\s*(?:및|와|과|\/)\s*(?:우측|오른쪽|right)|(?:우측|오른쪽|right)\s*(?:및|와|과|\/)\s*(?:좌측|왼쪽|left)/i)?.[0] ?? null;
      return combinedEvidence
        ? { ...field, value: combinedEvidence, evidence: combinedEvidence, evidenceText: combinedEvidence, status: "needs_review" as const }
        : { ...field, status: "needs_review" as const };
    }
    if (field.key === "immunopathology" && field.value && !/(?:positive|negative|양성|음성|detected|not\s+detected|\d+\s*%)/i.test(field.value)) {
      return { ...field, status: "needs_review" as const };
    }
    if (!stageKeys.has(field.key as StageReviewKey)) return field;
    const key = field.key as StageReviewKey;
    const sourceTokens = extractStageTokens(text, key);
    const valid = Boolean(field.value && field.evidence && sourceTokens.some((token) => token.toLowerCase() === field.value?.toLowerCase()) && isStageValueAllowed(field.value, key));
    if (field.value && !valid) {
      stageIssues.push({ id: `stage-ai-rejected-${key}`, severity: "error", title: `${stageKeyLabel(key)} AI 추론 차단`, detail: "원문에서 그대로 확인되지 않은 병기값은 제거했습니다. 확인 필요 상태로 담당자가 원문을 대조해야 합니다.", origin: "rule" });
      return { ...field, value: null, evidence: null, evidenceText: null, status: "not_found" as const };
    }
    if (!field.value && sourceTokens.length) {
      stageIssues.push({ id: `stage-ai-missing-${key}`, severity: "warning", title: `${stageKeyLabel(key)} 확인 필요`, detail: "원문에 명시된 병기값을 자동 산출하지 않고 null로 유지했습니다.", origin: "rule" });
    }
    return field;
  });
  const hybridIssues = runTextRuleReview(text, kind, safeFields);
  const issues = [...response.issues, ...stageIssues, ...hybridIssues].filter((issue, index, all) => all.findIndex((candidate) => candidate.id === issue.id) === index);
  return { ...response, fields: safeFields, issues, disclaimer: "원문에 명시된 병기 형식만 검수합니다. 교육용 입력 검수이며 AJCC 병기 판정 도구가 아닙니다. 최종 병기 판정은 병리의사가 수행합니다." };
}
