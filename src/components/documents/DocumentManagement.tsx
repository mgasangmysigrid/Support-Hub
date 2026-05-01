import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import {
  FileText, Plus, Search, Eye, Download, Bell, Archive, ArchiveRestore,
  Filter, XCircle, CheckCircle2, Trash2, ClipboardList,
} from "lucide-react";
import { format } from "date-fns";
import { deriveDocumentStatus, getDisplayStatusLabel } from "@/lib/document-utils";
import { getSignedFileUrl } from "@/lib/document-finalization";
import IssueDocumentDialog from "./IssueDocumentDialog";
import DocumentViewerDialog from "./DocumentViewerDialog";
import DocumentTrackingDialog from "./DocumentTrackingDialog";

const DOC_STATUS_COLORS: Record<string, string> = {
  issued: "bg-muted text-muted-foreground border-border",
  awaiting_signature: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  partially_signed: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  fully_signed: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  completed: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  declined: "bg-destructive/10 text-destructive border-destructive/20",
  archived: "bg-muted text-muted-foreground border-border",
  needs_repair: "bg-destructive/10 text-destructive border-destructive/20",
  "Finalizing...": "bg-blue-500/10 text-blue-600 border-blue-500/20",
};

const DOC_STATUS_LABELS: Record<string, string> = {
  issued: "Issued",
  awaiting_signature: "Awaiting Signature",
  partially_signed: "Partially Signed",
  fully_signed: "Fully Signed",
  completed: "Completed",
  declined: "Declined",
  archived: "Archived",
};

const DOC_TYPE_LABELS: Record<string, string> = {
  employment_contract: "Employment Contract",
  equipment_liability: "Equipment Liability",
  nda: "NDA",
  policy_acknowledgement: "Policy Acknowledgement",
  hr_notice: "HR Notice",
  other: "Other",
};

