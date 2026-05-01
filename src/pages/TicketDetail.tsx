import { useState, useMemo, useEffect, useCallback } from "react";
import { computeSlaStatus, formatOverdueDuration } from "@/lib/sla-utils";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { trackActivity, ANALYTICS_EVENTS } from "@/hooks/use-activity-tracker";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { StatusBadge } from "@/components/StatusBadge";
import { PriorityBadge } from "@/components/PriorityBadge";
import { SLACountdown } from "@/components/SLACountdown";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { formatDistanceToNow, format } from "date-fns";
import { User, Calendar, Building2, Clock, MessageSquare, Activity, Merge, ExternalLink, UserPlus, X, Trash2, Unlink, Users, Crown, ArrowRightLeft, ArrowLeft } from "lucide-react";
import { TicketAttachments } from "@/components/TicketAttachments";
import { MergeTicketDialog } from "@/components/MergeTicketDialog";
import { EditDepartmentsDialog } from "@/components/EditDepartmentsDialog";
import { PasteableTextarea, type PastedImage } from "@/components/PasteableTextarea";
import { InlineImages } from "@/components/InlineImages";
import { Link } from "react-router-dom";
import type { Database } from "@/integrations/supabase/types";

type Status = Database["public"]["Enums"]["status_enum"];

function renderMentions(text: string) {
  const parts = text.split(/(@\w+)/g);
  return parts.map((part, i) => {
    if (part.startsWith("@") && part.length > 1) {
      return (
        <span key={i} className="bg-primary/10 text-primary font-medium rounded px-1">
          {part}
        </span>
      );
    }
    return part;
  });
}

function formatActivityAction(
  action: string,
  fromValue: any,
  toValue: any,
  profiles?: { id: string; full_name: string | null; email: string | null }[],
  departments?: { id: string; name: string }[],
): string {
  const resolveName = (uid: string) => {
    const p = profiles?.find((pr) => pr.id === uid);
    return p?.full_name || p?.email || uid.slice(0, 8);
  };
  const resolveDept = (did: string) => {
    const d = departments?.find((dep) => dep.id === did);
    return d?.name || did.slice(0, 8);
  };

  switch (action) {
    case "status_changed":
      return `changed status → ${toValue?.status || "unknown"}`;
    case "priority_changed":
      return `changed priority → ${toValue?.priority || "unknown"}`;
    case "assignee_added":
    case "collaborator_added": {
      const ids: string[] = toValue?.added_assignee_ids || toValue?.added_collaborator_ids || [];
      return `added collaborator${ids.length > 1 ? "s" : ""}: ${ids.map(resolveName).join(", ")}`;
    }
    case "assignee_removed":
    case "collaborator_removed":
      return `removed collaborator: ${resolveName(toValue?.removed_assignee_id || toValue?.removed_collaborator_id || "")}`;
    case "transferred":
    case "ownership_transferred":
      return `transferred ownership to ${resolveName(toValue?.new_owner_id || toValue?.new_assignee_id || "")}`;
    case "departments_changed": {
      const oldDepts: string[] = fromValue?.department_ids || [];
      const newDepts: string[] = toValue?.department_ids || [];
      const added = newDepts.filter((d) => !oldDepts.includes(d)).map(resolveDept);
      const removed = oldDepts.filter((d) => !newDepts.includes(d)).map(resolveDept);
      const parts: string[] = [];
      if (added.length) parts.push(`added dept${added.length > 1 ? "s" : ""}: ${added.join(", ")}`);
      if (removed.length) parts.push(`removed dept${removed.length > 1 ? "s" : ""}: ${removed.join(", ")}`);
      return parts.length > 0 ? parts.join("; ") : "updated departments";
    }
    case "assigned": {
      const ids: string[] = toValue?.assignee_ids || [];
      if (ids.length > 0) return `assigned to ${ids.map(resolveName).join(", ")}`;
      return "assigned";
    }
    case "reopened": {
      const reason = toValue?.reason ? `: "${(toValue.reason as string).slice(0, 80)}"` : "";
      const fromStatus = fromValue?.status ? ` (was ${fromValue.status})` : "";
      return `reopened ticket${fromStatus}${reason}`;
    }
    case "closed":
      return "closed ticket";
    case "closure_yes":
      return "confirmed resolution";
    case "merged":
      return "merged ticket";
    case "tickets_merged":
      return "merged tickets into this one";
    case "merged_into":
      return "ticket was merged into parent";
    case "ticket_unmerged":
      return `unmerged ticket ${toValue?.unmerged_ticket_no || ""}`;
    case "unmerged_from":
      return `unmerged from parent ticket ${toValue?.parent_ticket_no || ""}`;
    case "escalated_to_manager":
      return "escalated to manager";
    case "escalated_to_super_admin":
      return "escalated to owner";
    case "sla_breached":
      return "SLA breached";
    case "sla_due_changed":
      return `changed SLA due date → ${toValue?.sla_due_at ? format(new Date(toValue.sla_due_at), "PPp") : "unknown"}`;
    case "attachment_added":
      return `attached "${toValue?.file_name || "file"}"`;
    case "attachment_removed":
      return `removed attachment "${toValue?.file_name || "file"}"`;
    case "resolution_notes":
      return `added resolution notes: "${(toValue?.notes || "").slice(0, 80)}${(toValue?.notes || "").length > 80 ? "…" : ""}"`;
    default:
      return action.replace(/_/g, " ");
  }
}

