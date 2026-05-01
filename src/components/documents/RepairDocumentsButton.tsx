import { useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { repairDocument } from "@/lib/document-finalization";
import { toast } from "sonner";
import { Wrench, Loader2 } from "lucide-react";

/**
 * Admin-only button to find and repair documents stuck in stale/failed status.
 * Uses the backend finalize-document function for repair.
 */
export default function RepairDocumentsButton() {
  const [repairing, setRepairing] = useState(false);

  const handleRepair = async () => {
    setRepairing(true);
    let repaired = 0;
    let failed = 0;

    try {
      // Find documents that need repair:
      // 1. processing_state = failed
      // 2. requires_signature with non-completed status where signers are all signed
      const { data: docs } = await supabase
        .from("documents")
        .select("id, status, processing_state, requires_signature, signed_file_path")
        .eq("requires_signature", true)
        .or("processing_state.eq.failed,status.in.(awaiting_signature,partially_signed,needs_repair)");

      if (!docs?.length) {
        toast.info("No documents need repair");
        setRepairing(false);
        return;
      }

      for (const doc of docs) {
        try {
          // Check if signers indicate all signed
          const { data: signers } = await supabase
            .from("document_signers")
            .select("status")
            .eq("document_id", doc.id);

          if (!signers?.length) continue;

          const signedCount = signers.filter((s) => s.status === "signed").length;
          const allSigned = signedCount === signers.length;

          // Only repair if: processing failed, or all signed but not completed
          if (!allSigned && doc.processing_state !== "failed") continue;

          const result = await repairDocument(doc.id);
          if (result.success) {
            repaired++;
          } else {
            failed++;
          }
        } catch (docErr) {
          console.error(`[RepairDocs] Failed doc ${doc.id}:`, docErr);
          failed++;
        }
      }

      if (repaired > 0) {
        toast.success(`Repaired ${repaired} document(s)`, {
          description: failed > 0 ? `${failed} failed` : undefined,
        });
      } else if (failed > 0) {
        toast.error(`Failed to repair ${failed} document(s)`);
      } else {
        toast.info("No documents needed repair");
      }
    } catch (err: any) {
      console.error("[RepairDocs] Error:", err);
      toast.error("Repair failed", { description: err.message });
    } finally {
      setRepairing(false);
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={handleRepair} disabled={repairing} className="gap-1.5">
      {repairing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wrench className="h-3.5 w-3.5" />}
      {repairing ? "Repairing..." : "Repair Documents"}
    </Button>
  );
}
