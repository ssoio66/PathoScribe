import snapshot from "@/data/processed/ncc-lung-pathologic-stages.json";

export type PathologicStageTarget = {
  value: string;
  observedRows: number;
  observedCountSum: number;
  patientCountSum: number;
  years: string[];
};

type PathologicStageSnapshot = {
  fetchedAt: string;
  source: {
    provider: string;
    service: string;
    sourcePage: string;
    endpoint: string;
    license: string;
  };
  interpretation: string;
  allowedUse: string;
  prohibitedUse: string;
  filters: { centerNm: string; fromYear: string; toYear: string };
  quality: { referenceAvailable: boolean; warning: string | null };
  statistics: {
    apiRows: number;
    namedRows: number;
    unnamedRows: number;
    uniqueTargets: number;
    observedCountSum: number;
    patientCountSum: number;
    yearRange: { from: string; to: string } | null;
  };
  targets: PathologicStageTarget[];
};

export const NCC_LUNG_PATHOLOGIC_STAGES = snapshot as PathologicStageSnapshot;
