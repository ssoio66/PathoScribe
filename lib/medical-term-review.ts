import fs from "node:fs";
import path from "node:path";
import { NCC_LUNG_DIAGNOSIS_REFERENCE } from "@/lib/data/ncc-lung-diagnosis-reference";
import { NCC_LUNG_IMMUNOPATHOLOGY } from "@/lib/data/ncc-lung-immunopathology";
import { NCC_LUNG_REGISTRY_METADATA } from "@/lib/data/ncc-lung-registry-metadata";
import { PROJECT_RAG_ENTRIES } from "@/lib/data/project-rag";
import { findMedicalTermCandidates, isHighRiskMedicalTerm, normalizeMedicalTerm } from "@/lib/medical-term-matcher";
import type { AnalyzeKind, ExtractedField, MedicalTermCandidate, MedicalTermReview } from "@/lib/types";

type DictionaryCorpus = {
  generatedAt: string;
  source: { collection: string };
  entries: Array<{ id: string; termKo: string; termEn: string | null }>;
};

type LocalTerm = MedicalTermCandidate & { aliases: string[] };

const DICTIONARY_PATH = path.join(process.cwd(), "data", "processed", "cancer-dictionary-rag.json");
const TERM_VERSION = "pathoscribe-local-terms-v1.1";
const KNOWN_TERMS = [
  ["adenocarcinoma", "선암", "histology"],
  ["squamous cell carcinoma", "편평상피세포암", "histology"],
  ["small cell carcinoma", "소세포암", "histology"],
  ["large cell carcinoma", "대세포암", "histology"],
  ["acinar predominant type", "선방 우세형", "histologic_type"],
  ["keratinizing type", "각화형", "histologic_type"],
  ["large cell type", "대세포형", "histologic_type"],
  ["폐", "lung", "organ"],
  ["우측", "right", "laterality"],
  ["좌측", "left", "laterality"],
  ["상엽", "upper lobe", "site"],
  ["중엽", "middle lobe", "site"],
  ["하엽", "lower lobe", "site"],
  ["생검", "biopsy", "procedure"],
  ["절제술", "resection", "procedure"],
  ["폐 생검", "lung biopsy", "specimen"],
  ["폐 절제술", "lung resection", "specimen"],
  ["TTF-1", "TTF-1", "immunopathology"],
  ["p40", "p40", "immunopathology"],
  ["PD-L1", "PD-L1", "immunopathology"],
  ["EGFR", "EGFR", "molecular_pathology"],
  ["ALK", "ALK", "molecular_pathology"],
  ["KRAS", "KRAS", "molecular_pathology"],
] as const;

let termCache: LocalTerm[] | null = null;

function addTerm(terms: LocalTerm[], term: string | null | undefined, category: string, source: string, sourceVersion: string, aliases: string[] = []) {
  const clean = term?.trim();
  if (!clean || (!/[가-힣]/.test(clean) && normalizeMedicalTerm(clean).length < 3)) return;
  terms.push({ term: clean, normalizedTerm: normalizeMedicalTerm(clean), category, source, sourceVersion, aliases, caseSensitive: false });
}

