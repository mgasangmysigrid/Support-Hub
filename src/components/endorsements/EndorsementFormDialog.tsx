import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Plus, Trash2, AlertTriangle, Copy, GripVertical, History } from "lucide-react";
import {
  useEndorsement,
  useEndorsementItems,
  useEndorsementReferences,
  useSaveEndorsement,
  useDeleteEndorsement,
  type EndorsementReference,
} from "@/hooks/useEndorsements";
import EndorsementMultiRecipientPicker from "./EndorsementMultiRecipientPicker";
import EndorsementAuditTrail from "./EndorsementAuditTrail";

const URGENCIES = [
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

type SimplifiedItem = {
  _tempId: string;
  id?: string;
  sort_order: number;
  endorsed_to_user_ids: string[];
  endorsement_notes: string;
  urgency: string;
};

type NewRef = Omit<EndorsementReference, "id" | "endorsement_id" | "created_at" | "updated_at"> & { _tempId: string };

export default function EndorsementFormDialog({
  endorsementId,
  open,
  onClose,
}: {
  endorsementId: string;
  open: boolean;
  onClose: () => void;
}) {
  const { user, isSuperAdmin, isPcMember } = useAuth();
  const qc = useQueryClient();
  const { data: endorsement, isLoading } = useEndorsement(endorsementId);
  const { data: existingItems } = useEndorsementItems(endorsementId);
  const { data: existingRefs } = useEndorsementReferences(endorsementId);
  const saveEndorsement = useSaveEndorsement();
  const deleteEndorsement = useDeleteEndorsement();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Fetch existing item assignees
  const { data: itemAssignees } = useQuery({
    queryKey: ["endorsement-item-assignees", endorsementId],
    enabled: !!endorsementId && !!existingItems && existingItems.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("endorsement_item_assignees")
        .select("endorsement_item_id, user_id")
        .in(
          "endorsement_item_id",
          (existingItems || []).map((i) => i.id)
        );
      if (error) throw error;
      return data || [];
    },
  });

  const isEmployee = endorsement?.employee_user_id === user?.id;
  const canEdit =
    isEmployee &&
    (endorsement?.status === "draft" || endorsement?.status === "open");
  const canDeleteDraft =
    endorsement?.status === "draft" &&
    (isEmployee || isSuperAdmin || isPcMember);

  // Form state
  const [riskNotes, setRiskNotes] = useState("");
  const [pendingIssues, setPendingIssues] = useState("");
  const [timeSensitive, setTimeSensitive] = useState("");
  const [importantWarnings, setImportantWarnings] = useState("");
  const [items, setItems] = useState<SimplifiedItem[]>([]);
  const [refs, setRefs] = useState<NewRef[]>([]);
  const [ackNote, setAckNote] = useState("");
  const [saving, setSaving] = useState(false);

  // Snapshot for audit comparison
  const [savedSnapshot, setSavedSnapshot] = useState<{
    riskNotes: string;
    pendingIssues: string;
    timeSensitive: string;
    importantWarnings: string;
    items: { endorsed_to_user_ids: string[]; endorsement_notes: string; urgency: string }[];
  } | null>(null);

  // Load endorsement-level data
  useEffect(() => {
    if (endorsement) {
      setRiskNotes(endorsement.risk_notes || "");
      setPendingIssues(endorsement.pending_issues || "");
      setTimeSensitive(endorsement.time_sensitive_deadlines || "");
      setImportantWarnings(endorsement.important_warnings || "");
    }
  }, [endorsement]);

  // Load items with assignees
  useEffect(() => {
    if (existingItems) {
      const assigneeMap: Record<string, string[]> = {};
      if (itemAssignees) {
        for (const a of itemAssignees) {
          if (!assigneeMap[a.endorsement_item_id]) assigneeMap[a.endorsement_item_id] = [];
          assigneeMap[a.endorsement_item_id].push(a.user_id);
        }
      }

      const loadedItems = existingItems.map((item) => ({
        _tempId: item.id,
        id: item.id,
        sort_order: item.sort_order,
        endorsed_to_user_ids: assigneeMap[item.id] || (item.endorsed_to_user_id ? [item.endorsed_to_user_id] : []),
        endorsement_notes: (item as any).endorsement_notes || item.task_details || "",
        urgency: (item as any).urgency || "normal",
      }));

      setItems(loadedItems);

      // Build initial snapshot for audit diff
      if (!savedSnapshot && endorsement) {
        setSavedSnapshot({
          riskNotes: endorsement.risk_notes || "",
          pendingIssues: endorsement.pending_issues || "",
          timeSensitive: endorsement.time_sensitive_deadlines || "",
          importantWarnings: endorsement.important_warnings || "",
          items: loadedItems.map((i) => ({
            endorsed_to_user_ids: [...i.endorsed_to_user_ids],
            endorsement_notes: i.endorsement_notes,
            urgency: i.urgency,
          })),
        });
      }
    }
  }, [existingItems, itemAssignees, endorsement]);

  useEffect(() => {
    if (existingRefs) {
      setRefs(existingRefs.map((r) => ({ ...r, _tempId: r.id })));
    }
  }, [existingRefs]);

  const addItem = () => {
    setItems((prev) => [
      ...prev,
      {
        _tempId: crypto.randomUUID(),
        sort_order: prev.length,
        endorsed_to_user_ids: [],
        endorsement_notes: "",
        urgency: "normal",
      },
    ]);
  };

  const duplicateItem = (index: number) => {
    const src = items[index];
    setItems((prev) => [
      ...prev,
      { ...src, _tempId: crypto.randomUUID(), id: undefined, sort_order: prev.length },
    ]);
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: keyof SimplifiedItem, value: any) => {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  };

  const addRef = () => {
    setRefs((prev) => [
      ...prev,
      { _tempId: crypto.randomUUID(), tool_name: "", url: "", notes: "" },
    ]);
  };

  const removeRef = (index: number) => {
    setRefs((prev) => prev.filter((_, i) => i !== index));
  };

  const updateRef = (index: number, field: string, value: string) => {
    setRefs((prev) =>
      prev.map((r, i) => (i === index ? { ...r, [field]: value } : r))
    );
  };

  // --- Audit trail ---
  const logAuditEntries = async (
    action: string,
    fieldChanges?: { field: string; old_value: string | null; new_value: string | null; item_id?: string | null }[]
  ) => {
    if (!user || !endorsement) return;
    const entries: any[] = [];

    if (fieldChanges && fieldChanges.length > 0) {
      for (const c of fieldChanges) {
        entries.push({
          endorsement_id: endorsement.id,
          endorsement_item_id: c.item_id || null,
          actor_id: user.id,
          action: "field_changed",
          field_name: c.field,
          old_value: c.old_value,
          new_value: c.new_value,
        });
      }
    }

    // Always add the action-level entry too
    entries.push({
      endorsement_id: endorsement.id,
      endorsement_item_id: null,
      actor_id: user.id,
      action,
      field_name: null,
      old_value: null,
      new_value: null,
    });

    await supabase.from("endorsement_audit_log").insert(entries);
    qc.invalidateQueries({ queryKey: ["endorsement-audit", endorsement.id] });
  };

  const detectAllChanges = () => {
    const changes: { field: string; old_value: string | null; new_value: string | null; item_id?: string | null }[] = [];
    if (!savedSnapshot) return changes;

    // Endorsement-level fields
    if (riskNotes !== savedSnapshot.riskNotes) {
      changes.push({ field: "risk_notes", old_value: savedSnapshot.riskNotes || null, new_value: riskNotes || null });
    }
    if (pendingIssues !== savedSnapshot.pendingIssues) {
      changes.push({ field: "pending_issues", old_value: savedSnapshot.pendingIssues || null, new_value: pendingIssues || null });
    }
    if (timeSensitive !== savedSnapshot.timeSensitive) {
      changes.push({ field: "time_sensitive_deadlines", old_value: savedSnapshot.timeSensitive || null, new_value: timeSensitive || null });
    }
    if (importantWarnings !== savedSnapshot.importantWarnings) {
      changes.push({ field: "important_warnings", old_value: savedSnapshot.importantWarnings || null, new_value: importantWarnings || null });
    }

    // Item-level field changes (compare by index for existing items)
    const oldItems = savedSnapshot.items || [];
    items.forEach((item, idx) => {
      const old = oldItems[idx];
      if (!old) {
        // New item added
        changes.push({ field: "endorsement_notes", old_value: null, new_value: item.endorsement_notes, item_id: item.id || null });
        if (item.endorsed_to_user_ids.length > 0) {
          changes.push({ field: "endorsed_to", old_value: null, new_value: item.endorsed_to_user_ids.join(", "), item_id: item.id || null });
        }
        if (item.urgency !== "normal") {
          changes.push({ field: "urgency", old_value: null, new_value: item.urgency, item_id: item.id || null });
        }
        return;
      }

      if (item.endorsement_notes !== old.endorsement_notes) {
        changes.push({
          field: "endorsement_notes",
          old_value: old.endorsement_notes || null,
          new_value: item.endorsement_notes || null,
          item_id: item.id || null,
        });
      }

      const oldTo = [...old.endorsed_to_user_ids].sort().join(",");
      const newTo = [...item.endorsed_to_user_ids].sort().join(",");
      if (oldTo !== newTo) {
        changes.push({
          field: "endorsed_to",
          old_value: old.endorsed_to_user_ids.join(", ") || null,
          new_value: item.endorsed_to_user_ids.join(", ") || null,
          item_id: item.id || null,
        });
      }

      if (item.urgency !== old.urgency) {
        changes.push({
          field: "urgency",
          old_value: old.urgency,
          new_value: item.urgency,
          item_id: item.id || null,
        });
      }
    });

    // Detect removed items
    if (items.length < oldItems.length) {
      for (let i = items.length; i < oldItems.length; i++) {
        changes.push({ field: "item_removed", old_value: `Item ${i + 1}`, new_value: null });
      }
    }

    return changes;
  };

  const updateSnapshot = () => {
    setSavedSnapshot({
      riskNotes,
      pendingIssues,
      timeSensitive,
      importantWarnings,
      items: items.map((i) => ({
        endorsed_to_user_ids: [...i.endorsed_to_user_ids],
        endorsement_notes: i.endorsement_notes,
        urgency: i.urgency,
      })),
    });
  };

  // --- Handlers ---
  const handleSaveDraft = async () => {
    if (!endorsement) return;
    setSaving(true);
    try {
      await saveEndorsement.mutateAsync({
        id: endorsement.id,
        risk_notes: riskNotes || null,
        pending_issues: pendingIssues || null,
        time_sensitive_deadlines: timeSensitive || null,
        important_warnings: importantWarnings || null,
      });
      await saveItemsAndRefs();

      const changes = detectAllChanges();
      await logAuditEntries("draft_saved", changes.length > 0 ? changes : undefined);
      updateSnapshot();

      toast.success("Draft saved");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (!endorsement || !user) return;
    if (items.length === 0) {
      toast.error("At least one endorsement item is required");
      return;
    }
    const invalidIdx = items.findIndex(
      (i) => i.endorsed_to_user_ids.length === 0 || !i.endorsement_notes.trim()
    );
    if (invalidIdx >= 0) {
      toast.error(`Item ${invalidIdx + 1}: must have at least one assignee and endorsement notes`);
      return;
    }

    setSaving(true);
    try {
      await saveEndorsement.mutateAsync({
        id: endorsement.id,
        risk_notes: riskNotes || null,
        pending_issues: pendingIssues || null,
        time_sensitive_deadlines: timeSensitive || null,
        important_warnings: importantWarnings || null,
        status: "open" as any,
        submitted_at: new Date().toISOString(),
        submitted_by: user.id,
      });
      await saveItemsAndRefs();

      const changes = detectAllChanges();
      await logAuditEntries("submitted", changes.length > 0 ? changes : undefined);

      toast.success("Endorsement submitted!");
      qc.invalidateQueries({ queryKey: ["endorsement-badge"] });
      onClose();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteDraft = async () => {
    if (!endorsement) return;
    try {
      await deleteEndorsement.mutateAsync(endorsement.id);
      toast.success("Draft endorsement deleted");
      onClose();
    } catch (err: any) {
      toast.error(err.message);
    }
    setShowDeleteConfirm(false);
  };

  const saveItemsAndRefs = async () => {
    // Delete existing (cascade deletes assignees)
    await supabase
      .from("leave_endorsement_items")
      .delete()
      .eq("endorsement_id", endorsementId);
    await supabase
      .from("leave_endorsement_references")
      .delete()
      .eq("endorsement_id", endorsementId);

    if (items.length > 0) {
      const { data: insertedItems, error: itemErr } = await supabase
        .from("leave_endorsement_items")
        .insert(
          items.map((item, i) => ({
            endorsement_id: endorsementId,
            sort_order: i,
            task_name: `Item ${i + 1}`,
            task_details: item.endorsement_notes,
            endorsement_notes: item.endorsement_notes,
            urgency: item.urgency,
            task_type: "one_time" as any,
            priority: "normal" as any,
          }))
        )
        .select("id");
      if (itemErr) throw itemErr;

      if (insertedItems) {
        const assigneeRows: { endorsement_item_id: string; user_id: string }[] = [];
        insertedItems.forEach((inserted, i) => {
          for (const userId of items[i].endorsed_to_user_ids) {
            assigneeRows.push({ endorsement_item_id: inserted.id, user_id: userId });
          }
        });
        if (assigneeRows.length > 0) {
          const { error: assigneeErr } = await supabase
            .from("endorsement_item_assignees")
            .insert(assigneeRows);
          if (assigneeErr) throw assigneeErr;
        }
      }
    }

    if (refs.length > 0) {
      const { error: refErr } = await supabase
        .from("leave_endorsement_references")
        .insert(
          refs.map((r) => ({
            endorsement_id: endorsementId,
            tool_name: r.tool_name,
            url: r.url || null,
            notes: r.notes || null,
          }))
        );
      if (refErr) throw refErr;
    }

    qc.invalidateQueries({ queryKey: ["endorsement-items", endorsementId] });
    qc.invalidateQueries({ queryKey: ["endorsement-item-assignees", endorsementId] });
    qc.invalidateQueries({ queryKey: ["endorsement-references", endorsementId] });
  };

  if (isLoading) {
    return (
      <Dialog open={open} onOpenChange={() => onClose()}>
        <DialogContent className="max-w-5xl">
          <div className="py-12 text-center text-muted-foreground">Loading...</div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!endorsement) return null;

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] p-0">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle>Endorsement</DialogTitle>
        </DialogHeader>

        <div className="flex max-h-[calc(90vh-80px)]">
          {/* Main content */}
          <ScrollArea className="flex-1 px-6 pb-6">
            <div className="space-y-6 pr-2">
              {/* Leave Summary */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold">Leave Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Employee</span>
                      <p className="font-medium">{endorsement.employee?.full_name || "—"}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Department</span>
                      <p className="font-medium">{endorsement.department?.name || "—"}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Leave Type</span>
                      <p className="font-medium capitalize">{endorsement.leave_type?.replace(/_/g, " ")}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Status</span>
                      <p><Badge variant="outline" className="capitalize">{endorsement.status.replace(/_/g, " ")}</Badge></p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Start Date</span>
                      <p className="font-medium">{format(new Date(endorsement.leave_start_date), "MMM d, yyyy")}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">End Date</span>
                      <p className="font-medium">{format(new Date(endorsement.leave_end_date), "MMM d, yyyy")}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Return Date</span>
                      <p className="font-medium">{endorsement.return_date ? format(new Date(endorsement.return_date), "MMM d, yyyy") : "—"}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Manager</span>
                      <p className="font-medium">{endorsement.manager?.full_name || "—"}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Endorsement Items */}
              <Card>
                <CardHeader className="pb-3 flex flex-row items-center justify-between">
                  <CardTitle className="text-sm font-semibold">Endorsement Items</CardTitle>
                  {canEdit && (
                    <Button variant="outline" size="sm" onClick={addItem}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> Add Item
                    </Button>
                  )}
                </CardHeader>
                <CardContent className="space-y-4">
                  {items.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No endorsement items yet. Click "Add Item" to create one.
                    </p>
                  )}
                  {items.map((item, idx) => (
                    <Card key={item._tempId} className="border-dashed">
                      <CardContent className="pt-4 space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <GripVertical className="h-4 w-4 text-muted-foreground" />
                            <span className="text-xs font-medium text-muted-foreground">Item {idx + 1}</span>
                          </div>
                          {canEdit && (
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => duplicateItem(idx)}>
                                <Copy className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeItem(idx)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          )}
                        </div>

                        <div className="space-y-2">
                          <Label className="text-xs font-medium">Endorse To *</Label>
                          <EndorsementMultiRecipientPicker
                            value={item.endorsed_to_user_ids}
                            onChange={(ids) => updateItem(idx, "endorsed_to_user_ids", ids)}
                            disabled={!canEdit}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label className="text-xs font-medium">Endorsement Notes *</Label>
                          <Textarea
                            value={item.endorsement_notes}
                            onChange={(e) => updateItem(idx, "endorsement_notes", e.target.value)}
                            disabled={!canEdit}
                            placeholder="Write the full handover details here, including what needs to be monitored, deadlines, links, risks, and next steps."
                            rows={5}
                            className="resize-y"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label className="text-xs font-medium">Urgency *</Label>
                          <Select
                            value={item.urgency}
                            onValueChange={(v) => updateItem(idx, "urgency", v)}
                            disabled={!canEdit}
                          >
                            <SelectTrigger className="w-[160px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {URGENCIES.map((u) => (
                                <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </CardContent>
              </Card>

              {/* Systems / References */}
              <Card>
                <CardHeader className="pb-3 flex flex-row items-center justify-between">
                  <CardTitle className="text-sm font-semibold">Systems / References</CardTitle>
                  {canEdit && (
                    <Button variant="outline" size="sm" onClick={addRef}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> Add Reference
                    </Button>
                  )}
                </CardHeader>
                <CardContent className="space-y-3">
                  {refs.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-2">
                      No references added.
                    </p>
                  )}
                  {refs.map((ref, idx) => (
                    <div key={ref._tempId} className="flex gap-3 items-start">
                      <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-2">
                        <input
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                          value={ref.tool_name}
                          onChange={(e) => updateRef(idx, "tool_name", e.target.value)}
                          disabled={!canEdit}
                          placeholder="Tool / System Name"
                        />
                        <input
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                          value={ref.url || ""}
                          onChange={(e) => updateRef(idx, "url", e.target.value)}
                          disabled={!canEdit}
                          placeholder="URL / Link"
                        />
                        <input
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                          value={ref.notes || ""}
                          onChange={(e) => updateRef(idx, "notes", e.target.value)}
                          disabled={!canEdit}
                          placeholder="Notes"
                        />
                      </div>
                      {canEdit && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive shrink-0" onClick={() => removeRef(idx)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Risks / Important Notes */}
              <Card className="border-amber-200 bg-amber-50/30 dark:border-amber-900/50 dark:bg-amber-950/20">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    Risks / Important Notes
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Open Concerns</Label>
                    <Textarea value={riskNotes} onChange={(e) => setRiskNotes(e.target.value)} disabled={!canEdit} placeholder="Any open concerns..." rows={2} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Pending Issues</Label>
                    <Textarea value={pendingIssues} onChange={(e) => setPendingIssues(e.target.value)} disabled={!canEdit} placeholder="Unresolved issues..." rows={2} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Time-Sensitive Deadlines</Label>
                    <Textarea value={timeSensitive} onChange={(e) => setTimeSensitive(e.target.value)} disabled={!canEdit} placeholder="Critical dates during your absence..." rows={2} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Important Warnings</Label>
                    <Textarea value={importantWarnings} onChange={(e) => setImportantWarnings(e.target.value)} disabled={!canEdit} placeholder="Anything the covering person must know..." rows={2} />
                  </div>
                </CardContent>
              </Card>

              {/* Removed legacy acknowledgement section - handled via EndorsementDetailPage */}

              {/* Mobile Audit Trail */}
              <div className="md:hidden">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <History className="h-4 w-4" /> Audit Trail
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <EndorsementAuditTrail endorsementId={endorsementId} />
                  </CardContent>
                </Card>
              </div>

              {/* Action Bar */}
              {canEdit && (
                <>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="text-xs text-muted-foreground">
                        Last updated: {format(new Date(endorsement.updated_at), "MMM d, yyyy h:mm a")}
                      </div>
                      {canDeleteDraft && (
                        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setShowDeleteConfirm(true)}>
                          <Trash2 className="h-4 w-4 mr-1" /> Delete
                        </Button>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={handleSaveDraft} disabled={saving}>
                        {saving ? "Saving..." : "Save Draft"}
                      </Button>
                      <Button onClick={handleSubmit} disabled={saving}>
                        {saving ? "Submitting..." : "Submit Endorsement"}
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </ScrollArea>

          {/* Audit Trail Sidebar (desktop) */}
          <div className="hidden md:flex flex-col w-[280px] border-l bg-muted/20">
            <div className="px-4 py-3 border-b">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <History className="h-4 w-4" />
                Audit Trail
              </h3>
            </div>
            <ScrollArea className="flex-1 px-3 py-2">
              <EndorsementAuditTrail endorsementId={endorsementId} />
            </ScrollArea>
          </div>
        </div>

        <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Endorsement</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this draft endorsement? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteDraft} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
