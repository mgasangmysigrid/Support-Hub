import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Search, Eye, Download, PenTool, Filter, Users, Wrench, Loader2 } from "lucide-react";
import { format } from "date-fns";
import DocumentViewerDialog from "@/components/documents/DocumentViewerDialog";
import SignDocumentDialog from "@/components/documents/SignDocumentDialog";
import RepairDocumentsButton from "@/components/documents/RepairDocumentsButton";
import { deriveDocumentStatus, getDisplayStatusLabel } from "@/lib/document-utils";
import { repairDocument, getSignedFileUrl } from "@/lib/document-finalization";

const DOC_STATUS_COLORS: Record<string, string> = {
  issued: "bg-muted text-muted-foreground border-border",
  awaiting_signature: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  partially_signed: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  fully_signed: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  completed: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  declined: "bg-destructive/10 text-destructive border-destructive/20",
  archived: "bg-muted text-muted-foreground border-border",
  needs_repair: "bg-destructive/10 text-destructive border-destructive/20",
  finalizing: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  "Finalizing...": "bg-blue-500/10 text-blue-600 border-blue-500/20",
  "Needs Repair": "bg-destructive/10 text-destructive border-destructive/20",
};

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

const DOC_TYPES = [
  { value: "all", label: "All Types" },
  { value: "employment_contract", label: "Employment Contract" },
  { value: "equipment_liability", label: "Equipment Liability" },
  { value: "nda", label: "NDA" },
  { value: "policy_acknowledgement", label: "Policy Acknowledgement" },
  { value: "hr_notice", label: "HR Notice" },
  { value: "other", label: "Other" },
];

const DOC_TYPE_LABELS: Record<string, string> = {
  employment_contract: "Employment Contract",
  equipment_liability: "Equipment Liability",
  nda: "NDA",
  policy_acknowledgement: "Policy Acknowledgement",
  hr_notice: "HR Notice",
  other: "Other",
};

