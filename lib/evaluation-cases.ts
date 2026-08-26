import evaluationData from "@/data/evaluation/evaluation-cases.json";

export type EvaluationCaseType = "gross" | "pathology" | "outsourced";

export function findEvaluationCase(caseId: string, caseType?: EvaluationCaseType) {
  const item = evaluationData.cases.find((candidate) => candidate.caseId === caseId);
  if (!item || (caseType && item.caseType !== caseType)) return null;
  return item;
}

export function findEvaluationCaseBySourceRowId(sourceRowId: string, caseType?: EvaluationCaseType) {
  const item = evaluationData.cases.find((candidate) => candidate.sourceRowId === sourceRowId);
  if (!item || (caseType && item.caseType !== caseType)) return null;
  return item;
}

export function getEvaluationCaseVersion(caseId: string) {
  const item = findEvaluationCase(caseId);
  return item ? `${evaluationData.fixtureVersion}:${item.templateVersion}` : null;
}
