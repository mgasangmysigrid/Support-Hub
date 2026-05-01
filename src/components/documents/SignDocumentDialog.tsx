import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PenTool, CheckCircle2, Download, Loader2 } from "lucide-react";
import { format } from "date-fns";
import SignableDocumentView from "./SignableDocumentView";
import { getSignedFileUrl } from "@/lib/document-finalization";

interface Props {
  document: any;
  open: boolean;
  onClose: () => void;
}

export default function SignDocumentDialog({ document: doc, open, onClose }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [signing, setSigning] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [signedAt, setSignedAt] = useState<Date | null>(null);
  const [signedFilePath, setSignedFilePath] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const signerName = user?.user_metadata?.full_name || user?.email || "Signer";

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const { data: savedSig } = useQuery({
    queryKey: ["saved-signature", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_saved_signatures")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: open && !!user?.id,
  });

  const { data: fields } = useQuery({
    queryKey: ["sig-fields", doc.id, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_signature_fields")
        .select("*")
        .eq("document_id", doc.id)
        .eq("signer_user_id", user!.id)
        .eq("completed", false);
      if (error) throw error;
      return data ?? [];
    },
    enabled: open && !!user?.id,
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["my-documents"] });
    qc.invalidateQueries({ queryKey: ["for-signature-documents"] });
    qc.invalidateQueries({ queryKey: ["my-doc-signer-status"] });
    qc.invalidateQueries({ queryKey: ["team-documents"] });
    qc.invalidateQueries({ queryKey: ["all-doc-signers-for-status"] });
  };

  const pollForCompletion = (documentId: string) => {
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts++;
      try {
        const { data } = await supabase
          .from("documents")
          .select("status, processing_state, signed_file_path")
          .eq("id", documentId)
          .single();

        if (!data) return;

        if (data.status === "completed" && data.signed_file_path) {
          if (pollRef.current) clearInterval(pollRef.current);
          setSignedFilePath(data.signed_file_path);
          setFinalizing(false);
          setCompleted(true);
          toast.success("Document signed and finalized successfully");
          invalidateAll();
          return;
        }

        if (data.processing_state === "failed") {
          if (pollRef.current) clearInterval(pollRef.current);
          setFinalizing(false);
          setCompleted(true);
          toast.warning("Document signed, but PDF generation needs repair");
          invalidateAll();
          return;
        }

        // Timeout after 2 minutes of polling
        if (attempts > 60) {
          if (pollRef.current) clearInterval(pollRef.current);
          setFinalizing(false);
          setCompleted(true);
          toast.warning("Document signed. Finalization is still processing in the background.");
          invalidateAll();
        }
      } catch {
        // ignore polling errors
      }
    }, 2000);
  };

  const handleSign = async (sigData: string, _signedFieldIds: string[], saveForFuture = false) => {
    setSigning(true);
    const logCtx = `[SignDoc] doc=${doc.id}`;
    try {
      console.log(`${logCtx} Calling backend complete-signer`);

      const { data: result, error } = await supabase.functions.invoke("complete-signer", {
        body: {
          documentId: doc.id,
          signatureData: sigData,
          signatureType: "draw",
          saveForFuture,
        },
      });

      if (error) throw error;

      console.log(`${logCtx} Backend result:`, result);

      // Handle structured error from backend (returned as 200 with success:false)
      if (result && result.success === false && result.error) {
        throw new Error(result.error);
      }

      setSignedAt(new Date());
      setSigning(false);

      if (result.allSigned) {
        // All signers done — poll for backend finalization
        setFinalizing(true);
        pollForCompletion(doc.id);
      } else {
        // Partial — done for this signer
        setCompleted(true);
        toast.success("Document signed successfully");
        invalidateAll();
      }
    } catch (err: any) {
      console.error(`${logCtx} Signing failed:`, err);
      toast.error("Failed to sign document", { description: err.message });
    } finally {
      setSigning(false);
    }
  };

  const handleDownloadSigned = async () => {
    try {
      if (signedFilePath) {
        const url = await getSignedFileUrl(signedFilePath);
        if (url) {
          window.open(url, "_blank");
          return;
        }
      }
      toast.info("Signed PDF is not yet available");
    } catch (err: any) {
      toast.error("Failed to download", { description: err.message });
    }
  };

  const isPdf = doc.file_name?.toLowerCase().endsWith(".pdf") || doc.mime_type === "application/pdf";
  const isImage = doc.mime_type?.startsWith("image/");

  return (
    <Dialog open={open} onOpenChange={() => { if (pollRef.current) clearInterval(pollRef.current); setCompleted(false); onClose(); }}>
      <DialogContent className="max-w-5xl max-h-[95vh] overflow-y-auto">
        {finalizing ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <Loader2 className="h-10 w-10 text-primary animate-spin" />
            <div className="text-center space-y-1">
              <h2 className="text-xl font-semibold">Finalizing Document…</h2>
              <p className="text-sm text-muted-foreground">The server is generating the signed PDF. This may take a moment.</p>
            </div>
          </div>
        ) : completed ? (
          <div className="flex flex-col items-center justify-center py-12 gap-6">
            <div className="h-20 w-20 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <CheckCircle2 className="h-12 w-12 text-emerald-500" />
            </div>
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold">Document Signed Successfully</h2>
              <p className="text-muted-foreground">{doc.title}</p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-6 space-y-3 min-w-[300px]">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Signed by</span>
                <span className="font-medium">{signerName}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Signed on</span>
                <span className="font-medium">{signedAt ? format(signedAt, "MMM d, yyyy 'at' h:mm a") : "—"}</span>
              </div>
            </div>
            <div className="flex gap-3">
              {isPdf && signedFilePath && (
                <Button variant="outline" onClick={handleDownloadSigned} className="gap-1.5">
                  <Download className="h-4 w-4" /> Download Signed PDF
                </Button>
              )}
              <Button onClick={() => { if (pollRef.current) clearInterval(pollRef.current); setCompleted(false); onClose(); }}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <PenTool className="h-5 w-5 text-primary" />
                Sign: {doc.title}
              </DialogTitle>
              <DialogDescription>
                Prepare your signature, then click the "Sign Here" fields on the document to place it.
              </DialogDescription>
            </DialogHeader>

            <SignableDocumentView
              fileUrl={doc.file_url}
              isPdf={isPdf}
              isImage={isImage}
              fileName={doc.file_name || "document"}
              signerName={signerName}
              fields={(fields ?? []).map((f: any) => ({
                id: f.id,
                page_number: f.page_number,
                x_position: f.x_position,
                y_position: f.y_position,
                width: f.width,
                height: f.height,
                field_type: f.field_type,
                completed: f.completed,
              }))}
              savedSignature={savedSig?.signature_data ?? null}
              signing={signing}
              onComplete={(sigData, signedFieldIds) => handleSign(sigData, signedFieldIds, false)}
              onSaveSignature={(sigData) => handleSign(sigData, Array.from(new Set(
                (fields ?? []).map((f: any) => f.id)
              )), true)}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
