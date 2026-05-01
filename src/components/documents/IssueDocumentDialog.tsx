import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Upload, FileText, Plus, X, UserPlus, ArrowRight } from "lucide-react";
import PlaceSignatureFieldsStep, { PlacedField } from "./PlaceSignatureFieldsStep";

const DOC_TYPES = [
  { value: "employment_contract", label: "Employment Contract" },
  { value: "equipment_liability", label: "Equipment Liability" },
  { value: "nda", label: "NDA" },
  { value: "policy_acknowledgement", label: "Policy Acknowledgement" },
  { value: "hr_notice", label: "HR Notice" },
  { value: "other", label: "Other" },
];

const SIGNER_ROLES = ["Signer", "Witness", "Manager", "People & Culture", "Owner"];

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function IssueDocumentDialog({ open, onClose }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [docType, setDocType] = useState("other");
  const [recipientId, setRecipientId] = useState("");
  const [description, setDescription] = useState("");
  const [requiresSig, setRequiresSig] = useState(false);
  const [sigOrderRequired, setSigOrderRequired] = useState(false);
  const [dueDate, setDueDate] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [signers, setSigners] = useState<{ user_id: string; role: string; order: number }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [recipientSearch, setRecipientSearch] = useState("");
  const [signerSearch, setSignerSearch] = useState("");
  // Step: "details" | "place_fields"
  const [step, setStep] = useState<"details" | "place_fields">("details");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const { data: users } = useQuery({
    queryKey: ["all-active-users"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .eq("is_active", true)
        .order("full_name");
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  const filteredRecipients = (users ?? []).filter((u) => {
    if (!recipientSearch) return true;
    const s = recipientSearch.toLowerCase();
    return (u.full_name?.toLowerCase().includes(s) || u.email?.toLowerCase().includes(s));
  });

  const filteredSignerUsers = (users ?? []).filter((u) => {
    if (!signerSearch) return true;
    const s = signerSearch.toLowerCase();
    return (u.full_name?.toLowerCase().includes(s) || u.email?.toLowerCase().includes(s));
  });

  const addSigner = (userId: string) => {
    if (signers.some((s) => s.user_id === userId)) return;
    setSigners([...signers, { user_id: userId, role: "Signer", order: signers.length + 1 }]);
    setSignerSearch("");
  };

  const removeSigner = (userId: string) => {
    setSigners(signers.filter((s) => s.user_id !== userId));
  };

  const updateSignerRole = (userId: string, role: string) => {
    setSigners(signers.map((s) => s.user_id === userId ? { ...s, role } : s));
  };

  const goToPlaceFields = () => {
    if (!title.trim() || !recipientId || !file) {
      toast.error("Please fill in all required fields");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File must be under 10MB");
      return;
    }
    // If no signers added, auto-add recipient as signer
    if (requiresSig && signers.length === 0) {
      const recipientUser = users?.find(u => u.id === recipientId);
      const autoSigner = { user_id: recipientId, role: "Signer", order: 1 };
      setSigners([autoSigner]);
    }
    // Create a preview URL for the file
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setStep("place_fields");
  };

  const handleSubmitWithFields = async (placedFields: PlacedField[]) => {
    await handleSubmit(placedFields);
  };

  const handleSubmit = async (placedFields?: PlacedField[]) => {
    if (!title.trim() || !recipientId || !file) {
      toast.error("Please fill in all required fields");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File must be under 10MB");
      return;
    }

    setSubmitting(true);
    try {
      // Upload file
      const ext = file.name.split(".").pop();
      const filePath = `${user!.id}/${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from("documents")
        .upload(filePath, file);
      if (uploadErr) throw uploadErr;

      const { data: urlData } = supabase.storage
        .from("documents")
        .getPublicUrl(filePath);

      // Since bucket is private, use signed URL
      const { data: signedUrl } = await supabase.storage
        .from("documents")
        .createSignedUrl(filePath, 60 * 60 * 24 * 365 * 10); // 10 year expiry

      const fileUrl = signedUrl?.signedUrl || urlData.publicUrl;

      // Create document
      const docStatus = requiresSig ? "awaiting_signature" : "issued";
      const { data: docData, error: docErr } = await supabase
        .from("documents")
        .insert({
          title: title.trim(),
          document_type: docType,
          recipient_user_id: recipientId,
          issued_by_user_id: user!.id,
          file_url: fileUrl,
          file_name: file.name,
          mime_type: file.type,
          description: description.trim() || null,
          requires_signature: requiresSig,
          signature_order_required: sigOrderRequired,
          due_date: dueDate || null,
          status: docStatus,
        })
        .select()
        .single();
      if (docErr) throw docErr;

      // Add signers
      if (requiresSig && signers.length > 0) {
        const signerRows = signers.map((s) => ({
          document_id: docData.id,
          signer_user_id: s.user_id,
          signer_role: s.role,
          signing_order: s.order,
        }));
        const { error: signersErr } = await supabase
          .from("document_signers")
          .insert(signerRows);
        if (signersErr) throw signersErr;

        // Insert signature fields from placement step
        if (placedFields && placedFields.length > 0) {
          const fieldRows = placedFields.map((f) => ({
            document_id: docData.id,
            signer_user_id: f.signer_user_id,
            page_number: f.page_number,
            x_position: f.x_position,
            y_position: f.y_position,
            width: f.width,
            height: f.height,
            field_type: f.field_type || "signature",
            signer_role: signers.find(s => s.user_id === f.signer_user_id)?.role || "Signer",
            signing_order: signers.find(s => s.user_id === f.signer_user_id)?.order || 1,
          }));
          const { error: fieldsErr } = await supabase
            .from("document_signature_fields")
            .insert(fieldRows);
          if (fieldsErr) throw fieldsErr;
        }

        // Notify signers
        const notifications = signers
          .filter((s) => s.user_id !== user!.id)
          .map((s) => ({
            user_id: s.user_id,
            type: "document_signature_request",
            title: "Signature Requested",
            body: `You have been assigned to sign "${title.trim()}"`,
            link: "/documents",
          }));
        if (notifications.length > 0) {
          await supabase.from("notifications").insert(notifications);
        }
      }

      // Notify recipient
      if (recipientId !== user!.id) {
        await supabase.from("notifications").insert({
          user_id: recipientId,
          type: "document_issued",
          title: "New Document Issued",
          body: `A new document "${title.trim()}" has been issued to you`,
          link: "/documents",
        });
      }

      toast.success("Document issued successfully");
      qc.invalidateQueries({ queryKey: ["admin-documents"] });
      resetForm();
      onClose();
    } catch (err: any) {
      toast.error("Failed to issue document", { description: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setTitle("");
    setDocType("other");
    setRecipientId("");
    setDescription("");
    setRequiresSig(false);
    setSigOrderRequired(false);
    setDueDate("");
    setFile(null);
    setSigners([]);
    setStep("details");
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const selectedRecipient = users?.find((u) => u.id === recipientId);

  // Build signers list with names for the placement step
  const signersWithNames = signers.map(s => ({
    user_id: s.user_id,
    name: users?.find(u => u.id === s.user_id)?.full_name || users?.find(u => u.id === s.user_id)?.email || "Unknown",
    role: s.role,
    order: s.order,
  }));

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className={`${step === "place_fields" ? "max-w-4xl" : "max-w-2xl"} max-h-[90vh] overflow-y-auto`}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            {step === "details" ? "Issue Document" : "Place Signature Fields"}
          </DialogTitle>
        </DialogHeader>

        {step === "details" ? (
          <div className="space-y-4">
            {/* Title */}
            <div className="space-y-1.5">
              <Label>Document Title *</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Employment Contract" />
            </div>

            {/* Type */}
            <div className="space-y-1.5">
              <Label>Document Type</Label>
              <Select value={docType} onValueChange={setDocType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DOC_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Recipient */}
            <div className="space-y-1.5">
              <Label>Recipient *</Label>
              {selectedRecipient ? (
                <div className="flex items-center gap-2 rounded-lg border p-2">
                  <span className="text-sm flex-1">{selectedRecipient.full_name || selectedRecipient.email}</span>
                  <Button variant="ghost" size="sm" onClick={() => setRecipientId("")}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <div className="space-y-1">
                  <Input
                    placeholder="Search employee..."
                    value={recipientSearch}
                    onChange={(e) => setRecipientSearch(e.target.value)}
                  />
                  {recipientSearch && (
                    <div className="max-h-32 overflow-y-auto rounded-lg border divide-y">
                      {filteredRecipients.slice(0, 8).map((u) => (
                        <button
                          key={u.id}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors"
                          onClick={() => { setRecipientId(u.id); setRecipientSearch(""); }}
                        >
                          {u.full_name || u.email}
                          <span className="text-xs text-muted-foreground ml-2">{u.email}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* File Upload */}
            <div className="space-y-1.5">
              <Label>Upload File * (PDF, DOCX, JPG, PNG — max 10MB)</Label>
              <Input
                type="file"
                accept=".pdf,.docx,.doc,.jpg,.jpeg,.png"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
              {file && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Upload className="h-3 w-3" /> {file.name} ({(file.size / 1024 / 1024).toFixed(1)}MB)
                </p>
              )}
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label>Description / Notes</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Optional notes..." />
            </div>

            {/* Requires Signature */}
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Requires Signature?</p>
                <p className="text-xs text-muted-foreground">Enable if this document needs to be signed</p>
              </div>
              <Switch checked={requiresSig} onCheckedChange={setRequiresSig} />
            </div>

            {requiresSig && (
              <>
                {/* Signature Order */}
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">Signature Order Required?</p>
                    <p className="text-xs text-muted-foreground">Signers must sign in the specified order</p>
                  </div>
                  <Switch checked={sigOrderRequired} onCheckedChange={setSigOrderRequired} />
                </div>

                {/* Due Date */}
                <div className="space-y-1.5">
                  <Label>Due Date (optional)</Label>
                  <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                </div>

                {/* Signers */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    <UserPlus className="h-3.5 w-3.5" /> Signers
                  </Label>
                  <Input
                    placeholder="Search and add signers..."
                    value={signerSearch}
                    onChange={(e) => setSignerSearch(e.target.value)}
                  />
                  {signerSearch && (
                    <div className="max-h-32 overflow-y-auto rounded-lg border divide-y">
                      {filteredSignerUsers.slice(0, 8).map((u) => (
                        <button
                          key={u.id}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors disabled:opacity-50"
                          disabled={signers.some((s) => s.user_id === u.id)}
                          onClick={() => addSigner(u.id)}
                        >
                          <Plus className="h-3 w-3 inline mr-1" />
                          {u.full_name || u.email}
                        </button>
                      ))}
                    </div>
                  )}
                  {signers.length > 0 && (
                    <div className="space-y-2">
                      {signers.map((s, idx) => {
                        const signerUser = users?.find((u) => u.id === s.user_id);
                        return (
                          <div key={s.user_id} className="flex items-center gap-2 rounded-lg border p-2">
                            {sigOrderRequired && (
                              <Badge variant="outline" className="text-xs shrink-0">#{idx + 1}</Badge>
                            )}
                            <span className="text-sm flex-1 truncate">{signerUser?.full_name || signerUser?.email}</span>
                            <Select value={s.role} onValueChange={(v) => updateSignerRole(s.user_id, v)}>
                              <SelectTrigger className="w-[140px] h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {SIGNER_ROLES.map((r) => (
                                  <SelectItem key={r} value={r}>{r}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button variant="ghost" size="sm" onClick={() => removeSigner(s.user_id)}>
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              {requiresSig ? (
                <Button onClick={goToPlaceFields} className="gap-1.5">
                  Next: Place Signature Fields
                  <ArrowRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button onClick={() => handleSubmit()} disabled={submitting} className="gap-1.5">
                  <Upload className="h-4 w-4" />
                  {submitting ? "Issuing..." : "Issue Document"}
                </Button>
              )}
            </div>
          </div>
        ) : (
          /* Step 2: Place signature fields on the document */
          previewUrl && (
            <PlaceSignatureFieldsStep
              fileUrl={previewUrl}
              fileName={file?.name || ""}
              signers={signersWithNames}
              onBack={() => setStep("details")}
              onSubmit={handleSubmitWithFields}
              submitting={submitting}
            />
          )
        )}
      </DialogContent>
    </Dialog>
  );
}