function loadTerms() {
  if (termCache) return termCache;
  const terms: LocalTerm[] = [];
  let dictionary: DictionaryCorpus | null = null;
  try {
    if (fs.existsSync(DICTIONARY_PATH)) dictionary = JSON.parse(fs.readFileSync(DICTIONARY_PATH, "utf8")) as DictionaryCorpus;
  } catch {
    dictionary = null;
  }
  for (const entry of dictionary?.entries ?? []) {
    addTerm(terms, entry.termKo, "cancer_dictionary", dictionary?.source.collection ?? "암정보사전", dictionary?.generatedAt ?? TERM_VERSION, entry.termEn ? [entry.termEn] : []);
    addTerm(terms, entry.termEn, "cancer_dictionary", dictionary?.source.collection ?? "암정보사전", dictionary?.generatedAt ?? TERM_VERSION, entry.termKo ? [entry.termKo] : []);
  }
  for (const [term, alias, category] of KNOWN_TERMS) addTerm(terms, term, category, "PathoScribe 병리 용어 목록", TERM_VERSION, [alias]);
  for (const target of NCC_LUNG_DIAGNOSIS_REFERENCE.targets) addTerm(terms, target.name, "detailed_diagnosis", "폐암 세부진단 종류별 공개데이터", NCC_LUNG_DIAGNOSIS_REFERENCE.fetchedAt, [target.code, target.raw]);
  for (const target of NCC_LUNG_IMMUNOPATHOLOGY.targets) addTerm(terms, target.name, "immunopathology", "폐암 면역병리 종류별 공개데이터", NCC_LUNG_IMMUNOPATHOLOGY.fetchedAt);
  for (const table of NCC_LUNG_REGISTRY_METADATA.tables) {
    for (const field of table.fields) addTerm(terms, field.columnName, "registry_metadata", "폐암 레지스트리 메타정보", NCC_LUNG_REGISTRY_METADATA.generatedAt, [field.columnId]);
  }
  for (const entry of PROJECT_RAG_ENTRIES) addTerm(terms, entry.title, "project_dictionary", "PathoScribe 자체 데이터 사전", entry.source.asOf);
  termCache = terms.filter((term, index, all) => all.findIndex((candidate) => candidate.normalizedTerm === term.normalizedTerm && candidate.category === term.category) === index);
  return termCache;
}

export function buildMedicalTermReviews(fields: ExtractedField[], kind: AnalyzeKind): MedicalTermReview[] {
  const terms = loadTerms();
  const relevant = fields.filter((field) => kind === "pathology"
    ? ["diagnosis", "histologicType", "specimen", "organ", "laterality", "site", "procedure", "immunopathology", "molecularPathology", "pathologicT", "pathologicN", "pathologicM", "pathologicStage"].includes(field.key)
    : ["organ", "specimen", "site", "laterality"].includes(field.key));
  return relevant.map((field) => {
    const value = field.value?.trim() || null;
    const evidenceText = field.evidenceText ?? field.evidence ?? null;
    const highRisk = isHighRiskMedicalTerm(field.key, value);
    if (!value) {
      return { suggestionId: `term-${kind}-${field.key}`, fieldName: field.key, originalValue: null, suggestedValue: null, suggestionType: "not_found", riskLevel: highRisk ? "high" : "low", evidenceText, source: "로컬 병리 용어 목록", sourceVersion: TERM_VERSION, status: "needs_review", candidates: [] };
    }
    const { exact, candidates } = findMedicalTermCandidates(value, terms);
    if (exact) {
      return { suggestionId: `term-${kind}-${field.key}`, fieldName: field.key, originalValue: value, suggestedValue: null, suggestionType: "exact_match", riskLevel: highRisk ? "high" : "low", evidenceText, source: exact.source, sourceVersion: exact.sourceVersion, status: "pending", candidates: [exact] };
    }
    if (highRisk) {
      const evidenceMatches = Boolean(evidenceText && normalizeMedicalTerm(evidenceText).includes(normalizeMedicalTerm(value)));
      return { suggestionId: `term-${kind}-${field.key}`, fieldName: field.key, originalValue: value, suggestedValue: null, suggestionType: evidenceMatches ? "high_risk_match" : "high_risk_mismatch", riskLevel: "high", evidenceText, source: "원문 근거 대조", sourceVersion: TERM_VERSION, status: evidenceMatches ? "pending" : "needs_review", candidates };
    }
    const suggestion = candidates[0] ?? null;
    return { suggestionId: `term-${kind}-${field.key}`, fieldName: field.key, originalValue: value, suggestedValue: suggestion?.term ?? null, suggestionType: suggestion ? "possible_typo" : "not_found", riskLevel: "low", evidenceText, source: suggestion?.source ?? "로컬 병리 용어 목록", sourceVersion: suggestion?.sourceVersion ?? TERM_VERSION, status: suggestion ? "pending" : "needs_review", candidates };
  });
}
