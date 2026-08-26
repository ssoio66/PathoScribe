import snapshot from "@/data/processed/ncc-lung-bronchoscopy.json";

type BronchoscopyTarget = {
  name: string;
  observedRows: number;
  observedCountSum: number;
  patientCountSum: number;
  years: string[];
};

type BronchoscopySnapshot = {
  fetchedAt: string;
  source: { provider: string; service: string; sourcePage: string; endpoint: string; license: string };
  interpretation: string;
  allowedUse: string;
  prohibitedUse: string;
  filters: { centerNm: string; fromYear: string; toYear: string };
  quality: { distributionAvailable: boolean; warning: string | null };
  statistics: { apiRows: number; namedRows: number; unnamedRows: number; uniqueTargets: number; observedCountSum: number; patientCountSum: number; yearRange: { from: string; to: string } | null };
  targets: BronchoscopyTarget[];
};

export const NCC_LUNG_BRONCHOSCOPY = snapshot as BronchoscopySnapshot;
