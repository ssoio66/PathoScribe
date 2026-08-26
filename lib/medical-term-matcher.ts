export type MatchableMedicalTerm = {
  term: string;
  normalizedTerm: string;
  aliases: string[];
};

const HIGH_RISK_FIELD_KEYS = new Set([
  "specimen",
  "laterality",
  "size",
  "tumorSize",
  "margin",
  "lymphNodes",
  "pathologicT",
  "pathologicN",
  "pathologicM",
  "pathologicStage",
  "immunopathology",
  "molecularPathology",
  "order_number",
  "test_name",
]);

const HIGH_RISK_VALUE_PATTERN = /\b(?:positive|negative|detected|not detected|left|right|pT|pN|pM|stage|EGFR|ALK|KRAS|TTF-1|p40|PD-L1)\b/i;

export function normalizeMedicalTerm(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("en").replace(/[^0-9a-z가-힣+.-]+/gi, "").trim();
}

export function medicalTermEditDistance(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    let diagonal = previous[0];
    previous[0] = row;
    for (let column = 1; column <= right.length; column += 1) {
      const above = previous[column];
      previous[column] = left[row - 1] === right[column - 1]
        ? diagonal
        : Math.min(diagonal + 1, previous[column] + 1, previous[column - 1] + 1);
      diagonal = above;
    }
  }
  return previous[right.length];
}

export function findMedicalTermCandidates<T extends MatchableMedicalTerm>(value: string, terms: T[]) {
  const normalized = normalizeMedicalTerm(value);
  if (!normalized) return { exact: null as T | null, candidates: [] as T[] };
  const exact = terms.find((term) => term.normalizedTerm === normalized || term.aliases.some((alias) => normalizeMedicalTerm(alias) === normalized)) ?? null;
  const candidates = terms
    .filter((term) => term.normalizedTerm.length >= 5 && Math.abs(term.normalizedTerm.length - normalized.length) <= 3)
    .map((term) => ({ term, distance: medicalTermEditDistance(normalized, term.normalizedTerm) }))
    .filter(({ term, distance }) => distance <= Math.max(1, Math.floor(Math.min(normalized.length, term.normalizedTerm.length) * 0.2)))
    .sort((left, right) => left.distance - right.distance || left.term.term.localeCompare(right.term.term))
    .slice(0, 3)
    .map(({ term }) => term);
  return { exact, candidates };
}

export function isHighRiskMedicalTerm(fieldName: string, value: string | null) {
  return HIGH_RISK_FIELD_KEYS.has(fieldName) || Boolean(value && HIGH_RISK_VALUE_PATTERN.test(value));
}
