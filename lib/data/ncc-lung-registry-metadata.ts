import snapshot from "@/data/processed/ncc-lung-registry-metadata.json";

export const NCC_LUNG_REGISTRY_METADATA = snapshot;

export const NCC_LUNG_REGISTRY_DERIVED = {
  surgicalPathologyBaseCount: snapshot.mappings.dashboard[0]?.denominatorReportedCount ?? 0,
  dashboardFields: snapshot.mappings.dashboard,
} as const;
