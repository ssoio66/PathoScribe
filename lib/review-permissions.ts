export type ReviewRole = "him" | "pathologist" | "lab" | "quality";

export type ReviewPermissions = {
  canEditSource: boolean;
  canEditConfirmedValues: boolean;
};

export function getReviewPermissions(role: ReviewRole, publicDeployment: boolean | null): ReviewPermissions {
  const isHealthInformationManager = role === "him";
  return {
    // Wait for the runtime status before enabling arbitrary source editing.
    canEditSource: isHealthInformationManager && publicDeployment === false,
    // Confirmed values stay in browser state and are never sent to Gemini or persisted.
    canEditConfirmedValues: isHealthInformationManager,
  };
}