export default function DocumentManagement() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [issueOpen, setIssueOpen] = useState(false);
  const [viewDoc, setViewDoc] = useState<any>(null);
  const [trackDoc, setTrackDoc] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: documents, isLoading } = useQuery({
    queryKey: ["admin-documents"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select(`
          *,
          recipient:profiles!documents_recipient_user_id_fkey(full_name, email),
          issued_by:profiles!documents_issued_by_user_id_fkey(full_name)
        `)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Get signer counts per document
  const { data: signerCounts } = useQuery({
    queryKey: ["admin-signer-counts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_signers")
        .select("document_id, status");
      if (error) throw error;
      const map: Record<string, { total: number; signed: number }> = {};
      for (const s of data ?? []) {
        if (!map[s.document_id]) map[s.document_id] = { total: 0, signed: 0 };
        map[s.document_id].total++;
        if (s.status === "signed") map[s.document_id].signed++;
      }
      return map;
    },
  });

  const filtered = (documents ?? []).filter((d) => {
    if (statusFilter !== "all" && d.status !== statusFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      if (
        !(d.title || "").toLowerCase().includes(s) &&
        !(d.recipient?.full_name || "").toLowerCase().includes(s) &&
        !(d.issued_by?.full_name || "").toLowerCase().includes(s)
      ) return false;
    }
    return true;
  });

  const handleArchive = async (docId: string) => {
    const { error } = await supabase
      .from("documents")
      .update({ status: "archived", updated_at: new Date().toISOString() })
      .eq("id", docId);
    if (error) {
      toast.error("Failed to archive");
    } else {
      toast.success("Document archived");
      qc.invalidateQueries({ queryKey: ["admin-documents"] });
    }
  };

  const handleUnarchive = async (docId: string) => {
    const { error } = await supabase
      .from("documents")
      .update({ status: "issued", updated_at: new Date().toISOString() })
      .eq("id", docId);
    if (error) {
      toast.error("Failed to un-archive");
    } else {
      toast.success("Document restored");
      qc.invalidateQueries({ queryKey: ["admin-documents"] });
    }
  };

  const handleDelete = async (docId: string) => {
    const { error } = await supabase
      .from("documents")
      .delete()
      .eq("id", docId);
    if (error) {
      toast.error("Failed to delete document");
    } else {
      toast.success("Document deleted");
      qc.invalidateQueries({ queryKey: ["admin-documents"] });
    }
  };

  const handleRemind = async (doc: any) => {
    // Get pending signers
    const { data: pendingSigners } = await supabase
      .from("document_signers")
      .select("signer_user_id")
      .eq("document_id", doc.id)
      .eq("status", "pending");

    if (!pendingSigners?.length) {
      toast.info("No pending signers to remind");
      return;
    }

    const notifications = pendingSigners.map((s) => ({
      user_id: s.signer_user_id,
      type: "document_reminder",
      title: "Signature Reminder",
      body: `Please sign "${doc.title}" — your signature is pending`,
      link: "/documents",
    }));

    const { error } = await supabase.from("notifications").insert(notifications);
    if (error) {
      toast.error("Failed to send reminders");
    } else {
      toast.success(`Reminder sent to ${pendingSigners.length} signer(s)`);
    }
  };

  const handleDownload = async (doc: any) => {
    const signedPath = (doc as any).signed_file_path as string | null;
    if (signedPath) {
      const url = await getSignedFileUrl(signedPath);
      if (url) { window.open(url, "_blank"); return; }
    }
    if (doc.file_url) window.open(doc.file_url, "_blank");
  };

  /** Get derived display status for a document */
  const getDerivedStatus = (doc: any) => {
    if (!doc.requires_signature) return doc.status;
    const counts = signerCounts?.[doc.id];
    if (!counts) return doc.status;
    const hasArtifact = !!(doc as any).signed_file_path;
    // Build pseudo-signer array from counts
    const signers = [
      ...Array(counts.signed).fill({ status: "signed", signer_user_id: "" }),
      ...Array(counts.total - counts.signed).fill({ status: "pending", signer_user_id: "" }),
    ];
    return deriveDocumentStatus(doc.status, doc.requires_signature, signers, hasArtifact);
  };

  const getDocDisplayLabel = (doc: any) => {
    const derived = getDerivedStatus(doc);
    const hasArtifact = !!(doc as any).signed_file_path;
    return getDisplayStatusLabel(doc.status, derived, hasArtifact);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" /> Document Management
        </h3>
        <Button onClick={() => setIssueOpen(true)} className="gap-1.5">
          <Plus className="h-4 w-4" /> Issue Document
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by title, recipient, or issuer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <Filter className="h-3.5 w-3.5 mr-1.5" />
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {Object.entries(DOC_STATUS_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
            <FileText className="h-10 w-10" />
            <p className="text-sm">No documents found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Recipient</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Signature</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((doc) => {
                const counts = signerCounts?.[doc.id];
                return (
                  <TableRow key={doc.id}>
                    <TableCell className="font-medium max-w-[200px] truncate">{doc.title}</TableCell>
                    <TableCell className="text-sm">{doc.recipient?.full_name || doc.recipient?.email || "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{DOC_TYPE_LABELS[doc.document_type] || doc.document_type}</TableCell>
                    <TableCell>
                      {doc.requires_signature ? (
                        <Badge variant="outline" className="text-xs">Yes</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">No</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {counts ? (
                        <span className="text-xs">
                          {counts.signed}/{counts.total} signed
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {format(new Date(doc.created_at), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const displayLabel = getDocDisplayLabel(doc);
                        const statusColorKey = displayLabel === "Finalizing..." ? "Finalizing..." : getDerivedStatus(doc);
                        return (
                          <Badge className={`text-xs border ${DOC_STATUS_COLORS[statusColorKey] || DOC_STATUS_COLORS.issued}`}>
                            {displayLabel === "Needs Repair" ? "Needs Repair" : DOC_STATUS_LABELS[displayLabel] || displayLabel}
                          </Badge>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setTrackDoc(doc)} title="Track">
                          <ClipboardList className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setViewDoc(doc)} title="View">
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDownload(doc)} title="Download">
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                        {doc.requires_signature && doc.status !== "completed" && doc.status !== "archived" && (
                          <Button variant="ghost" size="sm" onClick={() => handleRemind(doc)} title="Remind">
                            <Bell className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {doc.status === "archived" ? (
                          <Button variant="ghost" size="sm" onClick={() => handleUnarchive(doc.id)} title="Un-archive">
                            <ArchiveRestore className="h-3.5 w-3.5" />
                          </Button>
                        ) : (
                          <Button variant="ghost" size="sm" onClick={() => handleArchive(doc.id)} title="Archive">
                            <Archive className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(doc.id)} title="Delete" className="text-destructive hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <IssueDocumentDialog open={issueOpen} onClose={() => setIssueOpen(false)} />
      {viewDoc && <DocumentViewerDialog document={viewDoc} open={!!viewDoc} onClose={() => setViewDoc(null)} />}
      {trackDoc && <DocumentTrackingDialog document={trackDoc} open={!!trackDoc} onClose={() => setTrackDoc(null)} />}
    </div>
  );
}
