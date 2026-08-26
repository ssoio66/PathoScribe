import linkageSnapshot from "@/data/processed/ncc-lung-linkage-summary.json";

export const NCC_LUNG_LINKAGE = linkageSnapshot;

export const NCC_LUNG_LINKAGE_DERIVED = {
  egfrKnownRate: linkageSnapshot.statistics.egfr.known / linkageSnapshot.statistics.totalRecords,
  egfrKnownWithHistologyRate: linkageSnapshot.statistics.sameRowAssociations.egfrKnownWithHistologyFlag / linkageSnapshot.statistics.totalRecords,
  strictProxyRate: linkageSnapshot.statistics.sameRowAssociations.egfrKnownWithOperationAndHistologyFlag / linkageSnapshot.statistics.totalRecords,
} as const;
