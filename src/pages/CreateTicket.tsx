import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { addBusinessHours } from "@/lib/sla-utils";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { trackActivity, ANALYTICS_EVENTS } from "@/hooks/use-activity-tracker";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { X, Save } from "lucide-react";
import { PasteableTextarea, type PastedImage } from "@/components/PasteableTextarea";
import { UserSearchAssign } from "@/components/UserSearchAssign";
import type { Database } from "@/integrations/supabase/types";

type Priority = Database["public"]["Enums"]["priority_enum"];
type ClientImpact = Database["public"]["Enums"]["client_impact_enum"];

interface DepartmentSelection {
  departmentId: string;
  selectedMembers: string[];
}

const DRAFT_KEY = "create-ticket-draft";

interface DraftData {
  title: string;
  description: string;
  priority: Priority;
  clientImpact: ClientImpact;
  criticalJustification: string;
  departmentSelections: DepartmentSelection[];
  savedAt: string;
}

function loadDraft(): DraftData | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DraftData;
  } catch {
    return null;
  }
}

function clearDraft() {
  localStorage.removeItem(DRAFT_KEY);
}

export default function CreateTicket() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  // Load draft on mount
  const draft = useRef(loadDraft());

  const [title, setTitle] = useState(draft.current?.title || "");
  const [description, setDescription] = useState(draft.current?.description || "");
  const [priority, setPriority] = useState<Priority>(draft.current?.priority || "normal");
  const [clientImpact, setClientImpact] = useState<ClientImpact>(draft.current?.clientImpact || "no");
  const [criticalJustification, setCriticalJustification] = useState(draft.current?.criticalJustification || "");
  const [departmentSelections, setDepartmentSelections] = useState<DepartmentSelection[]>(
    draft.current?.departmentSelections?.length
      ? draft.current.departmentSelections
      : [{ departmentId: "", selectedMembers: [] }]
  );
  const [descriptionImages, setDescriptionImages] = useState<PastedImage[]>([]);
  const [draftRestoredNotice, setDraftRestoredNotice] = useState(!!draft.current);

  // Auto-save draft to localStorage on any field change
  useEffect(() => {
    const hasSomething = title || description || criticalJustification || departmentSelections.some(s => s.departmentId);
    if (!hasSomething) {
      clearDraft();
      return;
    }
    const draftData: DraftData = {
      title,
      description,
      priority,
      clientImpact,
      criticalJustification,
      departmentSelections,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draftData));
  }, [title, description, priority, clientImpact, criticalJustification, departmentSelections]);

  const handleDiscardDraft = () => {
    clearDraft();
    setTitle("");
    setDescription("");
    setPriority("normal");
    setClientImpact("no");
    setCriticalJustification("");
    setDepartmentSelections([{ departmentId: "", selectedMembers: [] }]);
    setDescriptionImages([]);
    setDraftRestoredNotice(false);
    toast.info("Draft discarded");
  };

  const { data: departments } = useQuery({
    queryKey: ["departments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("*").order("display_order");
      if (error) throw error;
      return data;
    },
  });

  // Fetch members for all selected departments
  const selectedDeptIds = departmentSelections.map((s) => s.departmentId).filter(Boolean);
  const { data: allDeptMembers } = useQuery({
    queryKey: ["dept-members-multi", selectedDeptIds],
    enabled: selectedDeptIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("department_members")
        .select("*, profile:profiles!department_members_user_id_fkey(id, full_name, email, is_active)")
        .in("department_id", selectedDeptIds)
        .eq("is_assignable", true);
      if (error) throw error;
      return data?.filter((m) => m.profile?.is_active) || [];
    },
  });

  const getMembersForDept = (deptId: string) =>
    allDeptMembers?.filter((m) => m.department_id === deptId) || [];

  const getDeptName = (deptId: string) =>
    departments?.find((d) => d.id === deptId)?.name || "";

  const usedDeptIds = departmentSelections.map((s) => s.departmentId).filter(Boolean);

  const handleDeptChange = (index: number, deptId: string) => {
    setDepartmentSelections((prev) => {
      const next = [...prev];
      next[index] = { departmentId: deptId, selectedMembers: [] };
      return next;
    });
  };

  const toggleMember = (index: number, userId: string) => {
    setDepartmentSelections((prev) => {
      const next = [...prev];
      const sel = next[index];
      sel.selectedMembers = sel.selectedMembers.includes(userId)
        ? sel.selectedMembers.filter((id) => id !== userId)
        : [...sel.selectedMembers, userId];
      return next;
    });
  };

  const addDepartment = () => {
    setDepartmentSelections((prev) => [...prev, { departmentId: "", selectedMembers: [] }]);
  };

  const removeDepartment = (index: number) => {
    setDepartmentSelections((prev) => prev.filter((_, i) => i !== index));
  };

  const allSelectedMembers = departmentSelections.flatMap((s) => s.selectedMembers);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const validSelections = departmentSelections.filter((s) => s.departmentId && s.selectedMembers.length > 0);
    if (validSelections.length === 0) {
      toast.error("Please select at least one department and assignee.");
      return;
    }
    if (priority === "critical" && !criticalJustification.trim()) {
      toast.error("Critical tickets require a justification.");
      return;
    }

    setLoading(true);
    try {
      // Use the first department as the primary (for backward compat)
      const primaryDeptId = validSelections[0].departmentId;

      const { data: ticketNo, error: seqError } = await supabase.rpc("generate_ticket_no", { _dept_id: primaryDeptId });
      if (seqError) throw seqError;

      const slaHours = priority === "critical" ? 24 : priority === "normal" ? 48 : 120;
      const slaDue = addBusinessHours(new Date(), slaHours);

      const { data: ticket, error } = await supabase.from("tickets").insert({
        ticket_no: ticketNo,
        title,
        description,
        requester_id: user.id,
        department_id: primaryDeptId,
        priority,
        client_impact: clientImpact,
        critical_justification: priority === "critical" ? criticalJustification : null,
        sla_due_at: slaDue.toISOString(),
        assignee_id: allSelectedMembers[0],
        primary_assignee_id: allSelectedMembers[0],
      } as any).select().single();

      if (error) throw error;

      // Insert all departments into junction table
      const deptRows = validSelections.map((s) => ({
        ticket_id: ticket.id,
        department_id: s.departmentId,
      }));
      const { error: deptError } = await supabase.from("ticket_departments").insert(deptRows);
      if (deptError) throw deptError;

      // Owner goes into ticket_assignees (for notification triggers)
      const ownerAssigneeRow = [{
        ticket_id: ticket.id,
        user_id: allSelectedMembers[0],
        added_by: user.id,
      }];
      await supabase.from("ticket_assignees").insert(ownerAssigneeRow);

      // Remaining members become collaborators
      const collaboratorIds = allSelectedMembers.slice(1);
      if (collaboratorIds.length > 0) {
        // Insert into ticket_collaborators
        const collabRows = collaboratorIds.map((userId) => ({
          ticket_id: ticket.id,
          user_id: userId,
          added_by: user.id,
        }));
        const { error: collabError } = await supabase.from("ticket_collaborators").insert(collabRows);
        if (collabError) throw collabError;

        // Also insert into ticket_assignees for backward compat with notifications
        const assigneeRows = collaboratorIds.map((userId) => ({
          ticket_id: ticket.id,
          user_id: userId,
          added_by: user.id,
        }));
        try { await supabase.from("ticket_assignees").insert(assigneeRows); } catch {}
      }

      // Log activity
      await supabase.from("ticket_activity").insert({
        ticket_id: ticket.id,
        actor_id: user.id,
        action: "created",
        to_value: { status: "open", priority },
      });

      await supabase.from("ticket_activity").insert({
        ticket_id: ticket.id,
        actor_id: user.id,
        action: "assigned",
        to_value: { assignee_ids: allSelectedMembers },
      });

      // Upload pasted images as inline description attachments
      for (const img of descriptionImages) {
        let fileToUpload = img.file;
        if (fileToUpload.type.startsWith("image/") && fileToUpload.size > 5 * 1024 * 1024) {
          try {
            const opt = await (await import("@/lib/image-optimizer")).optimizeImageBeforeUpload(fileToUpload);
            fileToUpload = opt.file;
          } catch { /* upload original if optimization fails */ }
        }
        const filePath = `${ticket.id}/${crypto.randomUUID()}_${fileToUpload.name || "pasted-image.png"}`;
        const { error: upErr } = await supabase.storage
          .from("ticket-attachments")
          .upload(filePath, fileToUpload);
        if (!upErr) {
          await supabase.from("ticket_attachments").insert({
            ticket_id: ticket.id,
            uploaded_by: user.id,
            file_name: img.file.name || "pasted-image.png",
            file_path: filePath,
            mime_type: img.file.type,
            is_inline: true,
          });
        }
      }

      // Clear draft on successful submit
      clearDraft();
      setDraftRestoredNotice(false);

      toast.success("Ticket created!");
      trackActivity(user.id, ANALYTICS_EVENTS.CREATED_TICKET.module, ANALYTICS_EVENTS.CREATED_TICKET.event, "ticket", ticket.id);
      navigate(`/tickets/${ticket.id}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to create ticket");
    } finally {
      setLoading(false);
    }
  };

  const availableDepts = departments?.filter(
    (d) => !usedDeptIds.includes(d.id)
  );
  const canAddMore = availableDepts && availableDepts.length > 0;

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Create New Ticket</h1>

      {draftRestoredNotice && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
          <Save className="h-4 w-4 text-primary shrink-0" />
          <span className="flex-1">
            Draft restored from{" "}
            {draft.current?.savedAt
              ? new Date(draft.current.savedAt).toLocaleString()
              : "earlier session"}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={handleDiscardDraft}
          >
            Discard
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setDraftRestoredNotice(false)}
          >
            Dismiss
          </Button>
        </div>
      )}

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Quick assign by user search */}
            <UserSearchAssign
              currentUserId={user?.id}
              onSelect={(result, chosenDeptId) => {
                setDepartmentSelections((prev) => {
                  // Check if this department already exists
                  const existingIdx = prev.findIndex((s) => s.departmentId === chosenDeptId);
                  if (existingIdx >= 0) {
                    // Add user to existing department selection if not already there
                    const next = [...prev];
                    if (!next[existingIdx].selectedMembers.includes(result.userId)) {
                      next[existingIdx] = {
                        ...next[existingIdx],
                        selectedMembers: [...next[existingIdx].selectedMembers, result.userId],
                      };
                    }
                    return next;
                  }
                  // Replace first empty slot, or append
                  const emptyIdx = prev.findIndex((s) => !s.departmentId);
                  if (emptyIdx >= 0) {
                    const next = [...prev];
                    next[emptyIdx] = { departmentId: chosenDeptId, selectedMembers: [result.userId] };
                    return next;
                  }
                  return [...prev, { departmentId: chosenDeptId, selectedMembers: [result.userId] }];
                });
              }}
            />

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">or select manually</span>
              </div>
            </div>

            {/* Department + Assignee selections */}
            <div className="space-y-4">
              <Label>Departments & Assignees *</Label>
              {departmentSelections.map((sel, index) => (
                <DepartmentBlock
                  key={index}
                  index={index}
                  selection={sel}
                  departments={departments || []}
                  usedDeptIds={usedDeptIds}
                  members={getMembersForDept(sel.departmentId)}
                  getDeptName={getDeptName}
                  onDeptChange={handleDeptChange}
                  onToggleMember={toggleMember}
                  onRemove={departmentSelections.length > 1 ? removeDepartment : undefined}
                />
              ))}
              {canAddMore && (
                <Button type="button" variant="outline" size="sm" onClick={addDepartment}>
                  + Add Another Department
                </Button>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Brief summary of the issue" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description *</Label>
              <PasteableTextarea
                id="description"
                value={description}
                onChange={setDescription}
                pastedImages={descriptionImages}
                onPastedImagesChange={setDescriptionImages}
                required
                rows={5}
                placeholder="Describe the issue in detail..."
              />
            </div>

            <div className="space-y-2">
              <Label>Priority *</Label>
              <RadioGroup value={priority} onValueChange={(v) => setPriority(v as Priority)} className="flex gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="low" id="low" />
                  <Label htmlFor="low" className="cursor-pointer">Low (5 days SLA)</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="normal" id="normal" />
                  <Label htmlFor="normal" className="cursor-pointer">Normal (48h SLA)</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="critical" id="critical" />
                  <Label htmlFor="critical" className="cursor-pointer text-destructive">Critical (24h SLA)</Label>
                </div>
              </RadioGroup>
            </div>

            {priority === "critical" && (
              <div className="space-y-2">
                <Label htmlFor="justification">Critical Justification *</Label>
                <Textarea id="justification" value={criticalJustification} onChange={(e) => setCriticalJustification(e.target.value)} required rows={3} placeholder="Why is this ticket critical?" />
              </div>
            )}

            <div className="space-y-2">
              <Label>Client Impact</Label>
              <RadioGroup value={clientImpact} onValueChange={(v) => setClientImpact(v as ClientImpact)} className="flex gap-4">
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="no" id="impact-no" />
                  <Label htmlFor="impact-no" className="cursor-pointer">No</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="potential" id="impact-potential" />
                  <Label htmlFor="impact-potential" className="cursor-pointer">Potential</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="yes" id="impact-yes" />
                  <Label htmlFor="impact-yes" className="cursor-pointer">Yes</Label>
                </div>
              </RadioGroup>
            </div>

            <Button type="submit" className="w-full" disabled={loading || allSelectedMembers.length === 0}>
              {loading ? "Creating..." : "Submit Ticket"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

/* ---------- Sub-component ---------- */

interface DepartmentBlockProps {
  index: number;
  selection: DepartmentSelection;
  departments: { id: string; name: string }[];
  usedDeptIds: string[];
  members: any[];
  getDeptName: (id: string) => string;
  onDeptChange: (index: number, deptId: string) => void;
  onToggleMember: (index: number, userId: string) => void;
  onRemove?: (index: number) => void;
}

function DepartmentBlock({
  index,
  selection,
  departments,
  usedDeptIds,
  members,
  onDeptChange,
  onToggleMember,
  onRemove,
}: DepartmentBlockProps) {
  // Show departments not already selected (except current one)
  const availableForThis = departments.filter(
    (d) => d.id === selection.departmentId || !usedDeptIds.includes(d.id)
  );

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Department {index + 1}</Label>
        {onRemove && (
          <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => onRemove(index)}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      <select
        className="flex h-10 w-full items-center rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        value={selection.departmentId}
        onChange={(e) => onDeptChange(index, e.target.value)}
      >
        <option value="">Select department...</option>
        {availableForThis.map((d) => (
          <option key={d.id} value={d.id}>{d.name}</option>
        ))}
      </select>

      {selection.departmentId && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">
            Select assignees ({selection.selectedMembers.length} selected)
          </p>
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {members.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">No assignable members in this department</p>
            ) : (
              members.map((m) => (
                <div key={m.id} className="flex items-center gap-2">
                  <Checkbox
                    id={`member-${index}-${m.user_id}`}
                    checked={selection.selectedMembers.includes(m.user_id)}
                    onCheckedChange={() => onToggleMember(index, m.user_id)}
                  />
                  <Label htmlFor={`member-${index}-${m.user_id}`} className="cursor-pointer text-sm">
                    {m.profile?.full_name || m.profile?.email || m.user_id}
                  </Label>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
