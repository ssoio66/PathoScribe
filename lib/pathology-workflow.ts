export type WorkflowSourceType = "public_synthetic" | "generated_demo" | "public_aggregate" | "reference_metadata";

export interface WorkflowOrder {
  order_id: string;
  source_record_id: string;
  order_category: string;
  requested_workflow: string;
  workflow_sequence: number;
  review_status: string;
  source_type: WorkflowSourceType;
}

export interface WorkflowSpecimen {
  specimen_id: string;
  order_id: string;
  source_record_id: string;
  organ: string;
  specimen_category: string;
  laterality: string;
  specimen_count: number;
  source_type: WorkflowSourceType;
}

export interface WorkflowGrossDescription {
  gross_description_id: string;
  order_id: string;
  specimen_id: string;
  source_record_id: string;
  gross_text: string;
  lesion_location: string;
  margin_description: string;
  review_status: string;
  source_type: WorkflowSourceType;
}

export interface WorkflowBlock {
  block_id: string;
  order_id: string;
  specimen_id: string;
  source_record_id: string;
  block_label: string;
  material_type: string;
  purpose: string;
  source_type: WorkflowSourceType;
}

export interface WorkflowReport {
  report_id: string;
  order_id: string;
  specimen_id: string;
  source_record_id: string;
  histology_source_flags: string[];
  histology_flag_status: string;
  stage_t_source_flags: string[];
  stage_n_source_flags: string[];
  stage_m_source_flags: string[];
  stage_flag_status: { t: string; n: string; m: string };
  operation_source_value: number;
  report_status: string;
  source_type: WorkflowSourceType;
}

export interface WorkflowAncillaryResult {
  order_id: string;
  specimen_id: string;
  block_id: string;
  report_id: string;
  source_record_id: string;
  source_type: WorkflowSourceType;
  [key: string]: unknown;
}

export interface WorkflowTranscriptionReview {
  review_id: string;
  order_id: string;
  specimen_id: string;
  gross_description_id: string;
  report_id: string;
  ihc_result_id: string;
  molecular_result_id: string;
  outsourced_id: string;
  source_record_id: string;
  reviewer_role: string;
  review_step: string;
  review_status: string;
  confirmed_value_policy: string;
  issue_count: number;
  source_type: WorkflowSourceType;
}

export interface WorkflowPreviewCase {
  partition: "train" | "test";
  order: WorkflowOrder;
  specimen: WorkflowSpecimen;
  gross_description: WorkflowGrossDescription;
  blocks: WorkflowBlock[];
  pathology_report: WorkflowReport;
  immunohistochemistry_result: WorkflowAncillaryResult;
  molecular_pathology_result: WorkflowAncillaryResult;
  outsourced_test_result: WorkflowAncillaryResult;
  transcription_review: WorkflowTranscriptionReview;
}

export interface WorkflowPreviewResponse {
  generated_at: string;
  all_ids_are_virtual: true;
  table_counts: Record<string, number>;
  cases: WorkflowPreviewCase[];
  disclaimer: string;
}
