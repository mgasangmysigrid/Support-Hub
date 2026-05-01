import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, FileText, ExternalLink, Loader2, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { PdfInlineViewer } from "@/components/PdfInlineViewer";
import { generateSignedPdf } from "@/lib/pdf-signer";
import { getSignedFileUrl } from "@/lib/document-finalization";
import { toast } from "sonner";
import { deriveDocumentStatus, getDisplayStatusLabel } from "@/lib/document-utils";

const DOC_STATUS_LABELS: Record<string, string> = {
  issued: "Issued",
  awaiting_signature: "Awaiting Signature",
  partially_signed: "Partially Signed",
  fully_signed: "Fully Signed",
  completed: "Completed",
  declined: "Declined",
  archived: "Archived",
  finalizing: "Finalizing",
  needs_repair: "Needs Repair",
};

const DOC_TYPE_LABELS: Record<string, string> = {
  employment_contract: "Employment Contract",
  equipment_liability: "Equipment Liability",
  nda: "NDA",
  policy_acknowledgement: "Policy Acknowledgement",
  hr_notice: "HR Notice",
  other: "Other",
};

interface Props {
  document: any;
  open: boolean;
  onClose: () => void;
}

export default function DocumentViewerDialog({ document: doc, open, onClose }: Props) {
  const [loadingSignedUrl, setLoadingSignedUrl] = useState(false);

  const { data: signers } = useQuery({
    queryKey: ["doc-signers", doc.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_signers")
        .select("*, signer:profiles!document_signers_signer_user_id_fkey(full_name)")
        .eq("document_id", doc.id)
        .order("signing_order");
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  const signedFilePath = (doc as any).signed_file_path as string | null;
  const { data: freshSignedUrl } = useQuery({
    queryKey: ["signed-url", doc.id, signedFilePath],
    queryFn: () => getSignedFileUrl(signedFilePath),
    enabled: open && !!signedFilePath,
    staleTime: 30 * 60 * 1000,
  });

  const isPdf = doc.file_name?.toLowerCase().endsWith(".pdf") || doc.mime_type === "application/pdf";
  const isImage = doc.mime_type?.startsWith("image/");

  const hasSignedArtifact = !!signedFilePath;
  const derivedStatus = signers?.length
    ? deriveDocumentStatus(doc.status, doc.requires_signature, signers, hasSignedArtifact)
    : doc.status;
  const displayLabel = getDisplayStatusLabel(doc.status, derivedStatus, hasSignedArtifact, doc.updated_at, doc.processing_state);

  // Detect "all signed but no artifact" state for banner
  const allSignersSigned = signers?.length ? signers.every((s: any) => s.status === "signed") : false;
  const showSignedButNoArtifact = doc.requires_signature && allSignersSigned && !hasSignedArtifact;

  // Use fresh signed URL if available; otherwise fall back to original
  const isSigned = doc.requires_signature && ["completed", "partially_signed", "fully_signed"].includes(derivedStatus);
  const viewFileUrl = (isSigned && freshSignedUrl) ? freshSignedUrl : doc.file_url;

  const handleDownloadSigned = async () => {
    try {
      if (signedFilePath) {
        setLoadingSignedUrl(true);
        const url = await getSignedFileUrl(signedFilePath);
        setLoadingSignedUrl(false);
        if (url) {
          window.open(url, "_blank");
          return;
        }
      }
      toast.info("Generating signed document...");
      const { data: sigs } = await supabase.from("document_signatures")
        .select("*, signer:profiles!document_signatures_signer_user_id_fkey(full_name)")
        .eq("document_id", doc.id);
      const { data: allFields } = await supabase.from("document_signature_fields").select("*").eq("document_id", doc.id);
      const { data: signerData } = await supabase.from("document_signers")
        .select("*, signer:profiles!document_signers_signer_user_id_fkey(full_name)")
        .eq("document_id", doc.id);
      const pdfBytes = await generateSignedPdf(doc.file_url, allFields ?? [], sigs ?? [], signerData ?? []);
      const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = window.document.createElement("a");
      a.href = url; a.download = `signed-${doc.file_name || "document.pdf"}`; a.click();
      URL.revokeObjectURL(url);
      toast.success("Signed PDF downloaded");
    } catch (err: any) {
      toast.error("Failed to generate signed PDF", { description: err.message });
    } finally {
      setLoadingSignedUrl(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            {doc.title}
          </DialogTitle>
          <DialogDescription>
            {DOC_TYPE_LABELS[doc.document_type] || doc.document_type} — {displayLabel}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Signed but no artifact banner */}
          {showSignedButNoArtifact && (
            <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-amber-700">
                  {displayLabel === "Finalizing..." 
                    ? "This document has been signed and the finalized PDF is being generated."
                    : "This document has been signed, but the finalized PDF was not generated successfully. An admin can use the Repair action to regenerate it."}
                </p>
              </div>
            </div>
          )}

          {/* Metadata */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <p className="text-xs text-muted-foreground">Type</p>
              <p className="text-sm font-medium">{DOC_TYPE_LABELS[doc.document_type] || doc.document_type}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Status</p>
              <Badge variant="outline" className="text-xs mt-0.5">
                {displayLabel}
              </Badge>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Issued</p>
              <p className="text-sm">{format(new Date(doc.created_at), "MMM d, yyyy")}</p>
            </div>
            {doc.due_date && (
              <div>
                <p className="text-xs text-muted-foreground">Due Date</p>
                <p className="text-sm">{format(new Date(doc.due_date), "MMM d, yyyy")}</p>
              </div>
            )}
          </div>

          {doc.description && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Description</p>
              <p className="text-sm">{doc.description}</p>
            </div>
          )}

          {/* Signers */}
          {doc.requires_signature && signers && signers.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-2">Signers</p>
              <div className="space-y-2">
                {signers.map((s: any) => (
                  <div key={s.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="text-sm font-medium">{s.signer?.full_name || "Unknown"}</p>
                      <p className="text-xs text-muted-foreground capitalize">{s.signer_role}</p>
                    </div>
                    <Badge variant="outline" className={`text-xs ${
                      s.status === "signed"
                        ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                        : s.status === "declined"
                        ? "bg-destructive/10 text-destructive border-destructive/20"
                        : "bg-amber-500/10 text-amber-600 border-amber-500/20"
                    }`}>
                      {s.status === "signed" ? `Signed ${s.signed_at ? format(new Date(s.signed_at), "MMM d") : ""}` : s.status === "declined" ? "Declined" : "Pending"}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Document Preview */}
          <div className="rounded-lg border bg-muted/20 overflow-hidden">
            {isPdf ? (
              <PdfInlineViewer fileUrl={viewFileUrl} fileName={doc.file_name || "document.pdf"} />
            ) : isImage ? (
              <img src={viewFileUrl} alt={doc.title} className="max-w-full mx-auto max-h-[500px] object-contain p-4" />
            ) : (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <FileText className="h-12 w-12 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">{doc.file_name || "Document"}</p>
                <Button variant="outline" size="sm" onClick={() => window.open(viewFileUrl, "_blank")} className="gap-1.5">
                  <ExternalLink className="h-3.5 w-3.5" /> Open File
                </Button>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            {isSigned && isPdf && (
              <Button variant="outline" onClick={handleDownloadSigned} disabled={loadingSignedUrl} className="gap-1.5">
                {loadingSignedUrl ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Download Signed PDF
              </Button>
            )}
            <Button variant="outline" onClick={() => window.open(doc.file_url, "_blank")} className="gap-1.5">
              <Download className="h-4 w-4" /> Download Original
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
