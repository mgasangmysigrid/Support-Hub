import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { format } from "date-fns";
import { useDocAcknowledgments, usePendingAckCount } from "@/hooks/useDocAcknowledgments";
import PolicyAckReporting from "@/components/documents/PolicyAckReporting";
import { Checkbox } from "@/components/ui/checkbox";
import {
  FileText, Plus, Upload, Pencil, Trash2, X, Eye, Search,
  BookOpen, Lightbulb, Sparkles, ChevronLeft, Archive, ArchiveRestore,
  CheckCircle2, Clock, Shield, Building2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PdfInlineViewer } from "@/components/PdfInlineViewer";
import { KBSearchAI } from "@/components/KBSearchAI";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

const CATEGORIES = [
  { value: "official_document", label: "Official Document", icon: FileText },
  { value: "how_to", label: "How-To Guide", icon: Lightbulb },
  { value: "whats_new", label: "What's New", icon: Sparkles },
  { value: "general", label: "General", icon: BookOpen },
];

function categoryLabel(value: string) {
  return CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

function categoryIcon(value: string) {
  const Icon = CATEGORIES.find((c) => c.value === value)?.icon ?? BookOpen;
  return <Icon className="h-4 w-4" />;
}

interface KBDoc {
  id: string;
  title: string;
  category: string;
  content: string | null;
  file_path: string | null;
  file_name: string | null;
  created_by: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  requires_acknowledgment?: boolean;
  is_policy?: boolean;
  document_version?: number;
  visibility_type?: string;
}

export default function KnowledgeBase() {
  const { user, canManageKB, isSuperAdmin, isPcMember } = useAuth();
  const { isAcknowledged, getAckDate, acknowledge } = useDocAcknowledgments();
  const pendingAckCount = usePendingAckCount();
  
  const queryClient = useQueryClient();

  // Track which docs the user has read
  const { data: readDocIds = [] } = useQuery({
    queryKey: ["kb-reads", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("knowledge_base_reads")
        .select("doc_id")
        .eq("user_id", user!.id);
      return (data ?? []).map((r) => r.doc_id);
    },
  });

  const markAsRead = async (docId: string) => {
    if (!user || readDocIds.includes(docId)) return;
    await supabase
      .from("knowledge_base_reads")
      .upsert({ user_id: user.id, doc_id: docId }, { onConflict: "user_id,doc_id" });
    queryClient.invalidateQueries({ queryKey: ["kb-reads"] });
  };

  const KB_DRAFT_KEY = "kb-article-draft";
  const savedKBDraft = (() => { try { const s = localStorage.getItem(KB_DRAFT_KEY); return s ? JSON.parse(s) : null; } catch { return null; } })();

  const [view, setViewRaw] = useState<"list" | "form" | "detail">(savedKBDraft?.view || "list");
  const [editingDoc, setEditingDoc] = useState<KBDoc | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<KBDoc | null>(null);
  const [deleteDoc, setDeleteDoc] = useState<KBDoc | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [showArchived, setShowArchived] = useState(false);

  // Form state
  const [title, setTitle] = useState(savedKBDraft?.title || "");
  const [category, setCategory] = useState(savedKBDraft?.category || "general");
  const [content, setContent] = useState(savedKBDraft?.content || "");
  const [file, setFile] = useState<File | null>(null);
  const [requiresAck, setRequiresAck] = useState(savedKBDraft?.requiresAck ?? true);
  const [saving, setSaving] = useState(false);
  const [visibilityType, setVisibilityType] = useState<string>("all");
  const [selectedDeptIds, setSelectedDeptIds] = useState<string[]>([]);

  // Fetch departments for visibility targeting
  const { data: departments = [] } = useQuery({
    queryKey: ["all-departments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("departments")
        .select("id, name, code")
        .order("display_order");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Fetch department links for all docs (for display labels and editing)
  const { data: docDeptLinks = [] } = useQuery({
    queryKey: ["kb-dept-links"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("knowledge_base_departments")
        .select("knowledge_base_id, department_id");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Fetch user's department memberships for filtering
  const { data: userDeptIds = [] } = useQuery({
    queryKey: ["my-dept-ids", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("department_members")
        .select("department_id")
        .eq("user_id", user!.id);
      if (error) throw error;
      return (data ?? []).map((d) => d.department_id);
    },
  });
  const setView = useCallback((v: "list" | "form" | "detail") => {
    setViewRaw(v);
    if (v !== "form") {
      try { localStorage.removeItem(KB_DRAFT_KEY); } catch {}
    }
  }, []);

  // Auto-save KB form draft
  useEffect(() => {
    if (view === "form" && (title || content)) {
      try {
        localStorage.setItem(KB_DRAFT_KEY, JSON.stringify({
          view: "form", title, category, content,
          editingDocId: editingDoc?.id || null,
        }));
      } catch {}
    }
  }, [view, title, category, content, editingDoc]);

  // Restore editing doc from saved draft
  const { data: docs = [], isLoading } = useQuery({
    queryKey: ["knowledge-base"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("knowledge_base")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data as KBDoc[];
    },
  });

  // Restore editing doc from saved draft
  useEffect(() => {
    if (view === "form" && savedKBDraft?.editingDocId && !editingDoc && docs.length > 0) {
      const doc = docs.find((d) => d.id === savedKBDraft.editingDocId);
      if (doc) setEditingDoc(doc);
    }
  }, [docs]);

  const { data: profiles } = useQuery({
    queryKey: ["all-profiles-kb"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name, email");
      return data ?? [];
    },
  });

  const resolveAuthor = (uid: string) => {
    const p = profiles?.find((pr) => pr.id === uid);
    return p?.full_name || p?.email || "Unknown";
  };

  // Helper to get department names for a doc's visibility label
  const getDocDeptNames = (docId: string) => {
    const deptIds = docDeptLinks.filter((l) => l.knowledge_base_id === docId).map((l) => l.department_id);
    return departments.filter((d) => deptIds.includes(d.id)).map((d) => d.name);
  };

  // Filter docs: non-admins only see docs they're allowed to view
  const visibleDocs = canManageKB
    ? docs
    : docs.filter((d: any) => {
        if (d.visibility_type !== "department_specific") return true;
        const linkedDeptIds = docDeptLinks
          .filter((l) => l.knowledge_base_id === d.id)
          .map((l) => l.department_id);
        return linkedDeptIds.some((did) => userDeptIds.includes(did));
      });

  const activeDocs = showArchived
    ? visibleDocs.filter((d: any) => d.is_archived === true)
    : visibleDocs.filter((d: any) => !d.is_archived);
  const filteredDocs = filterCategory === "all" ? activeDocs : activeDocs.filter((d) => d.category === filterCategory);

  const resetForm = () => {
    setTitle("");
    setCategory("general");
    setContent("");
    setFile(null);
    setEditingDoc(null);
    setRequiresAck(true);
    setVisibilityType("all");
    setSelectedDeptIds([]);
    try { localStorage.removeItem(KB_DRAFT_KEY); } catch {};
  };

  const openCreate = () => {
    resetForm();
    setView("form");
  };

  const openEdit = (doc: KBDoc) => {
    setEditingDoc(doc);
    setTitle(doc.title);
    setCategory(doc.category);
    setContent(doc.content ?? "");
    setFile(null);
    setRequiresAck(doc.requires_acknowledgment ?? true);
    setVisibilityType((doc as any).visibility_type ?? "all");
    setSelectedDeptIds(
      docDeptLinks
        .filter((l) => l.knowledge_base_id === doc.id)
        .map((l) => l.department_id)
    );
    setView("form");
  };

  const handleSave = async () => {
    if (!user || !title.trim()) {
      toast.error("Title is required");
      return;
    }
    if (!file && !editingDoc?.file_path) {
      toast.error("Please upload a PDF or Word file");
      return;
    }
    if (visibilityType === "department_specific" && selectedDeptIds.length === 0) {
      toast.error("Please select at least one department");
      return;
    }

    setSaving(true);
    try {
      let filePath = editingDoc?.file_path ?? null;
      let fileName = editingDoc?.file_name ?? null;

      if (file) {
        const ext = file.name.split(".").pop();
        const path = `${crypto.randomUUID()}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from("knowledge-base")
          .upload(path, file, { contentType: file.type });
        if (uploadErr) throw uploadErr;
        filePath = path;
        fileName = file.name;
      }

      let docId: string;

      if (editingDoc) {
        docId = editingDoc.id;
        const versionBump = file ? { document_version: (editingDoc.document_version ?? 1) + 1 } : {};
        const { error } = await supabase
          .from("knowledge_base")
          .update({
            title: title.trim(),
            category,
            content: null,
            file_path: filePath,
            file_name: fileName,
            updated_by: user.id,
            updated_at: new Date().toISOString(),
            requires_acknowledgment: requiresAck,
            is_policy: requiresAck,
            visibility_type: visibilityType,
            ...versionBump,
          } as any)
          .eq("id", editingDoc.id);
        if (error) throw error;

        // Update department links atomically: delete old, insert new
        const { error: delLinksErr } = await supabase
          .from("knowledge_base_departments")
          .delete()
          .eq("knowledge_base_id", editingDoc.id);
        if (delLinksErr) throw new Error("Failed to update department links: " + delLinksErr.message);

        if (visibilityType === "department_specific" && selectedDeptIds.length > 0) {
          const links = selectedDeptIds.map((deptId) => ({
            knowledge_base_id: docId,
            department_id: deptId,
          }));
          const { error: insertLinksErr } = await supabase
            .from("knowledge_base_departments")
            .insert(links);
          if (insertLinksErr) {
            // Rollback: revert visibility to 'all' since links failed
            await supabase
              .from("knowledge_base")
              .update({ visibility_type: "all" } as any)
              .eq("id", docId);
            throw new Error("Failed to save department links. Visibility reverted to All Employees.");
          }
        }

        toast.success("Document updated");
      } else {
        const { data: inserted, error } = await supabase.from("knowledge_base").insert({
          title: title.trim(),
          category,
          content: null,
          file_path: filePath,
          file_name: fileName,
          created_by: user.id,
          requires_acknowledgment: requiresAck,
          is_policy: requiresAck,
          visibility_type: visibilityType,
        } as any).select("id").single();
        if (error) throw error;
        docId = inserted.id;

        toast.success("Document created");
      }

      // Insert department links for new docs
      if (!editingDoc && visibilityType === "department_specific" && selectedDeptIds.length > 0) {
        const links = selectedDeptIds.map((deptId) => ({
          knowledge_base_id: docId,
          department_id: deptId,
        }));
        const { error: insertLinksErr } = await supabase
          .from("knowledge_base_departments")
          .insert(links);
        if (insertLinksErr) {
          // Rollback: revert visibility to 'all' since links failed
          await supabase
            .from("knowledge_base")
            .update({ visibility_type: "all" } as any)
            .eq("id", docId);
          throw new Error("Failed to save department links. Visibility reverted to All Employees.");
        }
      }

      queryClient.invalidateQueries({ queryKey: ["knowledge-base"] });
      queryClient.invalidateQueries({ queryKey: ["kb-dept-links"] });
      resetForm();
      setView("list");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteDoc) return;
    try {
      if (deleteDoc.file_path) {
        await supabase.storage.from("knowledge-base").remove([deleteDoc.file_path]);
      }
      const { error } = await supabase.from("knowledge_base").delete().eq("id", deleteDoc.id);
      if (error) throw error;
      toast.success("Document deleted");
      queryClient.invalidateQueries({ queryKey: ["knowledge-base"] });
      if (selectedDoc?.id === deleteDoc.id) setView("list");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setDeleteDoc(null);
    }
  };

  const handleArchive = async (doc: KBDoc) => {
    const isArchived = (doc as any).is_archived;
    const { error } = await supabase
      .from("knowledge_base")
      .update({ is_archived: !isArchived, updated_at: new Date().toISOString() } as any)
      .eq("id", doc.id);
    if (error) {
      toast.error("Failed to update archive status");
    } else {
      toast.success(isArchived ? "Document restored" : "Document archived");
      queryClient.invalidateQueries({ queryKey: ["knowledge-base"] });
      if (selectedDoc?.id === doc.id) {
        setSelectedDoc(null);
        setView("list");
      }
    }
  };

  const getPdfUrl = async (path: string) => {
    const { data, error } = await supabase.storage
      .from("knowledge-base")
      .createSignedUrl(path, 3600);
    if (error) throw error;
    const signed = data.signedUrl;
    return signed.startsWith("http")
      ? signed
      : `${import.meta.env.VITE_SUPABASE_URL}/storage/v1${signed}`;
  };

  // --- DETAIL VIEW ---
  if (view === "detail" && selectedDoc) {
    return (
      <DetailView
        doc={selectedDoc}
        canManageKB={canManageKB}
        resolveAuthor={resolveAuthor}
        getPdfUrl={getPdfUrl}
        onBack={() => { setSelectedDoc(null); setView("list"); }}
        onEdit={() => openEdit(selectedDoc)}
        onDelete={() => setDeleteDoc(selectedDoc)}
        onArchive={() => handleArchive(selectedDoc)}
        deleteDoc={deleteDoc}
        onConfirmDelete={handleDelete}
        onCancelDelete={() => setDeleteDoc(null)}
        isAcknowledged={isAcknowledged}
        getAckDate={getAckDate}
        onAcknowledge={acknowledge}
      />
    );
  }

  // --- FORM VIEW ---
  if (view === "form") {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <Button variant="ghost" size="sm" onClick={() => { resetForm(); setView("list"); }}>
          <ChevronLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <Card>
          <CardHeader>
            <CardTitle>{editingDoc ? "Edit Document" : "New Document"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Title *</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Document title" />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Upload File (PDF or Word, optional)</Label>
              <Input
                type="file"
                accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              {editingDoc?.file_name && !file && (
                <p className="text-xs text-muted-foreground">Current file: {editingDoc.file_name}</p>
              )}
            </div>
            {canManageKB && (
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="requires-ack"
                  checked={requiresAck}
                  onChange={(e) => setRequiresAck(e.target.checked)}
                  className="rounded border-input"
                />
                <Label htmlFor="requires-ack" className="text-sm font-normal">
                  Requires employee acknowledgment
                </Label>
              </div>
            )}

            {/* Visibility Targeting */}
            {canManageKB && (
              <div className="space-y-3 rounded-lg border p-4">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  Who should see this document?
                </Label>
                <RadioGroup
                  value={visibilityType}
                  onValueChange={(val) => {
                    setVisibilityType(val);
                    if (val === "all") setSelectedDeptIds([]);
                  }}
                  className="space-y-2"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="all" id="vis-all" />
                    <Label htmlFor="vis-all" className="text-sm font-normal">All Employees</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="department_specific" id="vis-dept" />
                    <Label htmlFor="vis-dept" className="text-sm font-normal">Specific Departments</Label>
                  </div>
                </RadioGroup>

                {visibilityType === "department_specific" && (
                  <div className="space-y-2 ml-6">
                    <div className="max-h-48 overflow-y-auto space-y-1.5 rounded border p-2">
                      {departments.map((dept) => (
                        <div key={dept.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`dept-${dept.id}`}
                            checked={selectedDeptIds.includes(dept.id)}
                            onCheckedChange={(checked) => {
                              setSelectedDeptIds((prev) =>
                                checked
                                  ? [...prev, dept.id]
                                  : prev.filter((id) => id !== dept.id)
                              );
                            }}
                          />
                          <Label htmlFor={`dept-${dept.id}`} className="text-sm font-normal cursor-pointer">
                            {dept.name}
                          </Label>
                        </div>
                      ))}
                    </div>
                    {selectedDeptIds.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {selectedDeptIds.length} department{selectedDeptIds.length > 1 ? "s" : ""} selected
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => { resetForm(); setView("list"); }}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : editingDoc ? "Update" : "Publish"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // --- LIST VIEW ---
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold">Company Documents</h1>
          {pendingAckCount > 0 && (
            <Badge variant="destructive" className="text-xs gap-1">
              <Shield className="h-3 w-3" />
              {pendingAckCount} pending acknowledgment
            </Badge>
          )}
          {docs.length - readDocIds.length > 0 && (
            <Badge variant="default" className="text-xs">
              {docs.length - readDocIds.length} unread
            </Badge>
          )}
        </div>
        {canManageKB && (
          <Button onClick={openCreate} size="sm">
            <Plus className="h-4 w-4 mr-1" /> New Document
          </Button>
        )}
      </div>

      {canManageKB && (
        <div className="flex items-center gap-2">
          <Button
            variant={showArchived ? "default" : "outline"}
            size="sm"
            onClick={() => setShowArchived(!showArchived)}
            className="gap-1.5"
          >
            <Archive className="h-3.5 w-3.5" />
            {showArchived ? "Viewing Archived" : "View Archived"}
          </Button>
        </div>
      )}

      <div className="flex gap-2 items-center opacity-60 pointer-events-none">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Ask AI about company updates..."
            className="pl-9"
            disabled
          />
        </div>
        <Button size="sm" className="gap-1.5" disabled>
          <Sparkles className="h-4 w-4" />
          Ask AI
        </Button>
        <Badge variant="secondary" className="text-[10px] whitespace-nowrap pointer-events-auto opacity-100">
          Coming Soon
        </Badge>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Badge
          variant={filterCategory === "all" ? "default" : "outline"}
          className="cursor-pointer"
          onClick={() => setFilterCategory("all")}
        >
          All
        </Badge>
        {CATEGORIES.map((c) => (
          <Badge
            key={c.value}
            variant={filterCategory === c.value ? "default" : "outline"}
            className="cursor-pointer gap-1"
            onClick={() => setFilterCategory(c.value)}
          >
            <c.icon className="h-3 w-3" />
            {c.label}
          </Badge>
        ))}
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading...</p>
      ) : filteredDocs.length === 0 ? (
        <p className="text-muted-foreground text-sm">No documents yet.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredDocs.map((doc) => (
            <Card
              key={doc.id}
              className={cn(
                "cursor-pointer hover:border-primary/40 transition-colors relative",
                !readDocIds.includes(doc.id) && !showArchived && "border-primary/30 bg-primary/5"
              )}
              onClick={() => { setSelectedDoc(doc); setView("detail"); markAsRead(doc.id); }}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="gap-1 text-[10px]">
                    {categoryIcon(doc.category)}
                    {categoryLabel(doc.category)}
                  </Badge>
                  {showArchived && (
                    <Badge variant="outline" className="gap-1 text-[10px] text-muted-foreground">
                      <Archive className="h-3 w-3" /> Archived
                    </Badge>
                  )}
                  {doc.file_path && !doc.requires_acknowledgment && <FileText className="h-3 w-3 text-muted-foreground ml-auto" />}
                  {(doc as any).requires_acknowledgment && (
                    isAcknowledged(doc.id, (doc as any).document_version ?? 1) ? (
                      <Badge className="ml-auto gap-1 text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20 border">
                        <CheckCircle2 className="h-3 w-3" /> Acknowledged
                      </Badge>
                    ) : (
                      <Badge className="ml-auto gap-1 text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/20 border">
                        <Clock className="h-3 w-3" /> Pending
                      </Badge>
                    )
                  )}
                </div>
                <CardTitle className="text-sm line-clamp-2">{doc.title}</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {/* Visibility label for admins */}
                {canManageKB && (doc as any).visibility_type === "department_specific" && (
                  <div className="mb-1.5">
                    <Badge variant="outline" className="text-[10px] gap-1">
                      <Building2 className="h-3 w-3" />
                      {(() => {
                        const names = getDocDeptNames(doc.id);
                        if (names.length === 0) return "Specific Departments";
                        if (names.length <= 2) return `Shared with: ${names.join(", ")}`;
                        return `Shared with ${names.length} departments`;
                      })()}
                    </Badge>
                  </div>
                )}
                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center gap-2">
                    <p className="text-[10px] text-muted-foreground">
                      {format(new Date(doc.updated_at), "PP")}
                    </p>
                    {(doc as any).document_version > 1 && (
                      <span className="text-[10px] text-muted-foreground">v{(doc as any).document_version}</span>
                    )}
                  </div>
                  {showArchived && canManageKB && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1"
                      onClick={(e) => { e.stopPropagation(); handleArchive(doc); }}
                    >
                      <ArchiveRestore className="h-3 w-3" /> Restore
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Owner / Super Admin / People & Culture: Policy Acknowledgment Reporting */}
      {(isSuperAdmin || isPcMember) && (
        <div className="mt-8 pt-6 border-t">
          <PolicyAckReporting />
        </div>
      )}

      <DeleteDialog doc={deleteDoc} onConfirm={handleDelete} onCancel={() => setDeleteDoc(null)} />
    </div>
  );
}

function DeleteDialog({
  doc,
  onConfirm,
  onCancel,
}: {
  doc: KBDoc | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <AlertDialog open={!!doc} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Document</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete "{doc?.title}"? This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DetailView({
  doc,
  canManageKB,
  resolveAuthor,
  getPdfUrl,
  onBack,
  onEdit,
  onDelete,
  onArchive,
  deleteDoc,
  onConfirmDelete,
  onCancelDelete,
  isAcknowledged,
  getAckDate,
  onAcknowledge,
}: {
  doc: KBDoc;
  canManageKB: boolean;
  resolveAuthor: (uid: string) => string;
  getPdfUrl: (path: string) => Promise<string>;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onArchive: () => void;
  deleteDoc: KBDoc | null;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  isAcknowledged: (docId: string, version: number) => boolean;
  getAckDate: (docId: string, version: number) => string | null;
  onAcknowledge: (docId: string, version: number) => Promise<void>;
}) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [documentReady, setDocumentReady] = useState(false);
  const [timeLeft, setTimeLeft] = useState(60);
  const REVIEW_SECONDS = 60;

  // Reset timer when doc changes
  useEffect(() => {
    setDocumentReady(false);
    setTimeLeft(REVIEW_SECONDS);
  }, [doc.id, (doc as any).document_version]);

  // Mark document ready once pdfUrl is loaded (or no file)
  useEffect(() => {
    if (pdfUrl || !doc.file_path) {
      setDocumentReady(true);
    }
  }, [pdfUrl, doc.file_path]);

  // Countdown timer
  useEffect(() => {
    if (!documentReady || timeLeft <= 0) return;
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) { clearInterval(interval); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [documentReady, timeLeft]);

  const canAcknowledge = documentReady && timeLeft <= 0;
  const timerLabel = `${Math.floor(timeLeft / 60)}:${String(timeLeft % 60).padStart(2, "0")}`;

  useEffect(() => {
    let isMounted = true;

    const loadPdfUrl = async () => {
      if (!doc.file_path) {
        setPdfUrl(null);
        return;
      }

      try {
        const signedUrl = await getPdfUrl(doc.file_path);
        if (isMounted) setPdfUrl(signedUrl);
      } catch {
        if (isMounted) setPdfUrl(null);
      }
    };

    loadPdfUrl();

    return () => {
      isMounted = false;
    };
  }, [doc.file_path, getPdfUrl]);

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ChevronLeft className="h-4 w-4 mr-1" /> Back
      </Button>
      <Card>
        <CardHeader className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="secondary" className="gap-1">
              {categoryIcon(doc.category)}
              {categoryLabel(doc.category)}
            </Badge>
            {canManageKB && (
              <div className="ml-auto flex gap-1">
                <Button size="sm" variant="outline" onClick={onArchive} title={(doc as any).is_archived ? "Restore" : "Archive"}>
                  {(doc as any).is_archived ? <ArchiveRestore className="h-3 w-3 mr-1" /> : <Archive className="h-3 w-3 mr-1" />}
                  {(doc as any).is_archived ? "Restore" : "Archive"}
                </Button>
                <Button size="sm" variant="outline" onClick={onEdit}>
                  <Pencil className="h-3 w-3 mr-1" /> Edit
                </Button>
                <Button size="sm" variant="destructive" onClick={onDelete}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>
          <CardTitle className="text-xl">{doc.title}</CardTitle>
          <p className="text-xs text-muted-foreground">
            By {resolveAuthor(doc.created_by)} · {format(new Date(doc.updated_at), "PPp")}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {doc.file_path && pdfUrl && (() => {
            const isPdf = doc.file_name?.toLowerCase().endsWith(".pdf");
            return (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <a
                    href={pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary underline"
                  >
                    {doc.file_name || "View File"}
                  </a>
                </div>
                {isPdf ? (
                  <PdfInlineViewer fileUrl={pdfUrl} fileName={doc.file_name || "PDF"} />
                ) : (
                  <p className="text-xs text-muted-foreground">
                    This file type cannot be previewed inline. Click the link above to download.
                  </p>
                )}
              </div>
            );
          })()}

          {/* Acknowledgment section */}
          {(doc as any).requires_acknowledgment && (() => {
            const version = (doc as any).document_version ?? 1;
            const acked = isAcknowledged(doc.id, version);
            const ackDate = getAckDate(doc.id, version);
            return (
              <div className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-primary" />
                  <p className="text-sm font-medium">Policy Acknowledgment Required</p>
                  {version > 1 && <Badge variant="outline" className="text-[10px]">v{version}</Badge>}
                </div>
                {acked ? (
                  <div className="flex items-center gap-2 text-emerald-600">
                    <CheckCircle2 className="h-4 w-4" />
                    <p className="text-sm">Acknowledged on {format(new Date(ackDate!), "PPp")}</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs text-muted-foreground">
                      {!documentReady
                        ? "Loading document..."
                        : timeLeft > 0
                        ? "Please review the document before acknowledging."
                        : "You may now acknowledge this document."}
                    </p>
                    {documentReady && timeLeft > 0 && (
                      <div className="space-y-1.5">
                        <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary">
                          <div
                            className="h-full bg-primary transition-all duration-1000 ease-linear"
                            style={{ width: `${((REVIEW_SECONDS - timeLeft) / REVIEW_SECONDS) * 100}%` }}
                          />
                        </div>
                        <p className="text-[11px] text-muted-foreground text-center">{timerLabel} remaining</p>
                      </div>
                    )}
                    <Button
                      size="sm"
                      disabled={!canAcknowledge}
                      onClick={(e) => { e.stopPropagation(); onAcknowledge(doc.id, version); }}
                      className="gap-1.5"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {canAcknowledge ? "Read & Acknowledge" : `Read & Acknowledge (${timerLabel})`}
                    </Button>
                  </div>
                )}
              </div>
            );
          })()}
        </CardContent>
      </Card>
      <DeleteDialog doc={deleteDoc} onConfirm={onConfirmDelete} onCancel={onCancelDelete} />
    </div>
  );
}
