import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { FileText, User, CheckCircle2, Clock, XCircle } from "lucide-react";
import { format } from "date-fns";

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

export default function DocumentTrackingDialog({ document: doc, open, onClose }: Props) {
  const { data: signers } = useQuery({
    queryKey: ["tracking-signers", doc.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_signers")
        .select("*, signer:profiles!document_signers_signer_user_id_fkey(full_name, email)")
        .eq("document_id", doc.id)
        .order("signing_order");
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  const { data: fields } = useQuery({
    queryKey: ["tracking-fields", doc.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_signature_fields")
        .select("*, signer:profiles!document_signature_fields_signer_user_id_fkey(full_name)")
        .eq("document_id", doc.id)
        .order("page_number, signing_order");
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  const totalSigners = signers?.length ?? 0;
  const signedCount = signers?.filter((s) => s.status === "signed").length ?? 0;
  const progressPct = totalSigners > 0 ? Math.round((signedCount / totalSigners) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Signature Tracking: {doc.title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Overview */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Recipient</p>
              <p className="text-sm font-medium">{doc.recipient?.full_name || "—"}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Type</p>
              <p className="text-sm font-medium">{DOC_TYPE_LABELS[doc.document_type] || doc.document_type}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Issued</p>
              <p className="text-sm">{format(new Date(doc.created_at), "MMM d, yyyy")}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Progress</p>
              <p className="text-sm font-medium">{signedCount}/{totalSigners} ({progressPct}%)</p>
            </div>
          </div>

          {doc.due_date && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
              <p className="text-xs text-amber-600 font-medium">
                Due: {format(new Date(doc.due_date), "MMMM d, yyyy")}
              </p>
            </div>
          )}

          {/* Signers List */}
          {signers && signers.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-3">Signers</p>
              <div className="space-y-2">
                {signers.map((s: any, idx: number) => (
                  <div key={s.id} className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/30">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full shrink-0" style={{
                      backgroundColor: s.status === "signed" ? "hsl(152, 60%, 40%, 0.1)" : s.status === "declined" ? "hsl(0, 72%, 51%, 0.1)" : "hsl(38, 92%, 50%, 0.1)"
                    }}>
                      {s.status === "signed" ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      ) : s.status === "declined" ? (
                        <XCircle className="h-4 w-4 text-destructive" />
                      ) : (
                        <Clock className="h-4 w-4 text-amber-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{s.signer?.full_name || s.signer?.email || "Unknown"}</p>
                        {doc.signature_order_required && (
                          <Badge variant="outline" className="text-[10px] shrink-0">Order #{s.signing_order}</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground capitalize">{s.signer_role}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <Badge variant="outline" className={`text-xs ${
                        s.status === "signed"
                          ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                          : s.status === "declined"
                          ? "bg-destructive/10 text-destructive border-destructive/20"
                          : "bg-amber-500/10 text-amber-600 border-amber-500/20"
                      }`}>
                        {s.status === "signed" ? "Signed" : s.status === "declined" ? "Declined" : "Pending"}
                      </Badge>
                      {s.signed_at && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {format(new Date(s.signed_at), "MMM d, h:mm a")}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Signature Fields */}
          {fields && fields.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-3">Signature Fields</p>
              <div className="space-y-2">
                {fields.map((f: any) => (
                  <div key={f.id} className="flex items-center gap-3 rounded-lg border p-2.5 text-sm">
                    <Badge variant="outline" className="text-[10px] shrink-0">Page {f.page_number}</Badge>
                    <span className="flex-1 truncate text-muted-foreground">
                      {f.signer?.full_name || f.signer_role || "Unassigned"} — {f.field_type}
                    </span>
                    {f.completed ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    ) : (
                      <Clock className="h-4 w-4 text-amber-600 shrink-0" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