export default function MyDocuments() {
  const { user, isSuperAdmin, isPcMember } = useAuth();
  const canManageDocuments = isSuperAdmin || isPcMember;
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("my-documents");
  const [repairingDocId, setRepairingDocId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [recipientFilter, setRecipientFilter] = useState("all");
  const [issuerFilter, setIssuerFilter] = useState("all");
  const [viewDoc, setViewDoc] = useState<any>(null);
  const [signDoc, setSignDoc] = useState<any>(null);

  // Fetch active profiles for recipient/issuer dropdowns (owner only)
  const { data: allProfiles } = useQuery({
    queryKey: ["all-profiles-for-doc-filters"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .eq("is_active", true)
        .order("full_name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user?.id && canManageDocuments,
  });

  // My Documents: only docs where I'm recipient (personal inbox)
  const { data: myDocs, isLoading: loadingMy } = useQuery({
    queryKey: ["my-documents", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("*, issued_by:profiles!documents_issued_by_user_id_fkey(full_name), recipient:profiles!documents_recipient_user_id_fkey(full_name)")
        .eq("recipient_user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // Team Documents: ALL docs system-wide (owner only)
  const { data: teamDocs, isLoading: loadingTeam } = useQuery({
    queryKey: ["team-documents"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("*, issued_by:profiles!documents_issued_by_user_id_fkey(full_name), recipient:profiles!documents_recipient_user_id_fkey(full_name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id && canManageDocuments,
  });

  // For Signature: documents where I'm a signer but NOT the recipient
  const { data: forSignDocs, isLoading: loadingSign } = useQuery({
    queryKey: ["for-signature-documents", user?.id],
    queryFn: async () => {
      const { data: signerRows, error: signerErr } = await supabase
        .from("document_signers")
        .select("document_id, signer_role, status, signing_order")
        .eq("signer_user_id", user!.id);
      if (signerErr) throw signerErr;
      if (!signerRows?.length) return [];

      const docIds = signerRows.map((s) => s.document_id);
      const { data: docs, error: docErr } = await supabase
        .from("documents")
        .select("*, issued_by:profiles!documents_issued_by_user_id_fkey(full_name), recipient:profiles!documents_recipient_user_id_fkey(full_name)")
        .in("id", docIds)
        .neq("recipient_user_id", user!.id)
        .order("created_at", { ascending: false });
      if (docErr) throw docErr;

      return (docs ?? []).map((d) => {
        const signer = signerRows.find((s) => s.document_id === d.id);
        return { ...d, signer_role: signer?.signer_role, signer_status: signer?.status };
      });
    },
    enabled: !!user?.id,
  });

  // Check if I'm a signer on my own documents
  const { data: myDocSignerStatus } = useQuery({
    queryKey: ["my-doc-signer-status", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_signers")
        .select("document_id, status")
        .eq("signer_user_id", user!.id);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user?.id,
  });

  // Fetch all signers for documents visible to this user (for status derivation)
  const { data: allDocSigners } = useQuery({
    queryKey: ["all-doc-signers-for-status", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_signers")
        .select("document_id, status, signer_user_id");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user?.id,
  });

  // Build map: document_id → signer[] for status derivation
  const docSignersMap = new Map<string, Array<{ status: string; signer_user_id: string }>>();
  for (const s of allDocSigners ?? []) {
    const arr = docSignersMap.get(s.document_id) || [];
    arr.push(s);
    docSignersMap.set(s.document_id, arr);
  }

  const signerStatusMap = new Map(
    (myDocSignerStatus ?? []).map((s) => [s.document_id, s.status])
  );

  /** Get the display status for a document, deriving from signers if stale */
  const getDisplayStatus = (doc: any): string => {
    if (!doc.requires_signature) return doc.status;
    const signers = docSignersMap.get(doc.id);
    if (!signers?.length) return doc.status;
    const hasArtifact = !!(doc as any).signed_file_path;
    return deriveDocumentStatus(doc.status, doc.requires_signature, signers, hasArtifact);
  };

  const filterDocs = (docs: any[] | undefined, applyUserFilters = false) => {
    if (!docs) return [];
    return docs.filter((d) => {
      if (typeFilter !== "all" && d.document_type !== typeFilter) return false;
      const dStatus = getDisplayStatus(d);
      if (statusFilter !== "all" && dStatus !== statusFilter) return false;
      if (applyUserFilters && recipientFilter !== "all" && d.recipient_user_id !== recipientFilter) return false;
      if (applyUserFilters && issuerFilter !== "all" && d.issued_by_user_id !== issuerFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        const title = (d.title || "").toLowerCase();
        const issuer = (d.issued_by?.full_name || "").toLowerCase();
        const recipient = (d.recipient?.full_name || "").toLowerCase();
        if (!title.includes(s) && !issuer.includes(s) && !recipient.includes(s)) return false;
      }
      return true;
    });
  };

  const handleDownload = async (doc: any) => {
    const dStatus = getDisplayStatus(doc);
    const isSigned = doc.requires_signature && ["completed", "partially_signed", "fully_signed"].includes(dStatus);
    const signedPath = (doc as any).signed_file_path as string | null;
    if (isSigned && signedPath) {
      const url = await getSignedFileUrl(signedPath);
      if (url) { window.open(url, "_blank"); return; }
    }
    if (doc.file_url) window.open(doc.file_url, "_blank");
  };

  const forSignCount = forSignDocs?.filter((d) => d.signer_status === "pending").length ?? 0;

  const handleRepairSingle = async (docId: string) => {
    setRepairingDocId(docId);
    try {
      const result = await repairDocument(docId);
      if (result.success) {
        toast.success("Document repaired");
        qc.invalidateQueries({ queryKey: ["my-documents"] });
        qc.invalidateQueries({ queryKey: ["team-documents"] });
        qc.invalidateQueries({ queryKey: ["all-doc-signers-for-status"] });
      } else {
        toast.error("Repair failed", { description: result.error });
      }
    } catch (err: any) {
      toast.error("Repair failed", { description: err.message });
    } finally {
      setRepairingDocId(null);
    }
  };

  const renderDocCard = (doc: any, showRecipient: boolean) => {
    const isSigner = signerStatusMap.has(doc.id);
    const signerStatus = signerStatusMap.get(doc.id);
    const derivedStatus = getDisplayStatus(doc);
    const displayLabel = getDisplayStatusLabel(doc.status, derivedStatus, !!(doc as any).signed_file_path, doc.updated_at, (doc as any).processing_state);
    const isStale = derivedStatus !== doc.status || doc.status === "needs_repair";
    const statusColorKey = displayLabel === "Finalizing..." ? "Finalizing..." : derivedStatus;
    return (
      <Card key={doc.id} className="hover:shadow-md transition-shadow">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate">{doc.title}</p>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  <span className="text-xs text-muted-foreground">
                    {DOC_TYPE_LABELS[doc.document_type] || doc.document_type}
                  </span>
                  <span className="text-xs text-muted-foreground">•</span>
                  <span className="text-xs text-muted-foreground">
                    Issued by {doc.issued_by?.full_name || "Unknown"}
                  </span>
                  {showRecipient && doc.recipient?.full_name && (
                    <>
                      <span className="text-xs text-muted-foreground">•</span>
                      <span className="text-xs text-muted-foreground">
                        To: {doc.recipient.full_name}
                      </span>
                    </>
                  )}
                  <span className="text-xs text-muted-foreground">•</span>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(doc.created_at), "MMM d, yyyy")}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge className={`text-xs border ${DOC_STATUS_COLORS[statusColorKey] || DOC_STATUS_COLORS.issued}`}>
                {displayLabel === "Needs Repair" ? "Needs Repair" : DOC_STATUS_LABELS[displayLabel] || displayLabel}
              </Badge>
              {isStale && canManageDocuments && displayLabel !== "Finalizing..." && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1 text-xs"
                  disabled={repairingDocId === doc.id}
                  onClick={(e) => { e.stopPropagation(); handleRepairSingle(doc.id); }}
                >
                  {repairingDocId === doc.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wrench className="h-3 w-3" />}
                  Repair
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => setViewDoc(doc)} className="gap-1.5">
                <Eye className="h-3.5 w-3.5" /> View
              </Button>
              <Button variant="ghost" size="sm" onClick={() => handleDownload(doc)} className="gap-1.5">
                <Download className="h-3.5 w-3.5" /> Download
              </Button>
              {isSigner && signerStatus === "pending" && doc.requires_signature && (
                <Button size="sm" onClick={() => setSignDoc(doc)} className="gap-1.5">
                  <PenTool className="h-3.5 w-3.5" /> Sign
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderFilters = () => (
    <div className="flex flex-wrap gap-3 mt-4">
      <div className="relative flex-1 min-w-[200px] max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={activeTab === "team-documents" ? "Search by title, recipient, or issuer..." : "Search documents..."}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>
      <Select value={typeFilter} onValueChange={setTypeFilter}>
        <SelectTrigger className="w-[180px]">
          <Filter className="h-3.5 w-3.5 mr-1.5" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {DOC_TYPES.map((t) => (
            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={statusFilter} onValueChange={setStatusFilter}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="All Statuses" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Statuses</SelectItem>
          {Object.entries(DOC_STATUS_LABELS).map(([k, v]) => (
            <SelectItem key={k} value={k}>{v}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {activeTab === "team-documents" && canManageDocuments && allProfiles && (
        <>
          <Select value={recipientFilter} onValueChange={setRecipientFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All Recipients" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Recipients</SelectItem>
              {allProfiles.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.full_name || p.email || "Unknown"}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={issuerFilter} onValueChange={setIssuerFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All Issuers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Issuers</SelectItem>
              {allProfiles.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.full_name || p.email || "Unknown"}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </>
      )}
    </div>
  );

  const renderDocList = (docs: any[] | undefined, loading: boolean, showRecipient: boolean, emptyIcon: React.ReactNode, emptyText: string, applyUserFilters = false) => {
    if (loading) {
      return (
        <div className="space-y-3 mt-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      );
    }
    const filtered = filterDocs(docs, applyUserFilters);
    if (filtered.length === 0) {
      return (
        <Card className="mt-4">
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
            {emptyIcon}
            <p className="text-sm">{emptyText}</p>
          </CardContent>
        </Card>
      );
    }
    return (
      <div className="space-y-3 mt-4">
        {filtered.map((doc) => renderDocCard(doc, showRecipient))}
      </div>
    );
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileText className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">My Documents</h1>
        </div>
        {canManageDocuments && <RepairDocumentsButton />}
      </div>

      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setSearch(""); setTypeFilter("all"); setStatusFilter("all"); setRecipientFilter("all"); setIssuerFilter("all"); }}>
        <TabsList>
          <TabsTrigger value="my-documents">My Documents</TabsTrigger>
          {canManageDocuments && (
            <TabsTrigger value="team-documents" className="gap-2">
              <Users className="h-3.5 w-3.5" />
              Team Documents
            </TabsTrigger>
          )}
          <TabsTrigger value="for-signature" className="gap-2">
            For Signature
            {forSignCount > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[11px] font-bold px-1">
                {forSignCount}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {renderFilters()}

        <TabsContent value="my-documents">
          {renderDocList(myDocs, loadingMy, false, <FileText className="h-10 w-10" />, "No documents found")}
        </TabsContent>

        {canManageDocuments && (
          <TabsContent value="team-documents">
            {renderDocList(teamDocs, loadingTeam, true, <Users className="h-10 w-10" />, "No team documents found", true)}
          </TabsContent>
        )}

        <TabsContent value="for-signature">
          {loadingSign ? (
            <div className="space-y-3 mt-4">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
            </div>
          ) : filterDocs(forSignDocs).length === 0 ? (
            <Card className="mt-4">
              <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
                <PenTool className="h-10 w-10" />
                <p className="text-sm">No signature requests</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3 mt-4">
              {filterDocs(forSignDocs).map((doc) => (
                <Card key={doc.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/10">
                          <PenTool className="h-5 w-5 text-amber-600" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate">{doc.title}</p>
                          <div className="flex flex-wrap items-center gap-2 mt-1">
                            <span className="text-xs text-muted-foreground">
                              {DOC_TYPE_LABELS[doc.document_type] || doc.document_type}
                            </span>
                            <span className="text-xs text-muted-foreground">•</span>
                            <span className="text-xs text-muted-foreground">
                              For: {doc.recipient?.full_name || "Unknown"}
                            </span>
                            <span className="text-xs text-muted-foreground">•</span>
                            <span className="text-xs text-muted-foreground">
                              Issued by {doc.issued_by?.full_name || "Unknown"}
                            </span>
                            {doc.signer_role && (
                              <>
                                <span className="text-xs text-muted-foreground">•</span>
                                <span className="text-xs text-muted-foreground capitalize">
                                  Role: {doc.signer_role}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge className={`text-xs border ${
                          doc.signer_status === "signed"
                            ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                            : doc.signer_status === "declined"
                            ? "bg-destructive/10 text-destructive border-destructive/20"
                            : "bg-amber-500/10 text-amber-600 border-amber-500/20"
                        }`}>
                          {doc.signer_status === "signed" ? "Signed" : doc.signer_status === "declined" ? "Declined" : "Pending"}
                        </Badge>
                        <Button variant="ghost" size="sm" onClick={() => setViewDoc(doc)} className="gap-1.5">
                          <Eye className="h-3.5 w-3.5" /> View
                        </Button>
                        {doc.signer_status === "pending" && (
                          <Button size="sm" onClick={() => setSignDoc(doc)} className="gap-1.5">
                            <PenTool className="h-3.5 w-3.5" /> Sign
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {viewDoc && (
        <DocumentViewerDialog
          document={viewDoc}
          open={!!viewDoc}
          onClose={() => setViewDoc(null)}
        />
      )}
      {signDoc && (
        <SignDocumentDialog
          document={signDoc}
          open={!!signDoc}
          onClose={() => setSignDoc(null)}
        />
      )}
    </div>
  );
}
