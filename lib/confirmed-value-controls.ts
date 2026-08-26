import type { AnalyzeKind } from "./types";

export const OTHER_CONFIRMED_VALUE = "__other_confirmed_value__";

export type ConfirmedValueOption = {
  value: string;
  label: string;
  aliases?: string[];
};

export type ConfirmedValueControl = {
  type: "select" | "text";
  options: ConfirmedValueOption[];
  allowOther: boolean;
  inputMode?: "text" | "decimal";
  hint: string;
};

type ControlDefinition = Omit<ConfirmedValueControl, "options"> & { options?: ConfirmedValueOption[]; includeSource?: boolean };

const option = (value: string, english?: string, aliases?: string[]): ConfirmedValueOption => ({ value, label: english ? `${value} (${english})` : value, aliases });
const LATERALITY_OPTIONS = [option("좌측", "left"), option("우측", "right"), option("양측", "bilateral")];
const SITE_OPTIONS = [option("상엽", "upper lobe"), option("중엽", "middle lobe"), option("하엽", "lower lobe"), option("기관지", "bronchus"), option("말초", "peripheral"), option("문부", "hilum")];
const DIAGNOSIS_OPTIONS = [option("선암", "adenocarcinoma"), option("편평세포암", "squamous cell carcinoma"), option("소세포암", "small cell carcinoma"), option("대세포암", "large cell carcinoma")];
const HISTOLOGIC_TYPE_OPTIONS = [option("선방형", "acinar"), option("유두형", "papillary"), option("고형형", "solid"), option("편평세포형", "squamous"), option("대세포형", "large cell"), option("미세유두형", "micropapillary"), option("각질화형", "keratinizing")];

const DEFAULT_TEXT: ControlDefinition = {
  type: "text",
  allowOther: false,
  inputMode: "text",
  hint: "원문 표기를 확인한 뒤 담당자 확정값에 직접 입력합니다.",
};

