import snapshot from "@/data/processed/ncc-lung-immunopathology.json";

type ImmunopathologyTarget = {
  name: string;
  observedRows: number;
  observedCountSum: number;
  patientCountSum: number;
  years: string[];
};

type ImmunopathologySnapshot = {
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
  quality: { distributionAvailable: boolean; warning: string | null };
  statistics: {
    apiRows: number;
    namedRows: number;
    unnamedRows: number;
    uniqueTargets: number;
    observedCountSum: number;
    patientCountSum: number;
    yearRange: { from: string; to: string } | null;
  };
  targets: ImmunopathologyTarget[];
};

export const NCC_LUNG_IMMUNOPATHOLOGY = snapshot as ImmunopathologySnapshot;
