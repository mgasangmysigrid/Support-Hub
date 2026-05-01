import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  ResizablePanelGroup, ResizablePanel, ResizableHandle,
} from "@/components/ui/resizable";
import {
  Plus, Trash2, Copy, History, ArrowLeft, Ban, Pencil,
  CheckCircle2, PlayCircle, XCircle, Send, ChevronDown, Check, Lock, ExternalLink,
} from "lucide-react";
import {
  useEndorsement, useEndorsementItems, useEndorsementReferences,
  useEndorsementRecipients,
  useSaveEndorsement, useDeleteEndorsement,
  type EndorsementReference, type EndorsementStatus,
} from "@/hooks/useEndorsements";
import EndorsementMultiRecipientPicker from "@/components/endorsements/EndorsementMultiRecipientPicker";
import EndorsementAuditTrail from "@/components/endorsements/EndorsementAuditTrail";

const URGENCIES = [
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

const TASK_STATUSES = [
  { value: "not_started", label: "Not Started", className: "bg-muted text-muted-foreground" },
  { value: "acknowledged", label: "Acknowledged", className: "bg-blue-500/10 text-blue-600" },
  { value: "in_progress", label: "In Progress", className: "bg-amber-500/10 text-amber-600" },
  { value: "made_progress", label: "Made Progress", className: "bg-orange-500/10 text-orange-600" },
  { value: "done", label: "Done", className: "bg-emerald-500/10 text-emerald-600" },
];

const RECIPIENT_TASK_STATUSES = [
  { value: "done", label: "Done", pill: "bg-emerald-600 text-white" },
  { value: "made_progress", label: "Made Progress", pill: "bg-amber-500 text-white" },
  { value: "not_started", label: "Untouched", pill: "bg-red-700 text-white" },
];

const statusStyles: Record<string, { className: string; label: string }> = {
  draft: { className: "bg-muted text-muted-foreground border-0", label: "Draft" },
  open: { className: "bg-blue-500/10 text-blue-600 border-0", label: "Open" },
  acknowledged: { className: "bg-emerald-500/10 text-emerald-600 border-0", label: "Acknowledged" },
  in_progress: { className: "bg-amber-500/10 text-amber-600 border-0", label: "In Progress" },
  closed: { className: "bg-muted text-muted-foreground border-0", label: "Closed" },
  cancelled: { className: "bg-red-500/10 text-red-600 border-0", label: "Cancelled" },
};

type TaskReference = { tool_name: string; url: string; notes: string };

type SimplifiedItem = {
  _tempId: string;
  id?: string;
  sort_order: number;
  endorsed_to_user_ids: string[];
  endorsement_notes: string;
  urgency: string;
  task_status: string;
  task_update_notes?: string;
  client_name?: string;
  references: TaskReference[];
};

type NewRef = Omit<EndorsementReference, "id" | "endorsement_id" | "created_at" | "updated_at"> & { _tempId: string };

/* ── Per-panel size persistence (per-user) ── */
function getPanelSizeKey(userId?: string) {
  return `endorsement-task-panel-sizes:${userId || "anon"}`;
}
function getSavedPanelSize(userId?: string): number {
  try {
    const v = localStorage.getItem(getPanelSizeKey(userId));
    if (v) return Math.max(20, Math.min(80, Number(v)));
  } catch {}
  return 55;
}
function savePanelSize(size: number, userId?: string) {
  try { localStorage.setItem(getPanelSizeKey(userId), String(Math.round(size))); } catch {}
}

/* ── Recipient Task Card with per-task autosave + resizable panels ── */
function RecipientTaskCard({ item, index, assignees, getAssigneeName, canEdit, isLocked, endorsementId, onStatusChange, userId }: {
  item: SimplifiedItem;
  index: number;
  assignees: string[];
  getAssigneeName: (uid: string) => string;
  canEdit: boolean;
  isLocked: boolean;
  endorsementId: string;
  onStatusChange: (itemId: string, status: string) => Promise<void>;
  userId?: string;
}) {
  const [notes, setNotes] = useState(item.task_update_notes ?? "");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [defaultLeftSize] = useState(() => getSavedPanelSize(userId));
  const lastNotifiedRef = useRef<string>(""); // track last notified value to prevent spam

  useEffect(() => {
    setNotes(item.task_update_notes ?? "");
    lastNotifiedRef.current = item.task_update_notes ?? "";
  }, [item.task_update_notes]);

  // Silent save (no notification) - used by debounce
  const silentSave = useCallback(async (value: string) => {
    if (!item.id) return;
    setSaveState("saving");
    try {
      await supabase.from("leave_endorsement_items").update({ task_update_notes: value } as any).eq("id", item.id);
      setSaveState("saved");
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSaveState("idle"), 2000);
    } catch { setSaveState("idle"); }
  }, [item.id]);

  // Save with notification - only called on blur, and only if content actually changed
  const saveAndNotify = useCallback(async (value: string) => {
    if (!item.id) return;
    setSaveState("saving");
    try {
      await supabase.from("leave_endorsement_items").update({ task_update_notes: value } as any).eq("id", item.id);
      // Only notify if content actually changed from last notified value
      if (userId && endorsementId && value.trim() !== lastNotifiedRef.current.trim()) {
        lastNotifiedRef.current = value;
        const { data: endorsement } = await supabase.from("leave_endorsements").select("employee_user_id").eq("id", endorsementId).maybeSingle();
        if (endorsement && endorsement.employee_user_id !== userId) {
          // Upsert: delete existing unread task-update notif for this endorsement, then insert fresh one
          await supabase.from("notifications").delete()
            .eq("user_id", endorsement.employee_user_id)
            .eq("actor_id", userId)
            .eq("type", "endorsement_task_updated")
            .like("link", `%/leave/endorsements/${endorsementId}%`)
            .eq("is_read", false);
          const { data: ap } = await supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle();
          await supabase.from("notifications").insert({
            user_id: endorsement.employee_user_id, actor_id: userId, type: "endorsement_task_updated",
            title: "Task Update", body: `${ap?.full_name || "A recipient"} updated Task ${index + 1}.`,
            link: `/leave/endorsements/${endorsementId}`,
          });
        }
      }
      setSaveState("saved");
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSaveState("idle"), 2000);
    } catch { setSaveState("idle"); }
  }, [item.id, userId, endorsementId, index]);

  const handleNotesChange = (value: string) => {
    setNotes(value);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => silentSave(value), 1000);
  };

  const handleBlur = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    saveAndNotify(notes);
  };

  const currentStatus = RECIPIENT_TASK_STATUSES.find((s) => s.value === item.task_status)
    || (item.task_status === "in_progress" || item.task_status === "acknowledged"
      ? RECIPIENT_TASK_STATUSES[1]
      : RECIPIENT_TASK_STATUSES[2]);

  const effectiveCanEdit = canEdit && !isLocked;

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="px-3 py-1.5 bg-muted/30 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-muted-foreground">Task {index + 1}</span>
          {isLocked && <Lock className="h-3 w-3 text-muted-foreground" />}
        </div>
        <div className="flex items-center gap-2">
          {saveState === "saving" && <span className="text-[10px] text-muted-foreground animate-pulse">Saving...</span>}
          {saveState === "saved" && <span className="text-[10px] text-emerald-600 flex items-center gap-0.5"><Check className="h-3 w-3" />Saved</span>}
          <Badge className={`${currentStatus.pill} border-0 text-[9px] font-semibold`}>{currentStatus.label}</Badge>
        </div>
      </div>
      <ResizablePanelGroup direction="horizontal" onLayout={(sizes) => { if (sizes[0]) savePanelSize(sizes[0], userId); }}>
        <ResizablePanel defaultSize={defaultLeftSize} minSize={25}>
          <div className="p-3 space-y-2.5 bg-background h-full">
            <div>
              <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Client / Department</span>
              <p className="text-xs mt-0.5">{item.client_name || "—"}</p>
            </div>
            <div>
              <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Task Description</span>
              <p className="text-xs mt-0.5 whitespace-pre-wrap leading-relaxed">{item.endorsement_notes || "—"}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={`border-0 text-[9px] ${item.urgency === "critical" ? "bg-red-500/10 text-red-600" : item.urgency === "high" ? "bg-amber-500/10 text-amber-600" : "bg-muted text-muted-foreground"}`}>
                {item.urgency}
              </Badge>
            </div>
            {/* Per-task references (read-only) */}
            {item.references && item.references.length > 0 && (
              <div className="pt-1 border-t">
                <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">References</span>
                <div className="space-y-1 mt-1">
                  {item.references.map((ref, ri) => (
                    <div key={ri} className="flex items-center gap-1.5 text-[11px]">
                      <span className="font-medium">{ref.tool_name}</span>
                      {ref.url && (
                        <a href={ref.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center gap-0.5 truncate max-w-[200px]">
                          <ExternalLink className="h-2.5 w-2.5 shrink-0" />{ref.url}
                        </a>
                      )}
                      {ref.notes && <span className="text-muted-foreground truncate">— {ref.notes}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={100 - defaultLeftSize} minSize={25}>
          <div className={`p-3 space-y-3 h-full ${effectiveCanEdit ? "bg-yellow-50 dark:bg-yellow-950/20" : "bg-muted/10"}`}>
            {isLocked && (
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground bg-muted/40 rounded px-2 py-1">
                <Lock className="h-3 w-3" /> Accept endorsement to start updating
              </div>
            )}
            <div className="space-y-0.5">
              <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Updates</span>
              {effectiveCanEdit ? (
                <Textarea
                  value={notes}
                  onChange={(e) => handleNotesChange(e.target.value)}
                  onBlur={handleBlur}
                  placeholder="Write your updates here..."
                  rows={5}
                  className="resize-y text-xs bg-background border-yellow-300 focus:border-yellow-400"
                />
              ) : (
                <p className="text-xs whitespace-pre-wrap min-h-[60px] rounded-md border bg-background p-2">{notes || <span className="text-muted-foreground italic">No updates yet</span>}</p>
              )}
            </div>
            <div className="space-y-0.5">
              <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Assignee</span>
              <p className="text-xs font-medium">
                {assignees.length > 0 ? assignees.map((uid) => getAssigneeName(uid)).join(", ") : "—"}
              </p>
            </div>
            <div className="space-y-0.5">
              <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Status</span>
              {effectiveCanEdit && item.id ? (
                <Select value={item.task_status} onValueChange={(v) => onStatusChange(item.id!, v)}>
                  <SelectTrigger className={`h-7 text-[11px] w-full font-semibold rounded-full ${currentStatus.pill}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RECIPIENT_TASK_STATUSES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${s.pill}`}>{s.label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Badge className={`${currentStatus.pill} border-0 text-[10px] font-semibold`}>{currentStatus.label}</Badge>
              )}
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

export default function EndorsementDetailPage() {
  const { id: endorsementId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isSuperAdmin, isPcMember } = useAuth();
  const qc = useQueryClient();

  const { data: endorsement, isLoading } = useEndorsement(endorsementId || "");
  const { data: existingItems } = useEndorsementItems(endorsementId || "");
  const { data: existingRefs } = useEndorsementReferences(endorsementId || "");
  const { data: recipients } = useEndorsementRecipients(endorsementId || "");
  const saveEndorsement = useSaveEndorsement();
  const deleteEndorsement = useDeleteEndorsement();

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showOwnerDeleteConfirm, setShowOwnerDeleteConfirm] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [editingOpen, setEditingOpen] = useState(false);

  const { data: itemAssignees } = useQuery({
    queryKey: ["endorsement-item-assignees", endorsementId],
    enabled: !!endorsementId && !!existingItems && existingItems.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("endorsement_item_assignees")
        .select("endorsement_item_id, user_id")
        .in("endorsement_item_id", (existingItems || []).map((i) => i.id));
      if (error) throw error;
      return data || [];
    },
  });

  const allUserIds = useMemo(() => {
    const ids = new Set<string>();
    (itemAssignees || []).forEach((a) => ids.add(a.user_id));
    (recipients || []).forEach((r) => ids.add(r.recipient_user_id));
    return [...ids];
  }, [itemAssignees, recipients]);

  const { data: profileMap } = useQuery({
    queryKey: ["profiles-map", allUserIds.join(",")],
    enabled: allUserIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", allUserIds);
      if (error) throw error;
      const map: Record<string, { full_name: string | null; email: string | null }> = {};
      (data || []).forEach((p) => { map[p.id] = { full_name: p.full_name, email: p.email }; });
      return map;
    },
  });

  const isRecipient = (recipients || []).some((r) => r.recipient_user_id === user?.id);
  const myRecipientRecord = (recipients || []).find((r) => r.recipient_user_id === user?.id);
  const isEmployee = endorsement?.employee_user_id === user?.id;
  const isAdmin = isSuperAdmin || isPcMember;
  const canEdit = (isEmployee || isAdmin) && (endorsement?.status === "draft" || (endorsement?.status === "open" && editingOpen));
  const canEditOpen = (isEmployee || isAdmin) && endorsement?.status === "open";
  const canCancelEndorsement = (isEmployee || isAdmin) && endorsement?.status !== "closed" && endorsement?.status !== "cancelled";
  const canAcknowledge = isRecipient && endorsement?.status === "open" && myRecipientRecord?.status === "pending";
  const recipientHasAccepted = isRecipient && myRecipientRecord?.status === "acknowledged";
  const recipientIsLocked = isRecipient && !recipientHasAccepted && !isEmployee && !isAdmin;
  const canMarkInProgress = (isEmployee || isAdmin) && endorsement?.status === "acknowledged";
  const canClose = (isEmployee || isAdmin) && (endorsement?.status === "in_progress" || endorsement?.status === "acknowledged");
  const canDeleteDraft = endorsement?.status === "draft" && (isEmployee || isAdmin);
  const canOwnerDelete = isSuperAdmin;
  const canView = isEmployee || isRecipient || isAdmin;

  const canUpdateTaskStatus = (itemAssigneeIds: string[]) => {
    if (isEmployee || isAdmin) return true;
    return user ? itemAssigneeIds.includes(user.id) : false;
  };

  const isTaskVisible = (itemAssigneeIds: string[]) => {
    if (isEmployee || isAdmin) return true;
    return user ? itemAssigneeIds.includes(user.id) : false;
  };

  // Form state
  const [items, setItems] = useState<SimplifiedItem[]>([]);
  const [saving, setSaving] = useState(false);

  // Parse reference_links JSON into typed refs per task
  const parseRefs = (refLinks: any): TaskReference[] => {
    if (!refLinks) return [];
    try {
      const arr = typeof refLinks === "string" ? JSON.parse(refLinks) : refLinks;
      if (Array.isArray(arr)) return arr.map((r: any) => ({ tool_name: r.tool_name || "", url: r.url || "", notes: r.notes || "" }));
    } catch {}
    return [];
  };

  useEffect(() => {
    if (existingItems) {
      const aMap: Record<string, string[]> = {};
      if (itemAssignees) {
        for (const a of itemAssignees) {
          if (!aMap[a.endorsement_item_id]) aMap[a.endorsement_item_id] = [];
          aMap[a.endorsement_item_id].push(a.user_id);
        }
      }
      setItems(existingItems.map((item) => ({
        _tempId: item.id,
        id: item.id,
        sort_order: item.sort_order,
        endorsed_to_user_ids: aMap[item.id] || (item.endorsed_to_user_id ? [item.endorsed_to_user_id] : []),
        endorsement_notes: (item as any).endorsement_notes || item.task_details || "",
        urgency: (item as any).urgency || "normal",
        task_status: (item as any).task_status || "not_started",
        task_update_notes: (item as any).task_update_notes || "",
        client_name: item.client_name || "",
        references: parseRefs(item.reference_links),
      })));
    }
  }, [existingItems, itemAssignees]);

  const addItem = () => setItems((p) => [...p, { _tempId: crypto.randomUUID(), sort_order: p.length, endorsed_to_user_ids: [], endorsement_notes: "", urgency: "normal", task_status: "not_started", references: [] }]);
  const duplicateItem = (idx: number) => { const s = items[idx]; setItems((p) => [...p, { ...s, _tempId: crypto.randomUUID(), id: undefined, sort_order: p.length }]); };
  const removeItem = (idx: number) => setItems((p) => p.filter((_, i) => i !== idx));
  const updateItem = (idx: number, field: keyof SimplifiedItem, value: any) => setItems((p) => p.map((item, i) => (i === idx ? { ...item, [field]: value } : item)));

  // Per-task reference helpers
  const addTaskRef = (idx: number) => {
    const newRefs = [...items[idx].references, { tool_name: "", url: "", notes: "" }];
    updateItem(idx, "references", newRefs);
  };
  const removeTaskRef = (itemIdx: number, refIdx: number) => {
    const newRefs = items[itemIdx].references.filter((_, i) => i !== refIdx);
    updateItem(itemIdx, "references", newRefs);
  };
  const updateTaskRef = (itemIdx: number, refIdx: number, field: string, value: string) => {
    const newRefs = items[itemIdx].references.map((r, i) => i === refIdx ? { ...r, [field]: value } : r);
    updateItem(itemIdx, "references", newRefs);
  };

  const logAuditEntries = async (action: string) => {
    if (!user || !endorsement) return;
    await supabase.from("endorsement_audit_log").insert({
      endorsement_id: endorsement.id, endorsement_item_id: null,
      actor_id: user.id, action, field_name: null, old_value: null, new_value: null,
    });
    qc.invalidateQueries({ queryKey: ["endorsement-audit", endorsement.id] });
  };

  const saveItemsAndRefs = async () => {
    if (!endorsementId) return;
    const existingItemIds = new Set((existingItems || []).map((i) => i.id));
    const currentItemIds = new Set(items.filter((i) => i.id).map((i) => i.id!));
    const removedIds = [...existingItemIds].filter((id) => !currentItemIds.has(id));
    if (removedIds.length > 0) await supabase.from("leave_endorsement_items").delete().in("id", removedIds);

    for (const item of items.filter((i) => i.id && existingItemIds.has(i.id!))) {
      await supabase.from("leave_endorsement_items").update({
        sort_order: items.indexOf(item), task_name: `Item ${items.indexOf(item) + 1}`,
        task_details: item.endorsement_notes, endorsement_notes: item.endorsement_notes,
        urgency: item.urgency, task_status: item.task_status,
        client_name: item.client_name || null,
        reference_links: item.references.length > 0 ? item.references : null,
      }).eq("id", item.id!);
      await supabase.from("endorsement_item_assignees").delete().eq("endorsement_item_id", item.id!);
      if (item.endorsed_to_user_ids.length > 0) {
        await supabase.from("endorsement_item_assignees").insert(
          item.endorsed_to_user_ids.map((uid) => ({ endorsement_item_id: item.id!, user_id: uid }))
        );
      }
    }

    const newItems = items.filter((i) => !i.id);
    if (newItems.length > 0) {
      const { data: inserted } = await supabase.from("leave_endorsement_items").insert(
        newItems.map((item, idx) => ({
          endorsement_id: endorsementId, sort_order: items.indexOf(item),
          task_name: `Item ${items.indexOf(item) + 1}`, task_details: item.endorsement_notes,
          endorsement_notes: item.endorsement_notes, urgency: item.urgency, task_status: item.task_status,
          task_type: "one_time" as any, priority: "normal" as any,
          client_name: item.client_name || null,
          reference_links: item.references.length > 0 ? item.references : null,
        }))
      ).select("id");
      if (inserted) {
        const rows: { endorsement_item_id: string; user_id: string }[] = [];
        inserted.forEach((ins, i) => {
          for (const uid of newItems[i].endorsed_to_user_ids) rows.push({ endorsement_item_id: ins.id, user_id: uid });
        });
        if (rows.length > 0) await supabase.from("endorsement_item_assignees").insert(rows);
      }
    }

    // Clean up old endorsement-level references (migrate to per-task)
    await supabase.from("leave_endorsement_references").delete().eq("endorsement_id", endorsementId);

    qc.invalidateQueries({ queryKey: ["endorsement-items", endorsementId] });
    qc.invalidateQueries({ queryKey: ["endorsement-item-assignees", endorsementId] });
    qc.invalidateQueries({ queryKey: ["endorsement-references", endorsementId] });
  };

  const syncRecipientsFromTasks = async () => {
    if (!endorsementId) return;
    const allAssigneeIds = new Set<string>();
    items.forEach((item) => item.endorsed_to_user_ids.forEach((uid) => allAssigneeIds.add(uid)));
    await supabase.from("leave_endorsement_recipients").delete().eq("endorsement_id", endorsementId);
    const recipientIds = [...allAssigneeIds];
    if (recipientIds.length > 0) {
      await supabase.from("leave_endorsement_recipients").insert(
        recipientIds.map((uid) => ({ endorsement_id: endorsementId, recipient_user_id: uid }))
      );
    }
    qc.invalidateQueries({ queryKey: ["endorsement-recipients", endorsementId] });
    return recipientIds;
  };

  const handleSaveDraft = async () => {
    if (!endorsement) return;
    setSaving(true);
    try {
      await saveItemsAndRefs();
      await syncRecipientsFromTasks();
      await saveEndorsement.mutateAsync({ id: endorsement.id });
      await logAuditEntries("draft_saved");
      toast.success("Draft saved");
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const handleSubmit = async () => {
    if (!endorsement || !user) return;
    if (items.length === 0) { toast.error("At least one endorsement item is required"); return; }
    const allAssignees = new Set<string>();
    items.forEach((i) => i.endorsed_to_user_ids.forEach((uid) => allAssignees.add(uid)));
    if (allAssignees.size === 0) { toast.error("At least one task must have an assignee"); return; }
    const inv = items.findIndex((i) => !i.endorsement_notes.trim());
    if (inv >= 0) { toast.error(`Item ${inv + 1}: endorsement notes are required`); return; }
    setSaving(true);
    try {
      await saveItemsAndRefs();
      const recipientIds = await syncRecipientsFromTasks() || [];
      await saveEndorsement.mutateAsync({
        id: endorsement.id, status: "open" as any,
        submitted_at: new Date().toISOString(), submitted_by: user.id,
      });
      const rIds = recipientIds.filter((id) => id !== user.id);
      if (rIds.length > 0) {
        const { data: ep } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
        await supabase.from("notifications").insert(rIds.map((rid) => ({
          user_id: rid, actor_id: user.id, type: "endorsement_submitted",
          title: "New Endorsement",
          body: `${ep?.full_name || "An employee"} submitted a handover endorsement for your acknowledgement.`,
          link: `/leave/endorsements/${endorsement.id}`,
        })));
      }
      await logAuditEntries("submitted");
      toast.success("Endorsement submitted!");
      qc.invalidateQueries({ queryKey: ["endorsement-badge"] });
      navigate("/leave/endorsements");
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const handleAcknowledge = async () => {
    if (!endorsement || !user || !myRecipientRecord) return;
    setSaving(true);
    try {
      await supabase.from("leave_endorsement_recipients").update({
        status: "acknowledged", acknowledged_at: new Date().toISOString(),
      }).eq("id", myRecipientRecord.id);
      // Notify endorser that recipient accepted
      if (endorsement.employee_user_id !== user.id) {
        const { data: ap } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
        await supabase.from("notifications").insert({
          user_id: endorsement.employee_user_id, actor_id: user.id, type: "endorsement_acknowledged",
          title: "Endorsement Accepted",
          body: `${ap?.full_name || "A recipient"} accepted your endorsement.`,
          link: `/leave/endorsements/${endorsement.id}`,
        });
      }
      await logAuditEntries("acknowledged");
      toast.success("Endorsement accepted!");
      qc.invalidateQueries({ queryKey: ["endorsement", endorsement.id] });
      qc.invalidateQueries({ queryKey: ["endorsement-recipients", endorsement.id] });
      qc.invalidateQueries({ queryKey: ["endorsements"] });
      qc.invalidateQueries({ queryKey: ["endorsement-badge"] });
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const handleStatusChange = async (newStatus: EndorsementStatus) => {
    if (!endorsement || !user) return;
    setSaving(true);
    try {
      await saveEndorsement.mutateAsync({ id: endorsement.id, status: newStatus as any });
      await logAuditEntries(`status_changed_to_${newStatus}`);
      toast.success(`Endorsement marked as ${newStatus.replace(/_/g, " ")}`);
      qc.invalidateQueries({ queryKey: ["endorsement", endorsement.id] });
      qc.invalidateQueries({ queryKey: ["endorsements"] });
      qc.invalidateQueries({ queryKey: ["endorsement-badge"] });
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const handleDeleteDraft = async () => {
    if (!endorsement) return;
    try {
      await deleteEndorsement.mutateAsync(endorsement.id);
      toast.success("Draft endorsement deleted");
      navigate("/leave/endorsements");
    } catch (err: any) { toast.error(err.message); }
    setShowDeleteConfirm(false);
  };

  const handleOwnerDelete = async () => {
    if (!endorsement || !user) return;
    try {
      await supabase.from("endorsement_audit_log").insert({
        endorsement_id: endorsement.id, actor_id: user.id, action: "delete_endorsement",
        field_name: "control_number", old_value: (endorsement as any).control_number || endorsement.id, new_value: null,
      });
      await supabase.from("notifications").delete().like("link", `%/leave/endorsements/${endorsement.id}%`);
      await deleteEndorsement.mutateAsync(endorsement.id);
      toast.success("Endorsement deleted successfully");
      qc.invalidateQueries({ queryKey: ["endorsement-badge"] });
      navigate("/leave/endorsements");
    } catch (err: any) {
      toast.error(`Failed to delete: ${err.message}`);
    }
    setShowOwnerDeleteConfirm(false);
  };

  const handleSaveOpenEdit = async () => {
    if (!endorsement || !user) return;
    setSaving(true);
    try {
      await saveItemsAndRefs();
      const recipientIds = await syncRecipientsFromTasks() || [];
      await saveEndorsement.mutateAsync({ id: endorsement.id });
      await logAuditEntries("edited");
      const rIds = recipientIds.filter((id) => id !== user.id);
      if (rIds.length > 0) {
        const { data: ep } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
        await supabase.from("notifications").insert(rIds.map((rid) => ({
          user_id: rid, actor_id: user.id, type: "endorsement_updated",
          title: "Endorsement Updated",
          body: `${ep?.full_name || "An employee"} updated a handover endorsement assigned to you.`,
          link: `/leave/endorsements/${endorsement.id}`,
        })));
      }
      setEditingOpen(false);
      toast.success("Endorsement updated");
      qc.invalidateQueries({ queryKey: ["endorsement-badge"] });
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const handleCancelEndorsement = async () => {
    if (!endorsement || !user) return;
    setSaving(true);
    try {
      await supabase.from("leave_endorsements").update({ status: "cancelled" } as any).eq("id", endorsement.id);
      await logAuditEntries("cancelled");
      const rIds = (recipients || []).map((r) => r.recipient_user_id).filter((id) => id !== user.id);
      if (rIds.length > 0) {
        const { data: ep } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
        await supabase.from("notifications").insert(rIds.map((rid) => ({
          user_id: rid, actor_id: user.id, type: "endorsement_cancelled",
          title: "Endorsement Cancelled",
          body: `${ep?.full_name || "An employee"} cancelled an endorsement.`,
          link: `/leave/endorsements/${endorsement.id}`,
        })));
      }
      toast.success("Endorsement cancelled");
      qc.invalidateQueries({ queryKey: ["endorsement", endorsement.id] });
      qc.invalidateQueries({ queryKey: ["endorsements"] });
      navigate("/leave/endorsements");
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); setShowCancelConfirm(false); }
  };

  const handleTaskStatusChange = async (itemId: string, newStatus: string) => {
    try {
      await supabase.from("leave_endorsement_items").update({ task_status: newStatus }).eq("id", itemId);
      // Notify endorser about status change
      if (user && endorsement && endorsement.employee_user_id !== user.id) {
        const statusLabel = RECIPIENT_TASK_STATUSES.find((s) => s.value === newStatus)?.label || newStatus;
        const { data: ap } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
        await supabase.from("notifications").insert({
          user_id: endorsement.employee_user_id, actor_id: user.id, type: "endorsement_task_updated",
          title: "Task Status Changed",
          body: `${ap?.full_name || "A recipient"} marked a task as "${statusLabel}".`,
          link: `/leave/endorsements/${endorsementId}`,
        });
      }
      qc.invalidateQueries({ queryKey: ["endorsement-items", endorsementId] });
      qc.invalidateQueries({ queryKey: ["endorsement", endorsementId] });
      qc.invalidateQueries({ queryKey: ["endorsements"] });
      qc.invalidateQueries({ queryKey: ["endorsement-badge"] });
      toast.success("Task status updated");
    } catch (err: any) { toast.error(err.message); }
  };

  const goBack = () => navigate("/leave/endorsements");

  const assigneeMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    (itemAssignees || []).forEach((a) => {
      if (!map[a.endorsement_item_id]) map[a.endorsement_item_id] = [];
      map[a.endorsement_item_id].push(a.user_id);
    });
    return map;
  }, [itemAssignees]);

  const getAssigneeName = (uid: string) => profileMap?.[uid]?.full_name || profileMap?.[uid]?.email || uid.slice(0, 8);

  const visibleItems = useMemo(() => {
    return items.filter((item) => {
      const assignees = item.id ? (assigneeMap[item.id] || []) : item.endorsed_to_user_ids;
      return isTaskVisible(assignees);
    });
  }, [items, assigneeMap, isEmployee, isAdmin, user]);

  const deleteImpactSummary = useMemo(() => {
    const taskCount = (existingItems || []).length;
    const assigneeCount = new Set((itemAssignees || []).map((a) => a.user_id)).size;
    const recipientCount = (recipients || []).length;
    return { taskCount, assigneeCount, recipientCount };
  }, [existingItems, itemAssignees, recipients]);

  // Mark endorsement notifications as read when user navigates away (not auto-timer)
  // This ensures unread signals persist while the user is actively viewing
  const markReadRef = useRef(false);
  useEffect(() => {
    markReadRef.current = false;
    return () => {
      // Cleanup on unmount = user navigated away = they "consumed" the view
      if (!markReadRef.current && user && endorsementId) {
        markReadRef.current = true;
        supabase
          .from("notifications")
          .update({ is_read: true })
          .eq("user_id", user.id)
          .eq("is_read", false)
          .like("link", `%/leave/endorsements/${endorsementId}%`)
          .then(() => {
            qc.invalidateQueries({ queryKey: ["endorsement-badge"] });
          });
      }
    };
  }, [user, endorsementId]);

  if (isLoading) return <div className="flex min-h-[60vh] items-center justify-center text-muted-foreground">Loading endorsement...</div>;
  if (!endorsement) return (
    <div className="space-y-4 py-12 text-center">
      <p className="text-muted-foreground">Endorsement not found.</p>
      <Button variant="outline" onClick={goBack}><ArrowLeft className="h-4 w-4 mr-2" />Back</Button>
    </div>
  );

  const style = statusStyles[endorsement.status] || statusStyles.draft;
  const isTerminal = endorsement.status === "closed" || endorsement.status === "cancelled";
  const controlNumber = (endorsement as any).control_number || "—";

  // Recipient progress summary
  const ackCount = (recipients || []).filter((r) => r.status === "acknowledged").length;
  const totalRecipients = (recipients || []).length;

  return (
    <div className="max-w-6xl mx-auto space-y-3">
      {/* ── HEADER ── */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={goBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs text-muted-foreground">{controlNumber}</span>
              <Badge variant="outline" className={style.className}>{style.label}</Badge>
              {totalRecipients > 0 && (
                <span className="text-[10px] text-muted-foreground">
                  {ackCount}/{totalRecipients} accepted
                </span>
              )}
            </div>
            <h1 className="text-base font-semibold truncate">
              {endorsement.employee?.full_name || "—"} · {endorsement.leave_type?.replace(/_/g, " ")} Leave
            </h1>
            <p className="text-[11px] text-muted-foreground">
              {format(new Date(endorsement.leave_start_date), "MMM d")} – {format(new Date(endorsement.leave_end_date), "MMM d, yyyy")}
              {endorsement.department?.name && ` · ${endorsement.department.name}`}
              {endorsement.return_date && ` · Returns ${format(new Date(endorsement.return_date), "MMM d")}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0 flex-wrap">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 text-xs"><History className="h-3 w-3 mr-1" />Audit</Button>
            </SheetTrigger>
            <SheetContent className="w-[360px] sm:w-[400px]">
              <SheetHeader><SheetTitle className="flex items-center gap-2"><History className="h-4 w-4" />Audit Trail</SheetTitle></SheetHeader>
              <div className="mt-4"><EndorsementAuditTrail endorsementId={endorsementId || ""} /></div>
            </SheetContent>
          </Sheet>
          {canDeleteDraft && <Button variant="outline" size="sm" className="h-7 text-xs text-destructive" onClick={() => setShowDeleteConfirm(true)}><Trash2 className="h-3 w-3" /></Button>}
          {canOwnerDelete && !canDeleteDraft && <Button variant="outline" size="sm" className="h-7 text-xs text-destructive" onClick={() => setShowOwnerDeleteConfirm(true)}><Trash2 className="h-3 w-3 mr-1" />Delete</Button>}
          {canCancelEndorsement && !isTerminal && <Button variant="outline" size="sm" className="h-7 text-xs text-destructive" onClick={() => setShowCancelConfirm(true)}><Ban className="h-3 w-3 mr-1" />Cancel</Button>}
          {canEditOpen && !editingOpen && <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setEditingOpen(true)}><Pencil className="h-3 w-3 mr-1" />Edit</Button>}
          {editingOpen && (
            <>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setEditingOpen(false)}>Cancel</Button>
              <Button size="sm" className="h-7 text-xs" onClick={handleSaveOpenEdit} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
            </>
          )}
          {canMarkInProgress && <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleStatusChange("in_progress")} disabled={saving}><PlayCircle className="h-3 w-3 mr-1" />In Progress</Button>}
          {canClose && <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleStatusChange("closed")} disabled={saving}><XCircle className="h-3 w-3 mr-1" />Close</Button>}
          {canEdit && !editingOpen && endorsement.status === "draft" && (
            <>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleSaveDraft} disabled={saving}>{saving ? "Saving..." : "Save Draft"}</Button>
              <Button size="sm" className="h-7 text-xs" onClick={handleSubmit} disabled={saving}>{saving ? "..." : "Submit"}</Button>
            </>
          )}
        </div>
      </div>

      <Separator />

      {/* ── ACCEPT ENDORSEMENT BANNER (replaces old acknowledge bar) ── */}
      {canAcknowledge && (
        <div className="rounded-lg border-2 border-blue-300 bg-blue-50/60 dark:border-blue-800 dark:bg-blue-950/30 p-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
            <div className="flex-1 space-y-1.5">
              <p className="text-sm font-semibold text-foreground">Please accept this endorsement before starting</p>
              <p className="text-xs text-muted-foreground">Once accepted, you can update each task individually.</p>
            </div>
            <Button onClick={handleAcknowledge} disabled={saving} size="sm" className="shrink-0">
              {saving ? "..." : "Accept Endorsement"}
            </Button>
          </div>
        </div>
      )}

      {/* ── ACCEPTED INDICATOR ── */}
      {recipientHasAccepted && !isEmployee && !isAdmin && (
        <div className="flex items-center gap-1.5 text-xs text-emerald-600">
          <CheckCircle2 className="h-3.5 w-3.5" />
          <span>You accepted this endorsement on {myRecipientRecord?.acknowledged_at ? format(new Date(myRecipientRecord.acknowledged_at), "MMM d, h:mm a") : "—"}</span>
        </div>
      )}

      {/* ── TASK WORKING SHEET ── */}
      <div className="rounded-md border">
        <div className="flex items-center justify-between px-2.5 py-1.5 border-b bg-muted/30">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Endorsement Tasks</span>
          {canEdit && <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={addItem}><Plus className="h-3 w-3 mr-1" />Add</Button>}
        </div>
        {visibleItems.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">No tasks yet. Click "Add" to create one.</p>
        ) : canEdit ? (
          <div className="divide-y">
            {items.map((item, idx) => (
              <div key={item._tempId} className="p-2.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-muted-foreground">Task {idx + 1}</span>
                  <div className="flex gap-0.5">
                    <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => duplicateItem(idx)}><Copy className="h-2.5 w-2.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-5 w-5 text-destructive" onClick={() => removeItem(idx)}><Trash2 className="h-2.5 w-2.5" /></Button>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-1.5">
                  <div className="space-y-0.5">
                    <Label className="text-[10px]">Client / Dept</Label>
                    <input className="flex h-7 w-full rounded-md border border-input bg-background px-2 py-1 text-[11px]" value={item.client_name || ""} onChange={(e) => updateItem(idx, "client_name", e.target.value)} placeholder="Client name" />
                  </div>
                  <div className="space-y-0.5">
                    <Label className="text-[10px]">Endorse To</Label>
                    <EndorsementMultiRecipientPicker value={item.endorsed_to_user_ids} onChange={(ids) => updateItem(idx, "endorsed_to_user_ids", ids)} disabled={!canEdit} />
                  </div>
                  <div className="space-y-0.5">
                    <Label className="text-[10px]">Urgency</Label>
                    <Select value={item.urgency} onValueChange={(v) => updateItem(idx, "urgency", v)}>
                      <SelectTrigger className="h-7 text-[11px]"><SelectValue /></SelectTrigger>
                      <SelectContent>{URGENCIES.map((u) => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-0.5">
                  <Label className="text-[10px]">Notes *</Label>
                  <Textarea value={item.endorsement_notes} onChange={(e) => updateItem(idx, "endorsement_notes", e.target.value)} placeholder="Handover details, deadlines, links, risks, next steps..." rows={2} className="resize-y text-xs" />
                </div>
                {/* Per-task references (edit mode) */}
                <div className="space-y-1 pt-1 border-t">
                  <div className="flex items-center justify-between">
                    <Label className="text-[10px]">References</Label>
                    <Button variant="ghost" size="sm" className="h-5 text-[9px] px-1.5" onClick={() => addTaskRef(idx)}><Plus className="h-2.5 w-2.5 mr-0.5" />Add Ref</Button>
                  </div>
                  {item.references.map((ref, ri) => (
                    <div key={ri} className="flex gap-1 items-center">
                      <input className="flex h-6 flex-1 rounded-md border border-input bg-background px-1.5 py-0.5 text-[10px]" value={ref.tool_name} onChange={(e) => updateTaskRef(idx, ri, "tool_name", e.target.value)} placeholder="Tool" />
                      <input className="flex h-6 flex-1 rounded-md border border-input bg-background px-1.5 py-0.5 text-[10px]" value={ref.url} onChange={(e) => updateTaskRef(idx, ri, "url", e.target.value)} placeholder="URL" />
                      <input className="flex h-6 flex-1 rounded-md border border-input bg-background px-1.5 py-0.5 text-[10px]" value={ref.notes} onChange={(e) => updateTaskRef(idx, ri, "notes", e.target.value)} placeholder="Notes" />
                      <Button variant="ghost" size="icon" className="h-5 w-5 text-destructive shrink-0" onClick={() => removeTaskRef(idx, ri)}><Trash2 className="h-2 w-2" /></Button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-2.5 space-y-3">
            {visibleItems.map((item, idx) => {
              const assignees = item.id ? (assigneeMap[item.id] || []) : item.endorsed_to_user_ids;
              const canChangeThis = canUpdateTaskStatus(assignees) && !isTerminal;
              return (
                <RecipientTaskCard
                  key={item._tempId}
                  item={item}
                  index={idx}
                  assignees={assignees}
                  getAssigneeName={getAssigneeName}
                  canEdit={canChangeThis}
                  isLocked={recipientIsLocked}
                  endorsementId={endorsementId || ""}
                  onStatusChange={handleTaskStatusChange}
                  userId={user?.id}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* ── BOTTOM ACTIONS (draft) ── */}
      {canEdit && !editingOpen && endorsement.status === "draft" && (
        <div className="flex items-center justify-between pb-2">
          <span className="text-[10px] text-muted-foreground">Last updated: {format(new Date(endorsement.updated_at), "MMM d, yyyy h:mm a")}</span>
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleSaveDraft} disabled={saving}>{saving ? "Saving..." : "Save Draft"}</Button>
            <Button size="sm" className="h-7 text-xs" onClick={handleSubmit} disabled={saving}>{saving ? "..." : "Submit"}</Button>
          </div>
        </div>
      )}
      {editingOpen && (
        <div className="flex items-center justify-between pb-2">
          <span className="text-[10px] text-muted-foreground">Editing</span>
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setEditingOpen(false)}>Cancel</Button>
            <Button size="sm" className="h-7 text-xs" onClick={handleSaveOpenEdit} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
          </div>
        </div>
      )}

      {/* ── DIALOGS ── */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete Endorsement</AlertDialogTitle><AlertDialogDescription>Are you sure? This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={handleDeleteDraft} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showOwnerDeleteConfirm} onOpenChange={setShowOwnerDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">Delete Endorsement</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>This will permanently delete the endorsement and all its related tasks, assignees, and records. This action cannot be undone.</p>
              <div className="rounded-md bg-destructive/5 border border-destructive/20 p-2.5 text-xs space-y-0.5">
                <p className="font-medium text-foreground">Impact Summary</p>
                <p>• {deleteImpactSummary.taskCount} task{deleteImpactSummary.taskCount !== 1 ? "s" : ""}</p>
                <p>• {deleteImpactSummary.assigneeCount} assignee{deleteImpactSummary.assigneeCount !== 1 ? "s" : ""}</p>
                <p>• {deleteImpactSummary.recipientCount} recipient{deleteImpactSummary.recipientCount !== 1 ? "s" : ""}</p>
                <p>• All related updates, audit entries, and notifications</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleOwnerDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete Endorsement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Cancel Endorsement</AlertDialogTitle><AlertDialogDescription>All recipients will be notified.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Keep</AlertDialogCancel><AlertDialogAction onClick={handleCancelEndorsement} className="bg-destructive text-destructive-foreground">Cancel Endorsement</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