export default function TicketDetail() {
  const { id } = useParams<{ id: string }>();
  const { user, isSuperAdmin, managedDepartments } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const draftKey = `ticket-comment-draft-${id}`;
  const [comment, setCommentRaw] = useState(() => {
    try { return localStorage.getItem(draftKey) || ""; } catch { return ""; }
  });
  const setComment = useCallback((v: string) => {
    setCommentRaw(v);
    try { if (v) localStorage.setItem(draftKey, v); else localStorage.removeItem(draftKey); } catch {}
  }, [draftKey]);
  const clearCommentDraft = useCallback(() => {
    try { localStorage.removeItem(draftKey); } catch {}
  }, [draftKey]);
  const [submitting, setSubmitting] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [reopenReason, setReopenReason] = useState("");
  const [showReopenDialog, setShowReopenDialog] = useState(false);
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [showAddCollaboratorDialog, setShowAddCollaboratorDialog] = useState(false);
  const [selectedNewCollaborators, setSelectedNewCollaborators] = useState<string[]>([]);
  const [collabSearch, setCollabSearch] = useState("");
  const [showTransferOwnershipDialog, setShowTransferOwnershipDialog] = useState(false);
  const [transferTargetId, setTransferTargetId] = useState<string>("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showEditDeptDialog, setShowEditDeptDialog] = useState(false);
  const [commentImages, setCommentImages] = useState<PastedImage[]>([]);
  const [editingSla, setEditingSla] = useState(false);
  const [newSlaDue, setNewSlaDue] = useState("");
  const [showResolutionDialog, setShowResolutionDialog] = useState(false);
  const [resolutionNotes, setResolutionNotes] = useState("");

  // Mark notifications for this ticket as read on mount
  useEffect(() => {
    if (!user || !id) return;
    const markRead = async () => {
      await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("user_id", user.id)
        .eq("is_read", false)
        .like("link", `/tickets/${id}%`);
      queryClient.invalidateQueries({ queryKey: ["ticket-unread-notifs"] });
      queryClient.invalidateQueries({ queryKey: ["notifications-count"] });
    };
    markRead();
  }, [user, id, queryClient]);

  const { data: ticket, isLoading } = useQuery({
    queryKey: ["ticket", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tickets")
        .select("*, departments(name, code), requester:profiles!tickets_requester_id_fkey(full_name, email), assignee:profiles!tickets_assignee_id_fkey(full_name, email)")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Fetch owner profile separately (since FK name may not be in types yet)
  const { data: ownerProfile } = useQuery({
    queryKey: ["ticket-owner-profile", (ticket as any)?.primary_assignee_id],
    enabled: !!(ticket as any)?.primary_assignee_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, profile_photo_url")
        .eq("id", (ticket as any).primary_assignee_id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Fetch all assignees for this ticket (kept for backward compat with notifications)
  const { data: ticketAssignees } = useQuery({
    queryKey: ["ticket-assignees", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_assignees")
        .select("*, profile:profiles!ticket_assignees_user_id_fkey(id, full_name, email)")
        .eq("ticket_id", id!);
      if (error) throw error;
      return data;
    },
  });

  // Fetch collaborators
  const { data: ticketCollaborators } = useQuery({
    queryKey: ["ticket-collaborators", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_collaborators")
        .select("*, profile:profiles!ticket_collaborators_user_id_fkey(id, full_name, email)")
        .eq("ticket_id", id!);
      if (error) throw error;
      return data;
    },
  });

  const { data: comments } = useQuery({
    queryKey: ["ticket-comments", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_comments")
        .select("*, author:profiles!ticket_comments_author_id_fkey(full_name)")
        .eq("ticket_id", id!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: activity } = useQuery({
    queryKey: ["ticket-activity", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_activity")
        .select("*, actor:profiles!ticket_activity_actor_id_fkey(full_name)")
        .eq("ticket_id", id!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: mergedTickets } = useQuery({
    queryKey: ["merged-tickets", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tickets")
        .select("id, ticket_no, title, requester_id, requester:profiles!tickets_requester_id_fkey(full_name, email)")
        .eq("merged_into_id", id!);
      if (error) throw error;
      return data;
    },
  });

  // Fetch all linked departments
  const { data: ticketDepartments } = useQuery({
    queryKey: ["ticket-departments", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_departments")
        .select("*, department:departments(id, name, code)")
        .eq("ticket_id", id!);
      if (error) throw error;
      return data;
    },
  });

  // Fetch all active profiles with department info for collaborator selection & activity display
  const { data: allProfiles } = useQuery({
    queryKey: ["all-profiles-with-depts"],
    queryFn: async () => {
      const { data: profiles, error } = await supabase.from("profiles").select("id, full_name, email, is_active, job_title");
      if (error) throw error;
      // Fetch department memberships
      const { data: memberships } = await supabase
        .from("department_members")
        .select("user_id, department:departments!department_members_department_id_fkey(name)");
      const deptMap = new Map<string, string[]>();
      for (const m of memberships || []) {
        const depts = deptMap.get(m.user_id) || [];
        if (m.department?.name && !depts.includes(m.department.name)) depts.push(m.department.name);
        deptMap.set(m.user_id, depts);
      }
      return (profiles || []).map((p) => ({ ...p, departments: deptMap.get(p.id) || [] }));
    },
  });

  const { data: departments } = useQuery({
    queryKey: ["all-departments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("id, name").order("display_order");
      if (error) throw error;
      return data || [];
    },
  });

  const isMergedChild = !!ticket?.merged_into_id;

  // Fetch members from ALL linked departments (not just primary)
  const linkedDeptIds = useMemo(() => {
    const ids = ticketDepartments?.map((td) => td.department_id) || [];
    if (ticket?.department_id && !ids.includes(ticket.department_id)) {
      ids.push(ticket.department_id);
    }
    return ids;
  }, [ticketDepartments, ticket?.department_id]);

  const { data: deptMembers } = useQuery({
    queryKey: ["dept-members-multi", linkedDeptIds],
    enabled: linkedDeptIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("department_members")
        .select("*, profile:profiles!department_members_user_id_fkey(id, full_name, email, is_active)")
        .in("department_id", linkedDeptIds);
      if (error) throw error;
      const seen = new Set<string>();
      return (data || []).filter((m) => {
        if (!m.profile?.is_active || seen.has(m.user_id)) return false;
        seen.add(m.user_id);
        return true;
      });
    },
  });

  // Build mention users list from owner + collaborators + requester
  const mentionUsers = useMemo(() => {
    const users: { id: string; full_name: string | null; email: string | null }[] = [];
    const seenIds = new Set<string>();

    const addUser = (candidate: { id: string; full_name: string | null; email: string | null } | null | undefined) => {
      if (!candidate?.id || seenIds.has(candidate.id)) return;
      seenIds.add(candidate.id);
      users.push({
        id: candidate.id,
        full_name: candidate.full_name?.trim() || null,
        email: candidate.email?.trim() || null,
      });
    };

    // Add owner
    if (ownerProfile) {
      addUser({ id: ownerProfile.id, full_name: ownerProfile.full_name, email: ownerProfile.email });
    }

    // Add collaborators
    if (ticketCollaborators) {
      for (const tc of ticketCollaborators) {
        const p = (tc as any).profile;
        addUser(p ? { id: p.id, full_name: p.full_name, email: p.email } : null);
      }
    }

    // Add assignees (backward compat)
    if (ticketAssignees) {
      for (const ta of ticketAssignees) {
        const p = (ta as any).profile;
        addUser(p ? { id: p.id, full_name: p.full_name, email: p.email } : null);
      }
    }

    // Add requester
    if (ticket?.requester_id) {
      const req = (ticket as any).requester;
      const reqFromAllProfiles = allProfiles?.find((p) => p.id === ticket.requester_id);
      addUser({
        id: ticket.requester_id,
        full_name: req?.full_name ?? reqFromAllProfiles?.full_name ?? null,
        email: req?.email ?? reqFromAllProfiles?.email ?? null,
      });
    }

    // Add merged ticket requesters
    if (mergedTickets) {
      for (const mt of mergedTickets) {
        if (!mt.requester_id) continue;
        const req = (mt as any).requester;
        const reqFromAllProfiles = allProfiles?.find((p) => p.id === mt.requester_id);
        addUser({
          id: mt.requester_id,
          full_name: req?.full_name ?? reqFromAllProfiles?.full_name ?? null,
          email: req?.email ?? reqFromAllProfiles?.email ?? null,
        });
      }
    }

    return users.filter((u) => u.id !== user?.id);
  }, [ticketCollaborators, ticketAssignees, ownerProfile, ticket, mergedTickets, allProfiles, user?.id]);

  const primaryAssigneeId = (ticket as any)?.primary_assignee_id;
  const isOwner = user?.id === primaryAssigneeId;
  const isCollaborator = ticketCollaborators?.some((tc) => tc.user_id === user?.id);
  const isAssignee = isOwner || isCollaborator || ticketAssignees?.some((ta) => ta.user_id === user?.id) || user?.id === ticket?.assignee_id;
  const isRequester = user?.id === ticket?.requester_id;
  const canManage = isSuperAdmin || (ticket && managedDepartments.includes(ticket.department_id)) || isOwner || isRequester;
  const canCollaborate = canManage || isCollaborator || isAssignee;
  const canClose = isOwner || isRequester || isSuperAdmin;
  const showClosurePrompt = isRequester && ticket?.status === "for_review" && ticket?.closure_confirmation_status === "pending";

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["ticket", id] });
    queryClient.invalidateQueries({ queryKey: ["ticket-assignees", id] });
    queryClient.invalidateQueries({ queryKey: ["ticket-collaborators", id] });
    queryClient.invalidateQueries({ queryKey: ["ticket-owner-profile"] });
    queryClient.invalidateQueries({ queryKey: ["ticket-comments", id] });
    queryClient.invalidateQueries({ queryKey: ["ticket-activity", id] });
    queryClient.invalidateQueries({ queryKey: ["merged-tickets", id] });
    queryClient.invalidateQueries({ queryKey: ["ticket-departments", id] });
  };

  const handleStatusChange = async (newStatus: Status) => {
    if (!ticket || !user) return;
    if (newStatus === "for_review" && ticket.status !== "for_review") {
      setShowResolutionDialog(true);
      return;
    }
    // If closing, go through confirmation for requester or direct for owner
    if (newStatus === "closed" && (isOwner || isSuperAdmin)) {
      await applyStatusChange("closed");
      return;
    }
    await applyStatusChange(newStatus);
  };

  const applyStatusChange = async (newStatus: Status, resolutionText?: string) => {
    if (!ticket || !user) return;
    const oldStatus = ticket.status;
    const updates: any = { status: newStatus };
    if (newStatus === "for_review") {
      updates.closure_confirmation_status = "pending";
      updates.closure_confirmed_at = null;
    }
    if (newStatus === "closed") {
      const closedAtIso = new Date().toISOString();
      updates.closed_at = closedAtIso;
      updates.closed_by = user.id;
      updates.closure_confirmation_status = "pending";
      updates.closure_confirmed_at = null;
      // Store final overdue seconds for historical reporting
      const due = new Date(ticket.sla_due_at);
      const closedDate = new Date(closedAtIso);
      if (closedDate > due) {
        const { getBusinessTimeDiffMs } = await import("@/lib/sla-utils");
        const overdueMs = Math.abs(getBusinessTimeDiffMs(due, closedDate));
        (updates as any).final_overdue_seconds = overdueMs / 1000;
      } else {
        (updates as any).final_overdue_seconds = 0;
      }
    }
    if (oldStatus === "closed" && newStatus !== "closed") {
      updates.closed_at = null;
      updates.closed_by = null;
    }

    const { error } = await supabase.from("tickets").update(updates).eq("id", ticket.id);
    if (error) { toast.error(error.message); return; }

    await supabase.from("ticket_activity").insert({
      ticket_id: ticket.id, actor_id: user.id, action: "status_changed",
      from_value: { status: oldStatus }, to_value: { status: newStatus },
    });

    if (resolutionText) {
      await supabase.from("ticket_comments").insert({
        ticket_id: ticket.id, author_id: user.id, body: `**Resolution Notes:** ${resolutionText}`,
      });
      await supabase.from("ticket_activity").insert({
        ticket_id: ticket.id, actor_id: user.id, action: "resolution_notes",
        to_value: { notes: resolutionText },
      });
    }

    toast.success(`Status changed to ${newStatus}`);
    if (user) trackActivity(user.id, ANALYTICS_EVENTS.UPDATED_TICKET_STATUS.module, ANALYTICS_EVENTS.UPDATED_TICKET_STATUS.event, "ticket", ticket?.id, { from: oldStatus, to: newStatus });
    refresh();
  };

  const handleSubmitResolution = async () => {
    if (!resolutionNotes.trim()) return;
    setShowResolutionDialog(false);
    await applyStatusChange("for_review", resolutionNotes.trim());
    setResolutionNotes("");
  };

  const handleAddCollaborators = async () => {
    if (!ticket || !user || selectedNewCollaborators.length === 0) return;
    try {
      // Insert into ticket_collaborators
      const collabRows = selectedNewCollaborators.map((userId) => ({
        ticket_id: ticket.id,
        user_id: userId,
        added_by: user.id,
      }));
      const { error: collabErr } = await supabase.from("ticket_collaborators").insert(collabRows);
      if (collabErr) throw collabErr;

      // Also insert into ticket_assignees for backward compat with notification triggers
      const assigneeRows = selectedNewCollaborators.map((userId) => ({
        ticket_id: ticket.id,
        user_id: userId,
        added_by: user.id,
      }));
      try { await supabase.from("ticket_assignees").insert(assigneeRows); } catch {
        // Ignore if already exists
      }

      await supabase.from("ticket_activity").insert({
        ticket_id: ticket.id,
        actor_id: user.id,
        action: "collaborator_added",
        to_value: { added_collaborator_ids: selectedNewCollaborators },
      });

      toast.success("Collaborator(s) added");
      setShowAddCollaboratorDialog(false);
      setSelectedNewCollaborators([]);
      refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to add collaborators");
    }
  };

  const handleRemoveCollaborator = async (userId: string) => {
    if (!ticket || !user) return;
    // Remove from ticket_collaborators
    const { error } = await supabase
      .from("ticket_collaborators")
      .delete()
      .eq("ticket_id", ticket.id)
      .eq("user_id", userId);
    if (error) { toast.error(error.message); return; }

    // Also remove from ticket_assignees
    try { await supabase.from("ticket_assignees").delete().eq("ticket_id", ticket.id).eq("user_id", userId); } catch {}


    await supabase.from("ticket_activity").insert({
      ticket_id: ticket.id, actor_id: user.id, action: "collaborator_removed",
      to_value: { removed_collaborator_id: userId },
    });
    toast.success("Collaborator removed");
    refresh();
  };

  const handleTransferOwnership = async () => {
    if (!ticket || !user || !transferTargetId) return;
    try {
      const oldOwnerId = primaryAssigneeId;

      // Update primary_assignee_id and assignee_id
      await supabase.from("tickets").update({
        primary_assignee_id: transferTargetId,
        assignee_id: transferTargetId,
      } as any).eq("id", ticket.id);

      // Ensure new owner is in ticket_assignees (for notifications)
      try { await supabase.from("ticket_assignees").insert({
        ticket_id: ticket.id, user_id: transferTargetId, added_by: user.id,
      }); } catch {} // Ignore if already exists

      // Move old owner to collaborators if they're not already
      if (oldOwnerId && oldOwnerId !== transferTargetId) {
        try { await supabase.from("ticket_collaborators").insert({
          ticket_id: ticket.id, user_id: oldOwnerId, added_by: user.id,
        }); } catch {} // Ignore if already exists
      }

      // Remove new owner from collaborators (they're now the owner)
      try { await supabase.from("ticket_collaborators").delete()
        .eq("ticket_id", ticket.id).eq("user_id", transferTargetId); } catch {}

      await supabase.from("ticket_activity").insert({
        ticket_id: ticket.id, actor_id: user.id, action: "ownership_transferred",
        from_value: oldOwnerId ? { old_owner_id: oldOwnerId } : null,
        to_value: { new_owner_id: transferTargetId },
      });

      toast.success("Ownership transferred");
      setShowTransferOwnershipDialog(false);
      setTransferTargetId("");
      refresh();
    } catch (err: any) {
      toast.error(err.message || "Transfer failed");
    }
  };

  const handleAddComment = async () => {
    if (!comment.trim() || !user || !ticket) return;
    setSubmitting(true);
    const { data: newComment, error } = await supabase.from("ticket_comments").insert({
      ticket_id: ticket.id, author_id: user.id, body: comment,
    }).select().single();
    if (error) { toast.error(error.message); setSubmitting(false); return; }

    for (const img of commentImages) {
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
          comment_id: newComment.id,
          is_inline: true,
        });
      }
    }

    const mentionMatches = comment.match(/@(\w+)/g);
    if (mentionMatches && mentionMatches.length > 0) {
      const mentionedFirstNames = mentionMatches.map((m) => m.slice(1).toLowerCase());
      const mentionedUserIds = mentionUsers
        .filter((u) => {
          const firstName = (u.full_name || u.email || "").split(" ")[0].toLowerCase();
          return mentionedFirstNames.includes(firstName);
        })
        .map((u) => u.id)
        .filter((uid) => uid !== user.id);

      for (const uid of mentionedUserIds) {
        await supabase.from("notifications").insert({
          user_id: uid,
          type: "mention",
          title: `You were mentioned in ${ticket.ticket_no}`,
          body: `${user.id === ticket.requester_id ? "Requester" : "Team member"} mentioned you: "${comment.slice(0, 100)}"`,
          link: `/tickets/${ticket.id}`,
        });
      }
    }

    setComment("");
    clearCommentDraft();
    setCommentImages([]);
    toast.success("Comment added");
    if (user) trackActivity(user.id, ANALYTICS_EVENTS.REPLIED_TICKET.module, ANALYTICS_EVENTS.REPLIED_TICKET.event, "ticket", ticket?.id);
    refresh();
    setSubmitting(false);
  };

  const handleDeleteTicket = async () => {
    if (!ticket || !user) return;
    setDeleting(true);
    try {
      await supabase.from("ticket_survey").delete().eq("ticket_id", ticket.id);
      await supabase.from("ticket_attachments").delete().eq("ticket_id", ticket.id);
      await supabase.from("ticket_comments").delete().eq("ticket_id", ticket.id);
      await supabase.from("ticket_activity").delete().eq("ticket_id", ticket.id);
      await supabase.from("ticket_collaborators").delete().eq("ticket_id", ticket.id);
      await supabase.from("ticket_assignees").delete().eq("ticket_id", ticket.id);
      await supabase.from("ticket_departments").delete().eq("ticket_id", ticket.id);
      await supabase.from("tickets").update({ merged_into_id: null }).eq("merged_into_id", ticket.id);
      const { error } = await supabase.from("tickets").delete().eq("id", ticket.id);
      if (error) throw error;
      toast.success("Ticket permanently deleted");
      navigate("/");
    } catch (err: any) {
      toast.error(err.message || "Failed to delete ticket");
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleClosureYes = async () => {
    if (!ticket || !user) return;
    const oldStatus = ticket.status;
    const closedAtIso = new Date().toISOString();
    const due = new Date(ticket.sla_due_at);
    const closedDate = new Date(closedAtIso);
    let finalOverdue = 0;
    if (closedDate > due) {
      const { getBusinessTimeDiffMs } = await import("@/lib/sla-utils");
      finalOverdue = Math.abs(getBusinessTimeDiffMs(due, closedDate)) / 1000;
    }
    await supabase.from("tickets").update({
      status: "closed",
      closure_confirmation_status: "resolved_yes",
      closure_confirmed_at: closedAtIso,
      closed_at: closedAtIso,
      closed_by: user.id,
      final_overdue_seconds: finalOverdue,
    } as any).eq("id", ticket.id);
    await supabase.from("ticket_activity").insert({
      ticket_id: ticket.id, actor_id: user.id, action: "closure_yes",
    });
    await supabase.from("ticket_activity").insert({
      ticket_id: ticket.id, actor_id: user.id, action: "status_changed",
      from_value: { status: oldStatus }, to_value: { status: "closed" },
    });
    setShowCloseConfirm(false);
    const resolverId = (ticket as any)?.primary_assignee_id || ticket.assignee_id;
    const isSelfHandled = ticket.requester_id === resolverId || ticket.requester_id === user.id && resolverId == null;
    const isRequester = ticket.requester_id === user.id;
    if (isSelfHandled) {
      toast.success("Ticket closed successfully.");
      navigate("/tickets");
    } else if (isRequester) {
      // Only the requester should be sent to the satisfaction survey
      toast.success("Thank you! Redirecting to survey...");
      navigate(`/tickets/${ticket.id}/survey`);
    } else {
      // Owner/assignee/admin closing on behalf — stay on ticket detail
      toast.success("Ticket closed successfully.");
      navigate(`/tickets/${ticket.id}`, { replace: true });
    }
  };

  const handleRequesterResolve = () => {
    setShowCloseConfirm(true);
  };

  const handleClosureNo = async () => {
    if (!ticket || !user || !reopenReason.trim()) return;

    // Use server-side RPC for secure, centralized reopen logic
    const { data, error } = await supabase.rpc("reopen_ticket", {
      _ticket_id: ticket.id,
      _reason: reopenReason.trim(),
    });

    if (error) {
      const msg = error.message?.includes("requester")
        ? "Only the ticket requester can reopen this ticket."
        : error.message;
      toast.error(msg);
      return;
    }

    // Notify owner and collaborators (client-side, since DB trigger on activity already covers assignees)
    const notifyUserIds = new Set<string>();
    if (primaryAssigneeId && primaryAssigneeId !== user.id) notifyUserIds.add(primaryAssigneeId);
    for (const tc of ticketCollaborators || []) {
      if (tc.user_id !== user.id) notifyUserIds.add(tc.user_id);
    }
    for (const ta of ticketAssignees || []) {
      if (ta.user_id !== user.id) notifyUserIds.add(ta.user_id);
    }
    const requesterName = (ticket as any).requester?.full_name || "Requester";
    for (const uid of notifyUserIds) {
      await supabase.from("notifications").insert({
        user_id: uid,
        type: "ticket_reopened",
        title: `${ticket.ticket_no} reopened`,
        body: `${requesterName} reopened the ticket: "${reopenReason.slice(0, 100)}"`,
        link: `/tickets/${ticket.id}`,
        actor_id: user.id,
      });
    }

    setShowReopenDialog(false);
    setReopenReason("");
    toast.success("Ticket reopened");
    refresh();
  };

  const handleSlaDueChange = async () => {
    if (!ticket || !user || !newSlaDue) return;
    const oldSlaDue = ticket.sla_due_at;
    const newSlaDueIso = new Date(newSlaDue).toISOString();
    const { error } = await supabase.from("tickets").update({ sla_due_at: newSlaDueIso }).eq("id", ticket.id);
    if (error) { toast.error(error.message); return; }
    await supabase.from("ticket_activity").insert({
      ticket_id: ticket.id, actor_id: user.id, action: "sla_due_changed",
      from_value: { sla_due_at: oldSlaDue },
      to_value: { sla_due_at: newSlaDueIso },
    });
    setEditingSla(false);
    toast.success("SLA due date updated");
    refresh();
  };

  const handleUnmerge = async (childTicketId: string, childTicketNo: string) => {
    if (!ticket || !user) return;
    try {
      const { error: updateErr } = await supabase
        .from("tickets")
        .update({
          merged_into_id: null,
          status: "open" as any,
          closed_at: null,
          closed_by: null,
        })
        .eq("id", childTicketId);
      if (updateErr) throw updateErr;

      await supabase.from("ticket_activity").insert({
        ticket_id: ticket.id,
        actor_id: user.id,
        action: "ticket_unmerged",
        to_value: { unmerged_ticket_id: childTicketId, unmerged_ticket_no: childTicketNo },
      });

      await supabase.from("ticket_activity").insert({
        ticket_id: childTicketId,
        actor_id: user.id,
        action: "unmerged_from",
        to_value: { parent_ticket_id: ticket.id, parent_ticket_no: ticket.ticket_no },
      });

      toast.success(`${childTicketNo} has been unmerged and reopened`);
      refresh();
    } catch (e: any) {
      toast.error(e.message || "Failed to unmerge ticket");
    }
  };

  if (isLoading) return <div className="flex items-center justify-center py-20 text-muted-foreground">Loading...</div>;
  if (!ticket) return <div className="text-center py-20 text-muted-foreground">Ticket not found</div>;

  // Build a map of user involvement for the collaborator modal
  const userTicketRole = (() => {
    const map = new Map<string, string>();
    if (primaryAssigneeId) map.set(primaryAssigneeId, "Already owner");
    if (ticket.requester_id && !map.has(ticket.requester_id)) map.set(ticket.requester_id, "Requester");
    for (const tc of ticketCollaborators || []) {
      if (!map.has(tc.user_id)) map.set(tc.user_id, "Already collaborator");
    }
    for (const ta of ticketAssignees || []) {
      if (!map.has(ta.user_id)) map.set(ta.user_id, "Already assigned");
    }
    return map;
  })();

  // All active users for the modal (show everyone, disable involved ones)
  const allActiveUsers = (allProfiles || []).filter((p) => p.is_active);
  const filteredCollaborators = collabSearch.trim()
    ? allActiveUsers.filter((p) => {
        const q = collabSearch.trim().toLowerCase();
        return (p.full_name || "").toLowerCase().includes(q) || (p.email || "").toLowerCase().includes(q);
      })
    : allActiveUsers;
  // Button visibility: show if there are users not yet involved
  const availableToAdd = allActiveUsers.filter((p) => !userTicketRole.has(p.id));
  const availableForOwnership = deptMembers?.filter((m) => m.user_id !== primaryAssigneeId) || [];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Closure prompt */}
      {showClosurePrompt && (
        <Card className="border-warning/50 bg-warning/5">
          <CardContent className="flex items-center justify-between py-4">
            <p className="font-medium">The owner marked this ticket as resolved. Please confirm — is this resolved?</p>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => { setShowCloseConfirm(true); }}>Yes, resolved</Button>
              <Button size="sm" variant="outline" onClick={() => setShowReopenDialog(true)}>No, reopen</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Merged child banner */}
      {isMergedChild && (
        <Card className="border-blue-300 bg-blue-50 dark:bg-blue-950/20">
          <CardContent className="flex items-center gap-3 py-3">
            <Merge className="h-4 w-4 text-blue-600" />
            <p className="text-sm">This ticket has been merged into another ticket.</p>
            <Link to={`/tickets/${ticket.merged_into_id}`} className="text-sm text-primary underline flex items-center gap-1">
              View parent ticket <ExternalLink className="h-3 w-3" />
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Back button */}
      <Button
        variant="ghost"
        size="sm"
        className="gap-1.5 -ml-2 text-muted-foreground hover:text-foreground w-fit"
        onClick={() => navigate(-1)}
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </Button>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 -mt-2">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <span className="font-mono text-sm text-muted-foreground">{ticket.ticket_no}</span>
            <StatusBadge status={ticket.status} />
            <PriorityBadge priority={ticket.priority} />
          </div>
          <h1 className="text-2xl font-bold">{ticket.title}</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Requester can mark as resolved directly */}
          {isRequester && ticket.status !== "closed" && ticket.status !== "for_review" && !isMergedChild && (
            <Button size="sm" variant="default" onClick={handleRequesterResolve}>
              ✓ Mark as Resolved
            </Button>
          )}
          {/* Owner can also mark as resolved directly */}
          {isOwner && !isRequester && ticket.status !== "closed" && ticket.status !== "for_review" && !isMergedChild && (
            <Button size="sm" variant="default" onClick={handleRequesterResolve}>
              ✓ Mark as Resolved
            </Button>
          )}
          {(isOwner || isAssignee) && ticket.status !== "closed" && !isMergedChild && (
            <Button size="sm" variant="outline" onClick={() => setShowMergeDialog(true)}>
              <Merge className="h-4 w-4 mr-1" /> Merge
            </Button>
          )}
          {/* Requester can reopen closed tickets */}
          {isRequester && ticket.status === "closed" && !isMergedChild && (
            <Button size="sm" variant="outline" onClick={() => setShowReopenDialog(true)}>
              🔄 Reopen Ticket
            </Button>
          )}
          {isSuperAdmin && (
            <Button size="sm" variant="destructive" onClick={() => setShowDeleteConfirm(true)}>
              <Trash2 className="h-4 w-4 mr-1" /> Delete
            </Button>
          )}
          {<SLACountdown slaDueAt={ticket.sla_due_at} slaBreachedAt={ticket.sla_breached_at} closedAt={ticket.closed_at} finalOverdueSeconds={(ticket as any).final_overdue_seconds} status={ticket.status} />}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-sm">Description</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-wrap break-words overflow-hidden">{ticket.description}</p>
              <InlineImages ticketId={ticket.id} />
            </CardContent>
          </Card>

          {ticket.critical_justification && (
            <Card className="border-destructive/30">
              <CardHeader><CardTitle className="text-sm text-destructive">Critical Justification</CardTitle></CardHeader>
              <CardContent><p className="text-sm break-words whitespace-pre-wrap overflow-hidden">{ticket.critical_justification}</p></CardContent>
            </Card>
          )}

          {/* Merged Tickets */}
          {mergedTickets && mergedTickets.length > 0 && (
             <Card>
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Merge className="h-4 w-4" /> Merged Tickets ({mergedTickets.length})</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {mergedTickets.map((mt) => (
                    <div key={mt.id} className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <span className="font-mono text-xs text-muted-foreground mr-2">{mt.ticket_no}</span>
                        <span className="text-sm font-medium break-words">{mt.title}</span>
                        <p className="text-xs text-muted-foreground">By {(mt.requester as any)?.full_name || "Unknown"}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {canManage && ticket.status !== "closed" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs px-2 text-muted-foreground hover:text-destructive"
                            onClick={() => handleUnmerge(mt.id, mt.ticket_no)}
                          >
                            <Unlink className="h-3 w-3 mr-1" /> Unmerge
                          </Button>
                        )}
                        <Link to={`/tickets/${mt.id}`} className="text-xs text-primary hover:underline">View</Link>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Attachments */}
          <TicketAttachments ticketId={ticket.id} canUpload={isRequester || canManage || canCollaborate} canManage={canManage || isOwner} />

          {/* Comments */}
          <Card>
            <CardHeader><CardTitle className="text-sm flex items-center gap-2"><MessageSquare className="h-4 w-4" /> Comments</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {comments?.map((c) => (
                <div key={c.id} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">{c.author?.full_name || "System"}</span>
                    <span className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(c.created_at!), { addSuffix: true })}</span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap break-words overflow-hidden">
                    {renderMentions(c.body)}
                  </p>
                  <InlineImages ticketId={ticket.id} commentId={c.id} />
                </div>
              ))}
              <div className="flex gap-2">
                <div className="flex-1">
                  <PasteableTextarea
                    value={comment}
                    onChange={setComment}
                    pastedImages={commentImages}
                    onPastedImagesChange={setCommentImages}
                    placeholder="Add a comment... (type @ to mention)"
                    rows={2}
                    mentionUsers={mentionUsers}
                  />
                </div>
                <Button onClick={handleAddComment} disabled={submitting || !comment.trim()} size="sm" className="self-end">Send</Button>
              </div>
            </CardContent>
          </Card>

          {/* Activity */}
          <Card>
            <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Activity className="h-4 w-4" /> Activity</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {activity?.map((a) => (
                  <div key={a.id} className="flex items-start gap-3 text-sm">
                    <div className="h-2 w-2 rounded-full bg-primary mt-1.5 shrink-0" />
                    <div className="flex-1">
                      <span className="font-medium">{a.actor?.full_name || "System"}</span>{" "}
                      <span className="text-muted-foreground">
                        {formatActivityAction(a.action, a.from_value, a.to_value, allProfiles, departments)}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">{formatDistanceToNow(new Date(a.created_at!), { addSuffix: true })}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-4 space-y-4">
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Requester:</span>
                  <span className="font-medium">{ticket.requester?.full_name}</span>
                </div>

                {/* Merged ticket requesters */}
                {mergedTickets && mergedTickets.length > 0 && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Merged Requesters:</span>
                    </div>
                    <div className="pl-6 space-y-0.5">
                      {mergedTickets.map((mt) => (
                        <div key={mt.id} className="flex items-center gap-1.5 text-sm">
                          <span className="font-medium">{(mt.requester as any)?.full_name || "Unknown"}</span>
                          <span className="text-xs text-muted-foreground">({mt.ticket_no})</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Departments */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">
                        {ticketDepartments && ticketDepartments.length > 1 ? "Departments:" : "Department:"}
                      </span>
                    </div>
                    {canManage && (ticket.status === "open" || ticket.status === "in_progress") && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-xs px-2"
                        onClick={() => setShowEditDeptDialog(true)}
                      >
                        Edit
                      </Button>
                    )}
                  </div>
                  <div className="pl-6 space-y-0.5">
                    {ticketDepartments && ticketDepartments.length > 0 ? (
                      ticketDepartments.map((td) => (
                        <span key={td.id} className="block text-sm font-medium">
                          {(td as any).department?.name || "Unknown"}
                        </span>
                      ))
                    ) : (
                      <span className="text-sm font-medium">{ticket.departments?.name}</span>
                    )}
                  </div>
                </div>

                {/* Owner (Primary Assignee) */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-sm">
                    <Crown className="h-4 w-4 text-amber-500" />
                    <span className="text-muted-foreground">Owner:</span>
                  </div>
                  <div className="pl-6 space-y-1">
                    {ownerProfile ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex items-center gap-1.5">
                              <Crown className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                              <span className="text-sm font-medium">{ownerProfile.full_name || ownerProfile.email}</span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Ticket Owner – Responsible for resolving this ticket</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : (
                      <span className="text-sm text-muted-foreground">No owner assigned</span>
                    )}
                    {/* Transfer ownership button */}
                    {(isOwner || canManage) && ticket.status !== "closed" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs px-2 mt-1"
                        onClick={() => setShowTransferOwnershipDialog(true)}
                      >
                        <ArrowRightLeft className="h-3 w-3 mr-1" /> Change Owner
                      </Button>
                    )}
                  </div>
                </div>

                {/* Assigned Members (from departments/assignees, excluding owner & collaborators) */}
                {(() => {
                  const collabUserIds = new Set((ticketCollaborators || []).map((tc) => tc.user_id));
                  const assignedMembers = (ticketAssignees || []).filter(
                    (ta) => ta.user_id !== primaryAssigneeId && !collabUserIds.has(ta.user_id)
                  );
                  console.log("[TicketDetail] Assigned members (non-owner, non-collab):", assignedMembers.map((a) => ({ id: a.user_id, name: (a as any).profile?.full_name })));
                  console.log("[TicketDetail] Collaborators:", (ticketCollaborators || []).map((tc) => ({ id: tc.user_id, name: (tc as any).profile?.full_name })));
                  console.log("[TicketDetail] Owner:", primaryAssigneeId, ownerProfile?.full_name);
                  if (assignedMembers.length === 0) return null;
                  return (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 text-sm">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Assigned Members:</span>
                      </div>
                      <div className="pl-6 space-y-1">
                        {assignedMembers.map((ta) => (
                          <div key={ta.id} className="flex items-center gap-1.5">
                            <User className="h-3 w-3 text-blue-500 shrink-0" />
                            <span className="text-sm font-medium">{(ta as any).profile?.full_name || (ta as any).profile?.email || "Unknown"}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Collaborators */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-sm">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Collaborators:</span>
                  </div>
                  <div className="pl-6 space-y-1">
                    {(!ticketCollaborators || ticketCollaborators.length === 0) ? (
                      <span className="text-sm text-muted-foreground">No collaborators</span>
                    ) : (
                      ticketCollaborators.map((tc) => (
                        <div key={tc.id} className="flex items-center gap-1.5 group">
                          {(isOwner || canManage) && ticket.status !== "closed" && (
                            <button
                              onClick={() => handleRemoveCollaborator(tc.user_id)}
                              className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                              title="Remove collaborator"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                          <User className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span className="text-sm font-medium">{(tc as any).profile?.full_name || "Unknown"}</span>
                        </div>
                      ))
                    )}
                    {/* Add collaborator button */}
                    {(isOwner || canManage) && ticket.status !== "closed" && availableToAdd.length > 0 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs px-2 mt-1"
                        onClick={() => setShowAddCollaboratorDialog(true)}
                      >
                        <UserPlus className="h-3 w-3 mr-1" /> Add Collaborator
                      </Button>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Created:</span>
                  <span className="text-xs">{format(new Date(ticket.created_at!), "PPp")}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">SLA Due:</span>
                  {editingSla ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="datetime-local"
                        className="text-xs border rounded px-1 py-0.5 bg-background"
                        value={newSlaDue}
                        onChange={(e) => setNewSlaDue(e.target.value)}
                      />
                      <Button size="sm" variant="ghost" className="h-6 text-xs px-1" onClick={handleSlaDueChange}>Save</Button>
                      <Button size="sm" variant="ghost" className="h-6 text-xs px-1" onClick={() => setEditingSla(false)}>Cancel</Button>
                    </div>
                  ) : (
                    <>
                      <span className="text-xs">{format(new Date(ticket.sla_due_at), "PPp")}</span>
                      {(isRequester || isOwner || isAssignee) && ticket.status !== "closed" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-5 text-xs px-1"
                          onClick={() => {
                            const d = new Date(ticket.sla_due_at);
                            const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
                            setNewSlaDue(local);
                            setEditingSla(true);
                          }}
                        >
                          Edit
                        </Button>
                      )}
                    </>
                  )}
                </div>

                {/* SLA Status Detail */}
                {(() => {
                  const sla = computeSlaStatus(
                    ticket.sla_due_at,
                    ticket.closed_at,
                    ticket.sla_breached_at,
                    (ticket as any).final_overdue_seconds,
                    ticket.status,
                  );
                  return (
                    <div className="rounded-md border p-2.5 space-y-1.5 bg-muted/30">
                      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">SLA Status</div>
                      <SLACountdown
                        slaDueAt={ticket.sla_due_at}
                        slaBreachedAt={ticket.sla_breached_at}
                        closedAt={ticket.closed_at}
                        finalOverdueSeconds={(ticket as any).final_overdue_seconds}
                        status={ticket.status}
                        compact={false}
                      />
                      {sla.overdueSeconds > 0 && (
                        <div className="text-xs text-muted-foreground">
                          Overdue duration: <span className="font-medium text-destructive">{formatOverdueDuration(sla.overdueSeconds)}</span>
                        </div>
                      )}
                      {ticket.closed_at && (
                        <div className="text-xs text-muted-foreground">
                          Resolved at: {format(new Date(ticket.closed_at), "PPp")}
                        </div>
                      )}
                    </div>
                  );
                })()}
                {ticket.reopened_count > 0 && (
                  <div className="text-xs text-destructive font-medium">Reopened {ticket.reopened_count} time(s)</div>
                )}
              </div>

              {(canManage || canCollaborate) && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Status</label>
                      <Select value={ticket.status} onValueChange={(v) => handleStatusChange(v as Status)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="open">Open</SelectItem>
                          <SelectItem value="in_progress">In Progress</SelectItem>
                          <SelectItem value="blocked">Blocked</SelectItem>
                          <SelectItem value="for_review">Resolved</SelectItem>
                          {canClose && <SelectItem value="closed">Closed</SelectItem>}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Resolution notes dialog */}
      <Dialog open={showResolutionDialog} onOpenChange={(open) => { setShowResolutionDialog(open); if (!open) setResolutionNotes(""); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>How was this issue resolved?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Please describe how the issue was resolved before marking this ticket as Resolved. This is required.</p>
          <Textarea
            value={resolutionNotes}
            onChange={(e) => setResolutionNotes(e.target.value)}
            rows={4}
            placeholder="Describe the resolution (e.g., steps taken, root cause, fix applied)..."
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowResolutionDialog(false); setResolutionNotes(""); }}>Cancel</Button>
            <Button onClick={handleSubmitResolution} disabled={!resolutionNotes.trim()}>Mark as Resolved</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm closure dialog */}
      <Dialog open={showCloseConfirm} onOpenChange={setShowCloseConfirm}>
        <DialogContent>
          <DialogHeader><DialogTitle>Confirm Resolution</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Are you sure this ticket is resolved? You'll be redirected to a satisfaction survey.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCloseConfirm(false)}>Cancel</Button>
            <Button onClick={handleClosureYes}>Yes, it's resolved</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reopen dialog */}
      <Dialog open={showReopenDialog} onOpenChange={setShowReopenDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reopen Ticket</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This will move the ticket back to Open so the team can continue working on it.</p>
          <Textarea value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} rows={3} placeholder="Reason for reopening..." />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReopenDialog(false)}>Cancel</Button>
            <Button onClick={handleClosureNo} disabled={!reopenReason.trim()}>Reopen Ticket</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add collaborator dialog */}
      <Dialog open={showAddCollaboratorDialog} onOpenChange={(open) => { setShowAddCollaboratorDialog(open); if (!open) { setSelectedNewCollaborators([]); setCollabSearch(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Collaborators</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Collaborators can comment, upload files, and assist in resolving the ticket.</p>
          <input
            type="text"
            placeholder="Search by name or email..."
            value={collabSearch}
            onChange={(e) => setCollabSearch(e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {filteredCollaborators.length === 0 && (
              <p className="text-sm text-muted-foreground py-2 text-center">No users found</p>
            )}
            {filteredCollaborators.slice(0, 50).map((p) => {
              const existingRole = userTicketRole.get(p.id);
              const isDisabled = !!existingRole;
              return (
                <div key={p.id} className={`flex items-center gap-2 py-1.5 px-1 rounded ${isDisabled ? "opacity-60" : "hover:bg-accent/50"}`}>
                  <Checkbox
                    id={`add-${p.id}`}
                    checked={selectedNewCollaborators.includes(p.id)}
                    disabled={isDisabled}
                    onCheckedChange={(checked) => {
                      setSelectedNewCollaborators((prev) =>
                        checked ? [...prev, p.id] : prev.filter((uid) => uid !== p.id)
                      );
                    }}
                  />
                  <Label htmlFor={`add-${p.id}`} className={`text-sm flex-1 min-w-0 ${isDisabled ? "" : "cursor-pointer"}`}>
                    <span className="font-medium">{p.full_name || p.email || p.id}</span>
                    {p.job_title && <span className="text-muted-foreground ml-1">· {p.job_title}</span>}
                    {p.departments.length > 0 && (
                      <span className="ml-1.5 text-xs text-muted-foreground">({p.departments.join(", ")})</span>
                    )}
                    {existingRole && (
                      <span className="ml-2 text-xs font-medium text-primary/70 bg-primary/10 px-1.5 py-0.5 rounded">{existingRole}</span>
                    )}
                  </Label>
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddCollaboratorDialog(false)}>Cancel</Button>
            <Button onClick={handleAddCollaborators} disabled={selectedNewCollaborators.length === 0}>
              Add {selectedNewCollaborators.length > 0 ? `(${selectedNewCollaborators.length})` : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transfer ownership dialog */}
      <Dialog open={showTransferOwnershipDialog} onOpenChange={(open) => { setShowTransferOwnershipDialog(open); if (!open) setTransferTargetId(""); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Transfer Ownership</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Select a team member to become the new ticket owner. The current owner will become a collaborator.</p>
          <Select value={transferTargetId} onValueChange={setTransferTargetId}>
            <SelectTrigger><SelectValue placeholder="Select new owner" /></SelectTrigger>
            <SelectContent>
              {availableForOwnership.map((m) => (
                <SelectItem key={m.user_id} value={m.user_id}>
                  {m.profile?.full_name || m.profile?.email || m.user_id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTransferOwnershipDialog(false)}>Cancel</Button>
            <Button onClick={handleTransferOwnership} disabled={!transferTargetId}>Transfer Ownership</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Merge dialog */}
      <MergeTicketDialog
        open={showMergeDialog}
        onOpenChange={setShowMergeDialog}
        parentTicketId={ticket.id}
        departmentId={ticket.department_id}
        onMerged={refresh}
      />

      {/* Delete confirmation dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader><DialogTitle>Permanently Delete Ticket</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to permanently delete <strong>{ticket.ticket_no}</strong>? This will remove all comments, activity, attachments, and survey data. This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteTicket} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete Permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Departments dialog */}
      {ticket && (
        <EditDepartmentsDialog
          open={showEditDeptDialog}
          onOpenChange={setShowEditDeptDialog}
          ticketId={ticket.id}
          currentDepartmentIds={ticketDepartments?.map((td) => td.department_id) || [ticket.department_id]}
          currentAssigneeIds={ticketAssignees?.map((ta) => ta.user_id) || []}
          userId={user!.id}
          onSaved={refresh}
        />
      )}
    </div>
  );
}
