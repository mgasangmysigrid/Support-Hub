/**
 * Utility functions for document signing status derivation and repair.
 */

export const STALE_FINALIZATION_MS = 3 * 60 * 1000; // 3 minutes

export interface SignerInfo {
  status: string;
  signer_user_id: string;
  signed_at?: string | null;
}

/**
 * Derive the correct document status from signer records AND artifact existence.
 * "completed" requires both all signers signed AND a signed artifact present.
 */
export function deriveDocumentStatus(
  docStatus: string,
  requiresSignature: boolean,
  signers: SignerInfo[],
  hasSignedArtifact?: boolean
): string {
  if (!requiresSignature || signers.length === 0) return docStatus;

  const signedCount = signers.filter((s) => s.status === "signed").length;
  const totalCount = signers.length;

  if (signedCount === totalCount) {
    if (hasSignedArtifact === true) return "completed";
    if (hasSignedArtifact === false) return "needs_repair";
    return docStatus === "completed" ? "completed" : "needs_repair";
  }
  if (signedCount > 0) return "partially_signed";
  return "awaiting_signature";
}

/**
 * Get a user-friendly display status, handling the processing state.
 */
export function getDisplayStatusLabel(
  docStatus: string,
  derivedStatus: string,
  hasSignedArtifact: boolean,
  updatedAt?: string,
  processingState?: string
): string {
  // Use processing_state as primary indicator when available
  if (processingState === "queued" || processingState === "finalizing") {
    return "Finalizing...";
  }
  if (processingState === "failed") {
    return "Needs Repair";
  }

  // Fallback: derive from status + artifact
  if (derivedStatus === "needs_repair" && !hasSignedArtifact) {
    if (updatedAt && docStatus !== "needs_repair") {
      const elapsed = Date.now() - new Date(updatedAt).getTime();
      if (elapsed < STALE_FINALIZATION_MS) {
        return "Finalizing...";
      }
    }
    return "Needs Repair";
  }
  if (docStatus === "needs_repair" || derivedStatus === "needs_repair") return "Needs Repair";
  return derivedStatus;
}

/**
 * Check if a document's stored status is stale compared to signer reality.
 */
export function isStatusStale(
  docStatus: string,
  requiresSignature: boolean,
  signers: SignerInfo[],
  hasSignedArtifact?: boolean
): boolean {
  if (!requiresSignature) return false;
  const derived = deriveDocumentStatus(docStatus, requiresSignature, signers, hasSignedArtifact);
  return derived !== docStatus;
}
