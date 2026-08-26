import snapshot from "@/data/processed/ncc-lung-diagnosis-reference.json";

export type DiagnosisReferenceTarget = {
  code: string;
  name: string;
  raw: string;
  observedRows: number;
  centers: string[];
  years: string[];
};

type DiagnosisReferenceSnapshot = {
  fetchedAt: string;
  source: {
    provider: string;
    service: string;
    sourcePage: string;
    endpoint: string;
    license: string;
  };
  interpretation: string;
  filters: { centerNm: string; fromYear: string; toYear: string };
  statistics: {
    apiRows: number;
    uniqueTargets: number;
    centers: string[];
    yearRange: { from: string; to: string } | null;
  };
  targets: DiagnosisReferenceTarget[];
};

export const NCC_LUNG_DIAGNOSIS_REFERENCE = snapshot as DiagnosisReferenceSnapshot;
