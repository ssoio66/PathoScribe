export type LinkReviewStatus = "proposed" | "confirmed" | "rejected";
export type LinkBasis = "same_specimen_id" | "same_material_id" | "order_reference" | "manual_review";

export interface SyntheticCase {
  caseId: string;
  sourceRecordId: string;
  isSynthetic: true;
}

export interface Specimen {
  specimenId: string;
  caseId: string;
}

export interface SpecimenMaterial {
  materialId: string;
  specimenId: string;
  materialType: "block" | "slide";
}

export interface SurgicalPathologyReport {
  surgicalReportId: string;
  specimenId: string;
}

export interface MolecularTestOrder {
  molecularOrderId: string;
  specimenId: string;
  materialId: string | null;
}

export interface MolecularTestResult {
  molecularResultId: string;
  molecularOrderId: string;
}

export interface PathologyMolecularLink {
  linkId: string;
  surgicalReportId: string;
  molecularResultId: string;
  linkBasis: LinkBasis;
  linkStatus: LinkReviewStatus;
  confirmedBy: "user" | null;
}

export interface PathologyMolecularDataset {
  syntheticCases: SyntheticCase[];
  specimens: Specimen[];
  specimenMaterials: SpecimenMaterial[];
  surgicalPathologyReports: SurgicalPathologyReport[];
  molecularTestOrders: MolecularTestOrder[];
  molecularTestResults: MolecularTestResult[];
  pathologyMolecularLinks: PathologyMolecularLink[];
}

export const PATHOLOGY_MOLECULAR_TARGET_SCHEMA = [
  { table: "synthetic_case", primaryKey: "case_id", foreignKeys: [] },
  { table: "specimen", primaryKey: "specimen_id", foreignKeys: ["case_id -> synthetic_case.case_id"] },
  { table: "specimen_material", primaryKey: "material_id", foreignKeys: ["specimen_id -> specimen.specimen_id"] },
  { table: "surgical_pathology_report", primaryKey: "surgical_report_id", foreignKeys: ["specimen_id -> specimen.specimen_id"] },
  { table: "molecular_test_order", primaryKey: "molecular_order_id", foreignKeys: ["specimen_id -> specimen.specimen_id", "material_id -> specimen_material.material_id"] },
  { table: "molecular_test_result", primaryKey: "molecular_result_id", foreignKeys: ["molecular_order_id -> molecular_test_order.molecular_order_id"] },
  { table: "pathology_molecular_link", primaryKey: "link_id", foreignKeys: ["surgical_report_id -> surgical_pathology_report.surgical_report_id", "molecular_result_id -> molecular_test_result.molecular_result_id"] },
] as const;

export function validatePathologyMolecularDataset(dataset: PathologyMolecularDataset) {
  const issues: string[] = [];
  const uniqueIndex = <T>(rows: T[], getId: (row: T) => string, table: string) => {
    const index = new Map<string, T>();
    for (const row of rows) {
      const id = getId(row);
      if (index.has(id)) issues.push(`${table}: 중복 기본키 ${id}`);
      index.set(id, row);
    }
    return index;
  };

  const cases = uniqueIndex(dataset.syntheticCases, (row) => row.caseId, "synthetic_case");
  const specimens = uniqueIndex(dataset.specimens, (row) => row.specimenId, "specimen");
  const materials = uniqueIndex(dataset.specimenMaterials, (row) => row.materialId, "specimen_material");
  const reports = uniqueIndex(dataset.surgicalPathologyReports, (row) => row.surgicalReportId, "surgical_pathology_report");
  const orders = uniqueIndex(dataset.molecularTestOrders, (row) => row.molecularOrderId, "molecular_test_order");
  const results = uniqueIndex(dataset.molecularTestResults, (row) => row.molecularResultId, "molecular_test_result");
  uniqueIndex(dataset.pathologyMolecularLinks, (row) => row.linkId, "pathology_molecular_link");

  for (const row of dataset.syntheticCases) {
    if (!row.isSynthetic) issues.push(`${row.caseId}: 합성데이터 표시가 필요합니다.`);
  }
  for (const row of dataset.specimens) {
    if (!cases.has(row.caseId)) issues.push(`${row.specimenId}: 존재하지 않는 case_id ${row.caseId}`);
  }
  for (const row of dataset.specimenMaterials) {
    if (!specimens.has(row.specimenId)) issues.push(`${row.materialId}: 존재하지 않는 specimen_id ${row.specimenId}`);
  }
  for (const row of dataset.surgicalPathologyReports) {
    if (!specimens.has(row.specimenId)) issues.push(`${row.surgicalReportId}: 존재하지 않는 specimen_id ${row.specimenId}`);
  }
  for (const row of dataset.molecularTestOrders) {
    if (!specimens.has(row.specimenId)) issues.push(`${row.molecularOrderId}: 존재하지 않는 specimen_id ${row.specimenId}`);
    if (row.materialId) {
      const material = materials.get(row.materialId);
      if (!material) issues.push(`${row.molecularOrderId}: 존재하지 않는 material_id ${row.materialId}`);
      else if (material.specimenId !== row.specimenId) issues.push(`${row.molecularOrderId}: material과 order의 specimen_id가 다릅니다.`);
    }
  }
  for (const row of dataset.molecularTestResults) {
    if (!orders.has(row.molecularOrderId)) issues.push(`${row.molecularResultId}: 존재하지 않는 molecular_order_id ${row.molecularOrderId}`);
  }
  for (const link of dataset.pathologyMolecularLinks) {
    const report = reports.get(link.surgicalReportId);
    const result = results.get(link.molecularResultId);
    const order = result ? orders.get(result.molecularOrderId) : undefined;
    if (!report) issues.push(`${link.linkId}: 존재하지 않는 surgical_report_id ${link.surgicalReportId}`);
    if (!result) issues.push(`${link.linkId}: 존재하지 않는 molecular_result_id ${link.molecularResultId}`);
    if (report && order && report.specimenId !== order.specimenId) issues.push(`${link.linkId}: 보고서와 분자검사 의뢰의 specimen_id가 다릅니다.`);
    if (link.linkStatus === "confirmed" && link.confirmedBy !== "user") issues.push(`${link.linkId}: 확정은 사용자 확인으로만 가능합니다.`);
  }

  return issues;
}