const CONTROLS: Partial<Record<AnalyzeKind, Record<string, ControlDefinition>>> = {
  gross: {
    organ: { type: "select", options: [option("폐", "lung")], allowOther: true, includeSource: true, hint: "교육용 입력 후보입니다. 원문에 다른 장기가 명시되면 기타로 직접 입력합니다." },
    site: { type: "select", options: SITE_OPTIONS, allowOther: true, includeSource: true, hint: "원문 표현과 일치하는 부위를 선택하거나 기타로 직접 입력합니다." },
    laterality: { type: "select", options: LATERALITY_OPTIONS, allowOther: false, includeSource: true, hint: "좌우는 고위험 항목입니다. 원문에 있는 표현만 직접 선택합니다." },
    cutSurface: { type: "select", options: [option("회백색", "gray-white"), option("황백색", "yellow-white"), option("단단함", "firm"), option("연함", "soft")], allowOther: true, includeSource: true, hint: "원문에 없는 절단면 소견은 선택하거나 보완하지 않습니다." },
    size: { ...DEFAULT_TEXT, inputMode: "text", hint: "크기와 단위는 원문 표기 그대로 확인하여 입력합니다." },
    count: { ...DEFAULT_TEXT, inputMode: "decimal", hint: "검체 수는 원문 표기와 단위를 함께 확인하여 입력합니다." },
    blockCount: { ...DEFAULT_TEXT, inputMode: "decimal", hint: "블록 수는 원문에 명시된 경우에만 입력합니다." },
  },
  pathology: {
    organ: { type: "select", options: [option("폐", "lung")], allowOther: true, includeSource: true, hint: "교육용 입력 후보입니다. 원문에 다른 장기가 명시되면 기타로 직접 입력합니다." },
    site: { type: "select", options: SITE_OPTIONS, allowOther: true, includeSource: true, hint: "원문 표현과 일치하는 부위를 선택하거나 기타로 직접 입력합니다." },
    laterality: { type: "select", options: LATERALITY_OPTIONS, allowOther: false, includeSource: true, hint: "좌우는 고위험 항목입니다. 원문에 있는 표현만 직접 선택합니다." },
    procedure: { type: "select", options: [option("엽절제", "lobectomy"), option("쐐기 절제", "wedge resection"), option("분절 절제", "segmentectomy"), option("생검", "biopsy")], allowOther: true, includeSource: true, hint: "원문에 명시된 시술 또는 수술 종류만 선택합니다." },
    diagnosis: { type: "select", options: DIAGNOSIS_OPTIONS, allowOther: true, includeSource: true, hint: "교육용 용어 후보입니다. 진단명을 새로 만들거나 추정하지 않습니다." },
    histologicType: { type: "select", options: HISTOLOGIC_TYPE_OPTIONS, allowOther: true, includeSource: true, hint: "조직학적 유형은 원문에 명시된 표현만 선택하거나 직접 입력합니다." },
    grade: { type: "select", options: [option("고분화", "well differentiated"), option("중등도 분화", "moderately differentiated"), option("저분화", "poorly differentiated"), option("Grade 1"), option("Grade 2"), option("Grade 3")], allowOther: true, includeSource: true, hint: "분화도는 원문 표기를 확인한 뒤 선택합니다." },
    margin: { type: "select", options: [option("음성", "negative"), option("양성", "positive"), option("절제연 미침범", "uninvolved"), option("절제연 침범", "involved"), option("평가 불가", "not assessable")], allowOther: false, includeSource: true, hint: "절제연은 고위험 항목입니다. 원문에 있는 표현만 직접 선택합니다." },
    pathologicT: { type: "select", options: [], allowOther: false, includeSource: true, hint: "pT는 원문에서 추출된 값만 선택합니다. 병기를 산출하지 않습니다." },
    pathologicN: { type: "select", options: [], allowOther: false, includeSource: true, hint: "pN은 원문에서 추출된 값만 선택합니다. 병기를 산출하지 않습니다." },
    pathologicM: { type: "select", options: [], allowOther: false, includeSource: true, hint: "pM은 원문에서 추출된 값만 선택합니다. 병기를 산출하지 않습니다." },
    pathologicStage: { type: "select", options: [], allowOther: false, includeSource: true, hint: "Stage는 원문에서 추출된 값만 선택합니다. 조합 또는 산출하지 않습니다." },
    tumorSize: { ...DEFAULT_TEXT, inputMode: "text", hint: "종양 크기와 단위는 원문 표기 그대로 확인하여 입력합니다." },
    lymphNodes: { ...DEFAULT_TEXT, inputMode: "text", hint: "림프절 분자·분모는 원문 표기 그대로 확인하여 입력합니다." },
    immunopathology: { ...DEFAULT_TEXT, inputMode: "text", hint: "면역표지자와 결과는 고위험 정보입니다. 자동 수정하지 않습니다." },
    molecularPathology: { ...DEFAULT_TEXT, inputMode: "text", hint: "유전자명과 변이 결과는 고위험 정보입니다. 자동 수정하지 않습니다." },
  },
};

function mergeOptions(options: ConfirmedValueOption[], sourceValue: string | null, includeSource?: boolean) {
  const merged = [...options];
  const source = sourceValue?.trim();
  if (source && !merged.some((candidate) => candidate.value === source || candidate.aliases?.includes(source))) {
    merged.push({ value: source, label: source });
  }
  return includeSource ? merged : options;
}

export function getConfirmedValueControl(kind: AnalyzeKind, fieldKey: string, sourceValue: string | null): ConfirmedValueControl {
  if (!sourceValue?.trim()) {
    return {
      type: "text",
      options: [],
      allowOther: false,
      inputMode: "text",
      hint: "원문에 근거가 없어 빈 값으로 유지합니다. 원문 확인 후 담당자가 직접 입력합니다.",
    };
  }
  const definition = CONTROLS[kind]?.[fieldKey] ?? DEFAULT_TEXT;
  const options = mergeOptions(definition.options ?? [], sourceValue, definition.includeSource);
  return {
    type: definition.type,
    options,
    allowOther: definition.allowOther,
    inputMode: definition.inputMode,
    hint: definition.hint,
  };
}

export function isConfirmedValueOption(control: ConfirmedValueControl, value: string | null) {
  return Boolean(value && control.options.some((option) => option.value === value || option.aliases?.includes(value)));
}

export function canonicalConfirmedValueOption(control: ConfirmedValueControl, value: string | null) {
  if (!value) return null;
  return control.options.find((option) => option.value === value || option.aliases?.includes(value))?.value ?? null;
}
